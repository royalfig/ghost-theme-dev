import * as esbuild from "esbuild";
import chalk from "chalk";
import { readFile, writeFile } from "node:fs/promises";
import stylePlugin from "esbuild-style-plugin";
import postcssImport from "postcss-import";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import { formatBytes, GtbConfig, logToFile } from "./utils.js";
import { ASSET_LOADERS } from "./constants.js";

export interface BuildResult {
    file: string;
    value: string;
}

export interface CompilationDetails {
    results: BuildResult[];
    time: number;
}

export const tree = new Map<string, string>();

async function inlineCritical() {
    try {
        const CSS_TAG = '<link rel="stylesheet" type="text/css" href="{{asset "built/css/critical/index.css"}}">';
        const JS_TAG = '<script src="{{asset "built/js/critical/index.js"}}"></script>';

        let defaultTemplate = await readFile("default.hbs", "utf8");
        
        let cssContent = "";
        let jsContent = "";

        try {
            cssContent = await readFile("assets/built/css/critical/index.css", "utf8");
        } catch (e) { /* ignore */ }

        try {
            jsContent = await readFile("assets/built/js/critical/index.js", "utf8");
        } catch (e) { /* ignore */ }

        if (cssContent && defaultTemplate.includes(CSS_TAG)) {
            defaultTemplate = defaultTemplate.replace(CSS_TAG, `<style>${cssContent}</style>`);
        }

        if (jsContent && defaultTemplate.includes(JS_TAG)) {
            defaultTemplate = defaultTemplate.replace(JS_TAG, `<script>${jsContent}</script>`);
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
    config?: GtbConfig
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
    loader: ASSET_LOADERS,
    plugins: [
        stylePlugin({
            postcss: {
                plugins: [postcssImport(), tailwindcss, autoprefixer],
            },
        }),
    ],
    ...config?.esbuild
  };

  const buildTasks = entryPoints.map(async (entry) => {
    const isCritical = entry.includes("/critical/");
    const buildOptionsClone = { ...buildOptions };
    buildOptionsClone.entryPoints = [entry];

    if (isWatch && entry.includes("assets/js/index") && !isCritical) {
      buildOptionsClone.footer = {
        js: footerScript,
      };
    }

    try {
        const res = await esbuild.build(buildOptionsClone);
        const results: BuildResult[] = [];

        if (res.metafile) {
            Object.keys(res.metafile.inputs).forEach((input) => {
                tree.set(input, entry);
            });

            const vals = Object.entries(res.metafile.outputs).reduce(
                (acc: BuildResult[], [key, value]) => {
                    if (key.includes("map")) {
                        return acc;
                    }
                    acc.push({ file: key, value: formatBytes(value.bytes) });
                    return acc;
                },
                []
            );
            results.push(...vals);
        }
        logToFile(`Build success for ${entry}: ${results.map(r => r.file).join(", ")}`);
        return { results, isCritical: !!isCritical };
    } catch (error: any) {
        console.error(chalk.red("\n┃ Build failed for:"), entry);
        logToFile(`Build failed for ${entry}: ${error.message || error}`);
        if (!isWatch) throw error;
        return { results: [], isCritical: false };
    }
  });

  const buildResults = await Promise.all(buildTasks);
  const results = buildResults.flatMap(r => r.results);
  const builtCritical = buildResults.some(r => r.isCritical);

  if (builtCritical) {
      await inlineCritical();
  }

  const end = performance.now();
  return { results, time: end - start };
}
