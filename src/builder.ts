import * as esbuild from "esbuild";
import chalk from "chalk";
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { transform, Features, browserslistToTargets } from "lightningcss";
import browserslist from "browserslist";
import { formatBytes, GtbConfig, logToFile } from "./utils.js";
import { EXTERNAL_ASSETS } from "./constants.js";

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
    const version = entry.slice(idx + 1).replace(/-[\d.]+$/, "").replace("all", "1");
    if (!/^\d+(\.\d+)*$/.test(version)) continue;
    targets.push(`${engine}${version}`);
  }
  return targets;
}

const BROWSERSLIST_QUERY = browserslist("defaults");
const BROWSER_TARGETS = browserslistToTargets(BROWSERSLIST_QUERY);
const ESBUILD_TARGETS = browserslistToEsbuildTargets(BROWSERSLIST_QUERY);

export interface BuildResult {
  file: string;
  value: string;
}

export interface CompilationDetails {
  results: BuildResult[];
  time: number;
}

export const tree = new Map<string, string>();

export async function inlineCritical(criticalDir = "assets/built", templatePath = "default-template.hbs") {
  try {
    let defaultTemplate = await readFile(templatePath, "utf8");

    // Always process the default index.css path
    let cssContent = "";
    try {
      cssContent = await readFile(`${criticalDir}/css/critical/index.css`, "utf8");
    } catch (e) { /* ignore */ }

    if (cssContent) {
      const cssTag = `<link rel="stylesheet" href="{{asset "built/css/critical/index.css"}}">`;
      if (defaultTemplate.includes(cssTag)) {
        defaultTemplate = defaultTemplate.replace(
          cssTag,
          `<style>${cssContent}</style>`,
        );
        console.log(chalk.blue("⬥"), " Inlined critical CSS");
      }
    }

    // Scan for additional critical directories (e.g. home, post)
    const dirs = getCriticalDirs(criticalDir);

    for (const dir of dirs) {
      if (dir === "index") continue;

      let dirCss = "";
      try {
        dirCss = await readFile(`${criticalDir}/css/critical/${dir}/index.css`, "utf8");
      } catch (e) { /* ignore */ }

      if (dirCss) {
        const cssTag = `<link rel="stylesheet" href="{{asset "built/css/critical/${dir}/index.css"}}">`;
        if (defaultTemplate.includes(cssTag)) {
          defaultTemplate = defaultTemplate.replace(
            cssTag,
            `<style>${dirCss}</style>`,
          );
          console.log(chalk.blue("⬥"), ` Inlined critical CSS for ${dir}`);
        }
      }
    }

    await writeFile("default.hbs", defaultTemplate);
  } catch (error) {
    console.error(chalk.red("✘  Failed to inline critical assets:"), error);
  }
}

async function postProcessCSS(cssFiles: string[], isWatch: boolean): Promise<void> {
  await Promise.all(cssFiles.map(async (file) => {
    try {
      const code = await readFile(file);
      const result = transform({
        filename: file,
        code,
        minify: !isWatch,
        sourceMap: true,
        targets: BROWSER_TARGETS,
        include: Features.Nesting | Features.MediaQueries | Features.Colors | Features.VendorPrefixes,
      });

      await writeFile(file, result.code);

      if (result.map) {
        const mapContent = result.map instanceof Uint8Array
          ? Buffer.from(result.map)
          : JSON.stringify(typeof result.map === "object" ? result.map : {});
        await writeFile(file + ".map", mapContent);
      }
    } catch (e) {
      console.error(chalk.red("✘  CSS post-processing failed for"), file);
      logToFile(`CSS post-processing failed for ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }));
}

function getCriticalDirs(criticalDir: string): string[] {
  const cssDir = `${criticalDir}/css/critical`;
  let entries: string[];

  try {
    entries = readdirSync(cssDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }

  // Deduplicate with js dir entries
  try {
    const jsEntries = readdirSync(`${criticalDir}/js/critical`, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    return [...new Set([...entries, ...jsEntries])];
  } catch {
    return entries;
  }
}

export async function writeAssets(
  entryPoints: string[],
  port: number,
  isWatch: boolean,
  config?: GtbConfig,
): Promise<CompilationDetails> {
  const start = performance.now();
  const footerScript = `const socket = new WebSocket('ws://localhost:${port}');
  socket.addEventListener("open", (event) => {
      const url = window.location.href;
      const title = document.title;
      const version = document.querySelector('meta[name="generator"]')?.getAttribute("content");
      const msg = JSON.stringify({url, title, version});
      socket.send(msg)
  });
  socket.onmessage = function(event) {
      if (event.data.includes('changed')) {
        const data = event.data;
        if (data.includes('.css')) {
            // CSS Hot Injection
            const links = document.querySelectorAll('link[rel="stylesheet"]');
            for (const link of links) {
                const url = new URL(link.href);
                if (url.pathname.includes('built/css')) {
                    const nextUrl = new URL(link.href);
                    nextUrl.searchParams.set('v', Date.now());
                    link.href = nextUrl.href;
                }
            }
            console.log('CSS updated via Hot Injection');
        } else {
            // Full reload for JS and HBS
            window.location.reload();
        }
      }
  };`;

  const buildOptions: esbuild.BuildOptions = {
    bundle: true,
    outbase: "src",
    outdir: "assets/built",
    minify: !isWatch,
    sourcemap: true,
    metafile: true,
    target: ESBUILD_TARGETS,
    external: EXTERNAL_ASSETS,
    ...config?.esbuild,
  };

  const mainEntry = entryPoints.find(
    (e) => e.includes("src/js/index") && !e.includes("/critical/"),
  );
  const otherEntries = entryPoints.filter((e) => e !== mainEntry);

  const runBuild = async (entries: string[], withFooter: boolean) => {
    const options = { ...buildOptions, entryPoints: entries };
    if (withFooter && isWatch) {
      options.footer = { js: footerScript };
    }
    return await esbuild.build(options);
  };

  try {
    const results: BuildResult[] = [];
    const cssFiles: string[] = [];

    const builds = [];
    if (mainEntry) {
      builds.push(runBuild([mainEntry], true));
    }
    if (otherEntries.length > 0) {
      builds.push(runBuild(otherEntries, false));
    }

    const resList = await Promise.all(builds);

    for (const res of resList) {
      if (res.metafile) {
        Object.entries(res.metafile.outputs).forEach(([key, value]) => {
          if (key.endsWith(".map")) return;
          results.push({ file: key, value: formatBytes(value.bytes) });

          if (key.endsWith(".css")) {
            cssFiles.push(key);
          }

          const { entryPoint, inputs } = value;
          if (entryPoint && inputs && typeof inputs === "object") {
            Object.keys(inputs).forEach((input) => {
              tree.set(input, entryPoint);
            });
          }
        });
      }
    }

    if (cssFiles.length > 0) {
      await postProcessCSS(cssFiles, isWatch);
    }

    await inlineCritical();

    const end = performance.now();
    return { results, time: end - start };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(chalk.red("\n┃ Build failed:"), msg);
    logToFile(`Build failed: ${msg}`);
    if (!isWatch) throw error;
    return { results: [], time: 0 };
  }
}
