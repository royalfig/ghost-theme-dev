import * as esbuild from "esbuild";
import chalk from "chalk";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { formatBytes, GtbConfig, logToFile } from "./utils.js";
import { EXTERNAL_ASSETS } from "./constants.js";

export interface BuildResult {
  file: string;
  value: string;
}

export interface CompilationDetails {
  results: BuildResult[];
  time: number;
}

export const tree = new Map<string, string>();

export async function inlineCritical(templatePath = "default-template.hbs") {
  try {
    const CSS_TAG =
      '<link rel="stylesheet" href="{{asset "built/css/critical/index.css"}}">';
    const JS_TAG =
      '<script src="{{asset "built/js/critical/index.js"}}"></script>';

    let defaultTemplate = await readFile(templatePath, "utf8");

    let cssContent = "";
    let jsContent = "";

    try {
      cssContent = await readFile(
        "assets/built/css/critical/index.css",
        "utf8",
      );
    } catch (e) {
      /* ignore */
    }

    try {
      jsContent = await readFile("assets/built/js/critical/index.js", "utf8");
    } catch (e) {
      /* ignore */
    }

    if (cssContent && defaultTemplate.includes(CSS_TAG)) {
      defaultTemplate = defaultTemplate.replace(
        CSS_TAG,
        `<style>${cssContent}</style>`,
      );
    }

    if (jsContent && defaultTemplate.includes(JS_TAG)) {
      defaultTemplate = defaultTemplate.replace(
        JS_TAG,
        `<script>${jsContent}</script>`,
      );
    }

    await writeFile("default.hbs", defaultTemplate);
    console.log(chalk.blue("⬥"), " Critical assets inlined into default.hbs");
  } catch (error) {
    console.error(chalk.red("✘  Failed to inline critical assets:"), error);
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
    outbase: config?.assetsDir || "assets",
    outdir: config?.outDir || "assets/built",
    minify: !isWatch,
    sourcemap: true,
    metafile: true,
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
    external: EXTERNAL_ASSETS,
    ...config?.esbuild,
  };

  // If we need special handling for the footer in watch mode, we might need to partition
  const mainEntry = entryPoints.find(
    (e) => e.includes("assets/js/index") && !e.includes("/critical/"),
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
          const output = value as any;
          results.push({ file: key, value: formatBytes(output.bytes) });

          const entryPoint = output.entryPoint;
          if (
            entryPoint &&
            output.inputs &&
            typeof output.inputs === "object"
          ) {
            Object.keys(output.inputs).forEach((input) => {
              tree.set(input, entryPoint);
            });
          }
        });
      }
    }

    // Always inline critical. Need to duplicate the default.hbs file
    await inlineCritical();

    const end = performance.now();
    return { results, time: end - start };
  } catch (error: any) {
    console.error(chalk.red("\n┃ Build failed:"), error.message || error);
    logToFile(`Build failed: ${error.message || error}`);
    if (!isWatch) throw error;
    return { results: [], time: 0 };
  }
}
