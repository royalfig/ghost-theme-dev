import * as esbuild from "esbuild";
import chalk from "chalk";
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { basename } from "node:path";
import { transform, browserslistToTargets } from "lightningcss";
import browserslist from "browserslist";
import { formatBytes, GtbConfig, logToFile, findEntryPoints } from "./utils.js";
import { EXTERNAL_ASSETS } from "./constants.js";
import { clientScript } from "./client.js";

// Browserslist browser name → esbuild engine name (unmapped browsers are skipped)
const BROWSERSLIST_TO_ESBUILD: Record<string, string> = {
  edge: "edge",
  firefox: "firefox",
  chrome: "chrome",
  safari: "safari",
  ios_saf: "ios",
  node: "node",
  ie: "ie",
  opera: "opera",
  android: "chrome",
  and_chr: "chrome",
  and_ff: "firefox",
};

function browserslistToEsbuildTargets(browsers: string[]): string[] {
  const targets: string[] = [];
  for (const entry of browsers) {
    const idx = entry.lastIndexOf(" ");
    if (idx === -1) continue;
    const engine = BROWSERSLIST_TO_ESBUILD[entry.slice(0, idx)];
    if (!engine) continue;
    // Normalize: take lower bound of ranges ("13.4-13.7" → "13.4"), "all" → "1"
    const version = entry
      .slice(idx + 1)
      .replace(/-[\d.]+$/, "")
      .replace("all", "1");
    if (!/^\d+(\.\d+)*$/.test(version)) continue;
    targets.push(`${engine}${version}`);
  }
  return targets;
}

// Resolved on first build rather than at import, so commands that never build
// (check, lint, doctor, deploy credentials errors) don't pay for browserslist.
let browserTargets: { css: ReturnType<typeof browserslistToTargets>; js: string[] } | null = null;
function getTargets() {
  if (!browserTargets) {
    const query = browserslist("baseline widely available");
    browserTargets = {
      css: browserslistToTargets(query),
      js: browserslistToEsbuildTargets(query),
    };
  }
  return browserTargets;
}

export interface BuildResult {
  file: string;
  value: string;
}

/** A build error or warning, formatted for the terminal (`pretty`) and the browser (`text`). */
export interface BuildProblem {
  file?: string;
  text: string;
  pretty: string;
}

export interface CompilationDetails {
  results: BuildResult[];
  time: number;
  /** Output files written, e.g. `assets/built/css/index.css` (source maps excluded). */
  outputs?: string[];
  errors?: BuildProblem[];
  warnings?: BuildProblem[];
  /** True when default.hbs was rewritten with different content. */
  templateChanged?: boolean;
}

export interface WriteAssetsOptions {
  /** Re-render default.hbs even if no critical asset was rebuilt. */
  renderTemplate?: boolean;
}

/**
 * Source file → every entry point whose bundle includes it. A partial
 * imported by several entries (e.g. by both critical and main CSS) maps to
 * all of them, so a change rebuilds each one.
 */
export const tree = new Map<string, Set<string>>();

export function dependentsOf(path: string): string[] {
  return [...(tree.get(path) ?? [])];
}

function recordInputs(entryPoint: string, inputs: string[]) {
  for (const dependents of tree.values()) dependents.delete(entryPoint);
  for (const input of inputs) {
    let dependents = tree.get(input);
    if (!dependents) {
      dependents = new Set();
      tree.set(input, dependents);
    }
    dependents.add(entryPoint);
  }
  for (const [input, dependents] of tree) {
    if (dependents.size === 0) tree.delete(input);
  }
}

