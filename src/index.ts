#!/usr/bin/env node

import chalk from "chalk";
import chokidar from "chokidar";
import { argv } from "node:process";
import { getPortPromise } from "portfinder";
import open from "open";

import { findEntryPoints, loadConfig } from "./utils.js";
import { writeAssets } from "./builder.js";
import { initWs, printCompilationDetails } from "./server.js";
import {
  makeSkeleton,
  parseGhostCliOutput,
  checkTheme,
  zipTheme,
  symLinkTheme,
  lintTheme,
  deployTheme,
  runDoctor,
  cloneContent,
} from "./cli.js";

async function init() {
  const config = await loadConfig();
  const command = argv[2];

  if (argv.includes("--help") || argv.includes("-h") || !command) {
    const { readFile } = await import("node:fs/promises");
    const pkg = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf-8"),
    );
    console.log(chalk.bold(`\n  gtb - Ghost Theme Builder v${pkg.version}`));
    console.log(`\n  ${chalk.bold("USAGE")}`);
    console.log(`    gtb <command> [options]`);

    console.log(`\n  ${chalk.bold("COMMANDS")}`);
    console.log(
      `    dev          Start development server with live reload (default)`,
    );
    console.log(
      `    init         Scaffold a new theme and link to local Ghost`,
    );
    console.log(`    build        Build theme for production`);
    console.log(`    check        Run theme validation using gscan`);
    console.log(`    lint         Run ESLint and Stylelint`);
    console.log(`    zip          Package theme into a zip file for upload`);
    console.log(`    deploy       Deploy theme to a remote Ghost instance`);
    console.log(
      `    clone        Clone content from remote Ghost to local instance`,
    );
    console.log(`    doctor       Check system for common Ghost/gtb issues`);

    console.log(`\n  ${chalk.bold("OPTIONS")}`);
    console.log(`    --watch, -w  Watch for changes (implied in 'dev')`);
    console.log(`    --open, -o   Open local Ghost in browser on start`);
    console.log(`    --help, -h   Show this help message`);
    console.log("");
    return;
  }

  if (command === "init" || argv.includes("--init")) {
    await makeSkeleton();
    const linked = await symLinkTheme();
    if (linked) {
      console.log(
        chalk.green("⬥"),
        "  Theme skeleton created and linked successfully.",
      );
    } else {
      console.log(
        chalk.green("⬥"),
        "  Theme skeleton created successfully (linking skipped or failed).",
      );
    }
    return;
  }

  if (command === "check") {
    console.log(chalk.blue("⬥"), "  Running theme validation (gscan)...");
    await checkTheme();
    return;
  }

  if (command === "lint") {
    await lintTheme();
    return;
  }

  if (command === "zip") {
    console.log(chalk.blue("⬥"), "  Packaging theme for production...");
    await zipTheme();
    return;
  }

  if (command === "deploy") {
    await deployTheme();
    return;
  }

  if (command === "doctor") {
    await runDoctor();
    return;
  }

  if (command === "clone") {
    await cloneContent();
    return;
  }

  const isWatch = argv.includes("--watch") || command === "dev";

  const jsDir = config.entryPoints?.js || ["assets/js"];
  const cssDir = config.entryPoints?.css || ["assets/css"];

  let jsEntryPoints: string[] = [];
  for (const dir of jsDir) {
    jsEntryPoints.push(...(await findEntryPoints(dir, [".ts", ".js"])));
  }

  let cssEntryPoints: string[] = [];
  for (const dir of cssDir) {
    cssEntryPoints.push(...(await findEntryPoints(dir, [".css"])));
  }

  const port = isWatch ? await getPortPromise({ port: 3000 }) : 0;
  const res = await writeAssets(
    [...jsEntryPoints, ...cssEntryPoints],
    port,
    isWatch,
    config,
  );

  if (isWatch) {
    const url = await parseGhostCliOutput();
    // Use a function-based ignore to only watch necessary theme files
    const ignored = (path: string, stats?: any) => {
      // Ignore hidden files and directories
      if (path !== "." && /(^|[/\\])\../.test(path)) return true;

      const lowerPath = path.toLowerCase();

      // Always ignore build artifacts and node_modules
      if (
        lowerPath.includes("node_modules") ||
        lowerPath.includes("dist") ||
        lowerPath.includes("assets/built") ||
        lowerPath.includes("assets\\built") ||
        lowerPath.includes("postcss.config.js")
      ) {
        return true;
      }

      // If it's a file, only allow theme-related ones (.hbs, .css, .js, .ts)
      if (stats?.isFile()) {
        return !/\.(hbs|css|js|ts)$/i.test(path);
      }

      // If stats is not available (some platforms/versions), check for extension
      // If it has an extension and it's not one of ours, ignore it
      if (/\.[^/\\]+$/.test(path)) {
        return !/\.(hbs|css|js|ts)$/i.test(path);
      }

      return false;
    };

    const watcher = chokidar.watch(".", {
      ignored,
    });
    await initWs(res, port, url, watcher, config);

    if (argv.includes("--open")) {
      await open(url);
    }
  } else {
    printCompilationDetails(res);
    console.log(chalk.green("⬥"), "  Files built successfully. Exiting...");
    process.exit(0);
  }
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
