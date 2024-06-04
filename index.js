#!/usr/bin/env node

import select from "@inquirer/select";
import chalk from "chalk";
import chokidar from "chokidar";
import * as esbuild from "esbuild";
import { execSync } from "node:child_process";
import { readdir, writeFile, stat, access, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { argv } from "node:process";
import WebSocket, { WebSocketServer } from "ws";

/* eslint-disable no-console */

const ghActionContent = `# Learn more → https://github.com/TryGhost/action-deploy-theme#getting-started
name: Build and deploy theme
on:
  push:
    branches:
      - main
jobs:
  build: 
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - name: Deploy theme
        uses: TryGhost/action-deploy-theme@v1
        with:
          api-url: \${{ secrets.GHOST_ADMIN_API_URL }}
          api-key: \${{ secrets.GHOST_ADMIN_API_KEY }}`

const defaultTemplateContent = `<!DOCTYPE html>
<html lang="{{@site.locale}}">
  <head>
      {{!-- Basic meta - advanced meta is output with {{ghost_head}} below --}}
      <title>{{meta_title}}</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">

      {{!-- Theme assets - use the {{asset}} helper to reference styles & scripts, this will take care of caching and cache-busting automatically --}}
      <link rel="stylesheet" type="text/css" href="{{asset "built/css/index.css"}}">
      <script src="{{asset "built/js/index.js"}}" defer></script>

      {{!-- This tag outputs all your advanced SEO meta, structured data, and other important settings, it should always be the last tag before the closing head tag --}}
      {{ghost_head}}
  </head>
  <body class="{{body_class}}">

  {{{body}}}

  {{!-- Ghost outputs required functional scripts with this tag, it should always be the last thing before the closing body tag --}}
  {{ghost_foot}}
  </body>
</html>`;

const postTemplateContent = `{{!< default}}
{{!-- The tag above means: insert everything in this file into the body of the default.hbs template --}}

{{#post}}
{{!-- Learn more: https://ghost.org/docs/themes/helpers/post/ --}}
{{/post}}`;

const indexTemplateContent = `{{!< default}}
{{!-- The tag above means: insert everything in this file into the body of the default.hbs template --}}

{{#foreach posts}}
{{!-- Learn more: https://ghost.org/docs/themes/contexts/index-context/ --}}
{{/foreach}}`;

const ghostCssContent = `/* Learn more about Ghost image styles -> https://ghost.org/docs/themes/content/#image-size-options */
{
  /* Styles for wide images in the editor */
}

.kg-width-full {
  /* Styles for full-width images in the editor */
}`

const indexCssContent = `@import "ghost.css";

`

let url;

function runCommand(command) {
  try {
    const output = execSync(command).toString();
    return output;
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}


async function makeSkeleton() {
  const filesToCheck = [
    { filename: "index.hbs", content: indexTemplateContent },
    { filename: "post.hbs", content: postTemplateContent },
    { filename: "default.hbs", content: defaultTemplateContent },
    { filename: "assets/css/index.css", content: indexCssContent },
    { filename: "assets/css/ghost.css", content: ghostCssContent },
    { filename: "assets/js/index.js", content: null },
    { filename: ".vscode/extensions.json", content: `{"recommendations": ["TryGhost.ghost"]}`},
    { filename: ".github/deploy-theme.yaml", content: ghActionContent}
  ];

  const folderPath = process.cwd();
  
  try {
    const results = await Promise.all(
      filesToCheck.map(async (file) => {
        const dir = dirname(join(folderPath, file.filename));
        try {
          await access(join(folderPath, file.filename));
        } catch (error) {
          if (file.filename.endsWith(".js")) {
            try {
              await access(join(folderPath, "assets/js/index.ts"));
            } catch (error) {
              await mkdir(dir, { recursive: true });
              await writeFile(
                join(folderPath, file.filename),
                file.content ? file.content : ""
              );
            }
          } else {
            await mkdir(dir, { recursive: true });
            await writeFile(
              join(folderPath, file.filename),
              file.content ? file.content : ""
            );
          }
        }
      })
    );
  } catch (error) {
    console.log(error);
  }

}

async function symLinkTheme() {}

async function parseGhostCliOutput() {
  const result = runCommand("ghost ls");
  const localUrl = result.match(/http:\/\/(localhost|127\.0\.0\.1):\d+/g);

  if (!localUrl) {
    console.log(
      "No running Ghost instance found. Please start Ghost and try again. To start Ghost, run `ghost start` in your Ghost installation directory."
    );
    process.exit(1);
  }
  if (localUrl.length > 1) {
    const details = await Promise.all(
      localUrl.map(async (u) => {
        const output = runCommand(`curl -s ${u}`) || "";
        const title = output.match(/<title>(.*?)<\/title>/);
        return { url: u, title: title?.[1] };
      })
    );

    const answer = await select({
      message: "More than one Ghost site running. Choose one:",
      choices: details.map((u) => ({
        name: `${u.title} (${u.url})`,
        value: u.url,
      })),
    });

    return answer;
  }
  return localUrl[0];
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [
    "Bytes",
    "KiB",
    "MiB",
    "GiB",
    "TiB",
    "PiB",
    "EiB",
    "ZiB",
    "YiB",
  ];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

const isWatch = argv.includes("--watch");
const isInit = argv.includes("--init");

const watcher = chokidar.watch(".", {
  ignored: [/(^|[\/\\])\../, "**/built/**", "dev.js", "node_modules"], // ignore dotfiles
});

async function findFilesRecursively(directory) {
  const files = [];

  async function traverseDirectory(dir) {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const fileStat = await stat(fullPath);

      if (fileStat.isDirectory()) {
        await traverseDirectory(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  await traverseDirectory(directory);
  return files;
}

async function findEntryPoints(entryPointPath, exts) {
  const directory = entryPointPath;
  try {
    const files = await findFilesRecursively(directory);
    const entryPoints = files.filter(
      (file) => file.includes("index") && exts.some((ext) => file.endsWith(ext))
    );
    return entryPoints;
  } catch (error) {
    console.error(error);
  }
}

function printCompilationDetails(content, change, firstTime = false) {
  if (firstTime) {
    console.log(chalk.dim(`┏━ Building...`));
    console.log(chalk.dim("┃"));
  } else {
    console.log(chalk.dim(`┏━ Change detected. Rebuilding... `));
    console.log(chalk.dim("┃"));
  }

  content.results.forEach(({ file, value }) => {
    console.log(
      chalk.dim(`┃`),
      ` ${
        change ? change + chalk.bold.magenta(" → ") : ""
      }${file} (${chalk.bold.magenta(value)})`
    );
  });
  console.log(chalk.dim("┃"));
  console.log(
    `${chalk.dim("┗━ Done in")} ${content.time.toFixed(2)}ms ${chalk.dim(
      "at"
    )} ${new Date().toLocaleTimeString(undefined, "short")}\n`
  );
}

async function init() {
  isInit && await makeSkeleton();
  const jsEntryPoints = await findEntryPoints("assets/js", [".ts", ".js"]);
  const cssEntryPoints = await findEntryPoints("assets/css", [".css"]);
  const res = await writeAssets([...jsEntryPoints, ...cssEntryPoints]);

  if (isWatch) {
    url = await parseGhostCliOutput();
    initWs(res);
  } else {
    printCompilationDetails(res);
    console.log(chalk.green("⬥"), "  Files built successfully. Exiting...");
    process.exit(0);
  }
}

const tree = new Map();

async function writeAssets(jsEntryPoints) {
  const start = performance.now();
  const footerScript = `const socket = new WebSocket('ws://localhost:3000');
  socket.addEventListener("open", (event) => {
      const url = window.location.href;
      const title = document.title;
      const version = document.querySelector('meta[name="generator"]').getAttribute("content");
      const msg = JSON.stringify({url, title, version});
      socket.send(msg)
  });
  socket.onmessage = function(event) {
      console.log('Message from server ', event.data);
      if (event.data.includes('changed')) {
        // Reload the page
        console.log(event.data)
        window.location.reload();
      }
  };`;

  const buildOptions = {
    entryPoints: jsEntryPoints,
    bundle: true,
    outbase: "assets",
    outdir: "assets/built",
    minify: !isWatch,
    sourcemap: true,
    metafile: true,
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
    external: ["*.woff", "*.woff2"],
  };

  let results = [];

  for await (const entry of jsEntryPoints) {
    const buildOptionsClone = { ...buildOptions };
    buildOptionsClone.entryPoints = [entry];

    if (isWatch && entry.includes("assets/js/index")) {
      buildOptionsClone.footer = {
        js: footerScript,
      };
    }

    const res = await esbuild.build(buildOptionsClone);

    Object.keys(res.metafile.inputs).forEach((input) => {
      tree.set(input, entry);
    });

    const vals = Object.entries(res.metafile.outputs).reduce(
      (acc, [key, value]) => {
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

  const end = performance.now();
  return { results, time: end - start };
}
let siteData = false;

function printHeader(connectionError = false, firstConnection = false) {
  console.clear();
  console.log(`${chalk.bold.green("●")}  Ghost theme dev server running...`);

  if (connectionError) {
    console.log(
      chalk.redBright.bold("✘  No connection. "),
      `Try refreshing your browser or visiting ${chalk.underline.blue(url)}.`
    );
  } else if (firstConnection) {
    console.log(
      chalk.blueBright.bold("➜"),
      ` Connected to ${chalk.underline.blue(url)}.`
    );
  } else if (siteData.version) {
    console.log(
      chalk.blueBright.bold("➜"),
      ` Connected to ${chalk.underline.blue(siteData.url)} ${chalk.dim(
        `(${siteData.version})`
      )}`
    );
  } else {
    console.log(
      chalk.blueBright.bold("➜"),
      ` Visit ${chalk.underline.blue(url)} to see your changes live.`
    );
  }
  console.log("");
}
async function initWs(res) {
  const int = setTimeout(() => {
    console.clear();
    printHeader(true);
  }, 5000);
  printHeader();
  printCompilationDetails(res, null, true);

  const wss = new WebSocketServer({
    port: 3000,
  });

  let firstConnection = true;

  watcher.on("all", async (event, path) => {
    if (path.endsWith(".hbs")) {
      printHeader(false, false);
      console.log(chalk.cyanBright(`{{  `), `${path} changed. Reloading...`);

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send("HBS changed: " + path);
        }
      });
    }

    if (path.endsWith(".css") || path.endsWith(".js") || path.endsWith(".ts")) {
      let rootFile = path;

      if (!/index\.(css|js|ts)$/.test(path)) {
        rootFile = tree.get(path);
      }

      if (!rootFile) {
        return;
      }

      const res = await writeAssets([rootFile]);

      printHeader(false, false);
      printCompilationDetails(res, path);

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(`File changed: ${path}`);
        }
      });
    }
  });

  wss.on("connection", (ws) => {
    clearTimeout(int);

    if (firstConnection) {
      printHeader(false, true);
      firstConnection = false;
    }

    ws.on("message", (message) => {
      const { url, title, version } = JSON.parse(message);
      siteData = { url, title, version };
    });
  });
}

init();