const SOURCE_MAP_COMMENT = /\n?(\/\/# sourceMappingURL=[^\n]*|\/\*# sourceMappingURL=[^*]*\*\/)\s*$/;

/** Inlined code must not open a Handlebars expression. `\{{` renders a literal `{{`. */
function escapeHandlebars(code: string): string {
  return code.replace(/\{\{/g, "\\{{");
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

/** Attribute on inlined critical `<style>` blocks during `gtb dev`. */
export const CRITICAL_ATTR = "data-gtb-critical";

/**
 * The CSS of a built critical stylesheet as it is inlined into default.hbs
 * (without the source map comment), for hot-swapping it in the browser.
 */
export async function readCriticalCss(outputPath: string): Promise<string> {
  return (await readOptional(outputPath)).replace(SOURCE_MAP_COMMENT, "");
}

function getCriticalDirs(builtDir: string): string[] {
  const dirs = new Set<string>();
  for (const kind of ["css", "js"]) {
    try {
      readdirSync(`${builtDir}/${kind}/critical`, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .forEach((d) => dirs.add(d.name));
    } catch {
      /* no critical dir of this kind */
    }
  }
  return [...dirs];
}

/**
 * Renders default-template.hbs to default.hbs: inlines critical CSS and JS
 * and, during `gtb dev`, appends the live-reload client.
 *
 * Writes only when the output differs from what is on disk, so the watcher
 * never sees a no-op change. Returns whether default.hbs changed.
 */
export async function inlineCritical(
  builtDir = "assets/built",
  templatePath = "default-template.hbs",
  devPort?: number,
  outputPath = "default.hbs",
): Promise<boolean> {
  try {
    let template = await readFile(templatePath, "utf8");

    const targets = ["", ...getCriticalDirs(builtDir).filter((d) => d !== "index")];

    for (const dir of targets) {
      const sub = dir ? `${dir}/` : "";
      const label = dir ? ` for ${dir}` : "";

      const cssTag = `<link rel="stylesheet" href="{{asset "built/css/critical/${sub}index.css"}}">`;
      if (template.includes(cssTag)) {
        const css = await readOptional(`${builtDir}/css/critical/${sub}index.css`);
        if (css) {
          // In dev, label the block so the client can swap its contents in place.
          const attr = devPort ? ` ${CRITICAL_ATTR}="built/css/critical/${sub}index.css"` : "";
          const inline = `<style${attr}>${escapeHandlebars(css.replace(SOURCE_MAP_COMMENT, ""))}</style>`;
          template = template.replace(cssTag, () => inline);
          logToFile(`Inlined critical CSS${label}`);
        }
      }

      const jsTag = `<script src="{{asset "built/js/critical/${sub}index.js"}}"></script>`;
      if (template.includes(jsTag)) {
        const js = await readOptional(`${builtDir}/js/critical/${sub}index.js`);
        if (js) {
          const inline = `<script>${escapeHandlebars(js.replace(SOURCE_MAP_COMMENT, ""))}</script>`;
          template = template.replace(jsTag, () => inline);
          logToFile(`Inlined critical JS${label}`);
        }
      }
    }

    if (devPort) {
      const client = clientScript(devPort);
      const bodyClose = template.lastIndexOf("</body>");
      template =
        bodyClose === -1
          ? `${template}\n${client}\n`
          : `${template.slice(0, bodyClose)}${client}\n${template.slice(bodyClose)}`;
    }

    const current = await readOptional(outputPath);
    if (current === template) return false;

    await writeFile(outputPath, template);
    return true;
  } catch (error) {
    console.error(chalk.red("✘  Failed to render default.hbs:"), error);
    return false;
  }
}

async function postProcessCSS(
  cssFiles: string[],
  isWatch: boolean,
): Promise<BuildProblem[]> {
  const problems: BuildProblem[] = [];
  await Promise.all(
    cssFiles.map(async (file) => {
      try {
        const code = await readFile(file);
        // Chain esbuild's map through lightningcss so the final map still
        // points at the original src/ files.
        const inputSourceMap = await readOptional(file + ".map");
        const result = transform({
          filename: file,
          code,
          minify: !isWatch,
          sourceMap: true,
          inputSourceMap: inputSourceMap || undefined,
          targets: getTargets().css,
        });

        let output = Buffer.from(result.code);
        if (result.map) {
          await writeFile(file + ".map", Buffer.from(result.map));
          output = Buffer.concat([
            output,
            Buffer.from(`\n/*# sourceMappingURL=${basename(file)}.map */\n`),
          ]);
        }
        await writeFile(file, output);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logToFile(`CSS post-processing failed for ${file}: ${msg}`);
        problems.push({
          file,
          text: `CSS post-processing failed: ${msg}`,
          pretty: `${chalk.red("✘")}  CSS post-processing failed for ${file}: ${msg}`,
        });
      }
    }),
  );
  return problems;
}

async function toProblems(
  messages: esbuild.Message[],
  kind: "error" | "warning",
): Promise<BuildProblem[]> {
  if (messages.length === 0) return [];
  let pretty: string[] = [];
  try {
    pretty = await esbuild.formatMessages(messages, { kind, color: true });
  } catch {
    /* fall back to plain text below */
  }
  return messages.map((m, i) => {
    const loc = m.location;
    const where = loc ? `${loc.file}:${loc.line}:${loc.column}: ` : "";
    const text = `${where}${m.text}`;
    return { file: loc?.file, text, pretty: pretty[i]?.trimEnd() || text };
  });
}

async function problemsFromFailure(error: unknown): Promise<{ errors: BuildProblem[]; warnings: BuildProblem[] }> {
  const failure = error as Partial<esbuild.BuildFailure>;
  if (Array.isArray(failure?.errors) && failure.errors.length > 0) {
    return {
      errors: await toProblems(failure.errors, "error"),
      warnings: await toProblems(failure.warnings ?? [], "warning"),
    };
  }
  const msg = error instanceof Error ? error.message : String(error);
  return { errors: [{ text: msg, pretty: msg }], warnings: [] };
}

function buildOptions(isWatch: boolean, config?: GtbConfig): esbuild.BuildOptions {
  return {
    bundle: true,
    outbase: "src",
    outdir: "assets/built",
    minify: !isWatch,
    sourcemap: true,
    metafile: true,
    target: getTargets().js,
    external: EXTERNAL_ASSETS,
    // Problems are returned and printed by gtb, after the screen is redrawn.
    logLevel: "silent",
    ...config?.esbuild,
  };
}

// One incremental context per entry point while `gtb dev` runs.
const contexts = new Map<string, esbuild.BuildContext>();

/** Drops the cached build context for an entry that no longer exists. */
export async function forgetEntry(entry: string): Promise<void> {
  const ctx = contexts.get(entry);
  contexts.delete(entry);
  for (const dependents of tree.values()) dependents.delete(entry);
  await ctx?.dispose();
}

export async function disposeContexts(): Promise<void> {
  const all = [...contexts.values()];
  contexts.clear();
  await Promise.allSettled(all.map((c) => c.dispose()));
}

async function runBuilds(
  entryPoints: string[],
  isWatch: boolean,
  config?: GtbConfig,
): Promise<PromiseSettledResult<esbuild.BuildResult>[]> {
  const options = buildOptions(isWatch, config);

  if (!isWatch) {
    return Promise.allSettled([esbuild.build({ ...options, entryPoints })]);
  }

  // Each entry builds on its own so one broken file can't hold back the rest.
  return Promise.allSettled(
    entryPoints.map(async (entry) => {
      let ctx = contexts.get(entry);
      if (!ctx) {
        ctx = await esbuild.context({ ...options, entryPoints: [entry] });
        contexts.set(entry, ctx);
      }
      return ctx.rebuild();
    }),
  );
}

export async function writeAssets(
  entryPoints: string[],
  port: number,
  isWatch: boolean,
  config?: GtbConfig,
  options: WriteAssetsOptions = {},
): Promise<CompilationDetails> {
  const start = performance.now();
  const results: BuildResult[] = [];
  const outputs: string[] = [];
  const cssFiles: string[] = [];
  const errors: BuildProblem[] = [];
  const warnings: BuildProblem[] = [];

  const settled = await runBuilds(entryPoints, isWatch, config);

  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      const problems = await problemsFromFailure(outcome.reason);
      errors.push(...problems.errors);
      warnings.push(...problems.warnings);
      continue;
    }

    const res = outcome.value;
    warnings.push(...(await toProblems(res.warnings ?? [], "warning")));
    if (!res.metafile) continue;

    const inputsByEntry = new Map<string, string[]>();
    for (const [key, value] of Object.entries(res.metafile.outputs)) {
      if (key.endsWith(".map")) continue;
      results.push({ file: key, value: formatBytes(value.bytes) });
      outputs.push(key);
      if (key.endsWith(".css")) cssFiles.push(key);

      const { entryPoint, inputs } = value;
      if (entryPoint && inputs && typeof inputs === "object") {
        const list = inputsByEntry.get(entryPoint) ?? [];
        list.push(...Object.keys(inputs));
        inputsByEntry.set(entryPoint, list);
      }
    }
    for (const [entryPoint, inputs] of inputsByEntry) recordInputs(entryPoint, inputs);
  }

  if (cssFiles.length > 0) {
    errors.push(...(await postProcessCSS(cssFiles, isWatch)));
  }

  if (errors.length > 0) {
    const summary = errors.map((e) => e.text).join("\n");
    logToFile(`Build failed: ${summary}`);
    if (!isWatch) {
      for (const e of errors) console.error(e.pretty);
      throw new Error(`Build failed:\n${summary}`);
    }
  }

  // Production builds always render (stripping any dev client); dev builds
  // only when a critical asset or the layout itself changed.
  const touchesCritical = outputs.some((o) => o.includes("/critical/"));
  let templateChanged = false;
  if (!isWatch || options.renderTemplate || touchesCritical) {
    templateChanged = await inlineCritical(
      "assets/built",
      "default-template.hbs",
      isWatch ? port : undefined,
    );
  }

  return {
    results,
    time: performance.now() - start,
    outputs,
    errors,
    warnings,
    templateChanged,
  };
}

/** Production build of every entry point, as run by `gtb build`, `zip` and `deploy`. */
export async function buildTheme(config?: GtbConfig): Promise<CompilationDetails> {
  const jsEntryPoints = await findEntryPoints("src/js", [".ts", ".js"]);
  const cssEntryPoints = await findEntryPoints("src/css", [".css"]);
  return writeAssets([...jsEntryPoints, ...cssEntryPoints], 0, false, config);
}
