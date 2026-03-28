import select from "@inquirer/select";
import confirm from "@inquirer/confirm";
import input from "@inquirer/input";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import {
  writeFile as writeFilePromise,
  access as accessPromise,
  mkdir as mkdirPromise,
  readFile as readFilePromise,
  lstat as lstatPromise,
  readlink as readlinkPromise,
  unlink as unlinkPromise,
  copyFile as copyFilePromise,
} from "node:fs/promises";
import { join, dirname, basename, resolve, extname } from "node:path";
import gscan from "gscan";
import archiver from "archiver";
import chalk from "chalk";
import GhostAdminApi from "@tryghost/admin-api";

import {
  runCommand,
  hasCommand,
  checkNodeVersion,
  downloadFile,
  findFilesRecursively,
  optimizeImages,
} from "./utils.js";
import {
  GH_ACTION_CONTENT,
  DEFAULT_TEMPLATE_CONTENT,
  POST_TEMPLATE_CONTENT,
  INDEX_TEMPLATE_CONTENT,
  PAGE_TEMPLATE_CONTENT,
  AUTHOR_TEMPLATE_CONTENT,
  TAG_TEMPLATE_CONTENT,
  ERROR_404_TEMPLATE_CONTENT,
  HEADER_PARTIAL_CONTENT,
  FOOTER_PARTIAL_CONTENT,
  CARD_PARTIAL_CONTENT,
  NAVIGATION_PARTIAL_CONTENT,
  GHOST_CSS_CONTENT,
  INDEX_CSS_CONTENT,
  PACKAGE_JSON_TEMPLATE,
  ESLINT_CONFIG_TEMPLATE,
  STYLELINT_CONFIG_TEMPLATE,
  DARK_MODE_CRITICAL_JS,
  DARK_MODE_HANDLER_JS,
  DARK_MODE_TOGGLE_HBS,
  GITIGNORE_CONTENT,
  CRITICAL_CSS_CONTENT,
  CSS_RESET,
} from "./constants.js";

export async function runNpmInstall() {
  console.log(chalk.blue("⬥"), " Installing dependencies...");
  try {
    runCommand("npm install");
    console.log(chalk.green("✔"), " Dependencies installed successfully!");
  } catch (e) {
    console.error(
      chalk.red(
        "✘  Failed to install dependencies. Please run 'npm install' manually.",
      ),
    );
    process.exit(1);
  }
}

export async function makeSkeleton() {
  const folderPath = process.cwd();
  const themeName = basename(folderPath);

  const filesToCheck = [
    { filename: "index.hbs", content: INDEX_TEMPLATE_CONTENT },
    { filename: "post.hbs", content: POST_TEMPLATE_CONTENT },
    { filename: "page.hbs", content: PAGE_TEMPLATE_CONTENT },
    { filename: "author.hbs", content: AUTHOR_TEMPLATE_CONTENT },
    { filename: "tag.hbs", content: TAG_TEMPLATE_CONTENT },
    { filename: "error-404.hbs", content: ERROR_404_TEMPLATE_CONTENT },
    { filename: "default-template.hbs", content: DEFAULT_TEMPLATE_CONTENT },
    { filename: "assets/css/ghost.css", content: GHOST_CSS_CONTENT },
    { filename: "assets/css/index.css", content: INDEX_CSS_CONTENT },
    {
      filename: "assets/js/index.ts",
      content: "console.log('Hello World');",
    },
    { filename: "assets/js/darkMode.ts", content: DARK_MODE_HANDLER_JS },
    { filename: "assets/js/critical/index.ts", content: DARK_MODE_CRITICAL_JS },
    { filename: "partials/header.hbs", content: HEADER_PARTIAL_CONTENT },
    { filename: "partials/footer.hbs", content: FOOTER_PARTIAL_CONTENT },
    { filename: "partials/card.hbs", content: CARD_PARTIAL_CONTENT },
    {
      filename: "partials/navigation.hbs",
      content: NAVIGATION_PARTIAL_CONTENT,
    },
    {
      filename: "partials/dark-mode-toggle.hbs",
      content: DARK_MODE_TOGGLE_HBS,
    },
    {
      filename: "assets/css/critical/index.css",
      content: CRITICAL_CSS_CONTENT,
    },
    {
      filename: "assets/css/critical/reset.css",
      content: CSS_RESET,
    },
    {
      filename: ".vscode/extensions.json",
      content: `{"recommendations": ["TryGhost.ghost"]}`,
    },
    { filename: ".github/deploy-theme.yaml", content: GH_ACTION_CONTENT },
    { filename: "package.json", content: PACKAGE_JSON_TEMPLATE(themeName) },
    { filename: ".eslintrc.json", content: ESLINT_CONFIG_TEMPLATE },
    { filename: ".stylelintrc.json", content: STYLELINT_CONFIG_TEMPLATE },
    { filename: ".gitignore", content: GITIGNORE_CONTENT },
  ];

  try {
    await Promise.all(
      filesToCheck.map(async (file) => {
        const dir = dirname(join(folderPath, file.filename));
        try {
          await accessPromise(join(folderPath, file.filename));
        } catch (error) {
          await mkdirPromise(dir, { recursive: true });
          await writeFilePromise(join(folderPath, file.filename), file.content);
        }
      }),
    );

    // Initialize git if not already a repo
    if (!existsSync(join(folderPath, ".git"))) {
      console.log(chalk.blue("⬥"), " Initializing git repository...");
      try {
        runCommand("git init -q --initial-branch=main");
        console.log(chalk.green("✔"), " Git repository initialized!");
      } catch (e) {
        console.log(
          chalk.yellow("┃"),
          " Git initialization skipped (not found or error).",
        );
      }
    }
  } catch (error) {
    console.log(error);
  }
}

export async function parseGhostCliOutput(): Promise<string> {
  checkNodeVersion();
  const ghostCmd = hasCommand("ghost") ? "ghost" : "npx -p ghost-cli ghost";

  if (!hasCommand("ghost") && !hasCommand("npx")) {
    return "http://localhost:2368";
  }

  const result = runCommand(`${ghostCmd} ls`, true);
  if (!result) return "http://localhost:2368";

  const localUrl = result.match(/http:\/\/(localhost|127\.0\.0\.1):\d+/g);

  if (!localUrl) {
    return "http://localhost:2368";
  }
  if (localUrl.length > 1) {
    const details = await Promise.all(
      localUrl.map(async (u) => {
        try {
          const output = runCommand(`curl -s ${u}`, true) || "";
          const title = output.match(/<title>(.*?)<\/title>/);
          return { url: u, title: title?.[1] || u };
        } catch (e) {
          return { url: u, title: u };
        }
      }),
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

export async function checkTheme() {
  const report = await gscan.check(process.cwd());
  const formattedReport = gscan.format(report);
  console.log(formattedReport);
  if (report.results.errorCount > 0) process.exit(1);
}

export async function lintTheme() {
  console.log(chalk.blue("⬥"), " Running ESLint...");
  try {
    runCommand('npx eslint "assets/js/**/*.{js,ts}" --fix', true);
    console.log(chalk.green("✔"), " JS/TS linting passed.");
  } catch (e) {
    /* ignore */
  }

  console.log(chalk.blue("⬥"), " Running Stylelint...");
  try {
    runCommand('npx stylelint "assets/css/**/*.css" --fix', true);
    console.log(chalk.green("✔"), " CSS linting passed.");
  } catch (e) {
    /* ignore */
  }
}

export async function zipTheme() {
  const folderPath = process.cwd();
  const themeName = basename(folderPath);
  let version = "0.1.0";

  try {
    const pkgContent = await readFilePromise(
      join(folderPath, "package.json"),
      "utf8",
    );
    if (pkgContent) {
      const pkg = JSON.parse(pkgContent);
      version = pkg.version || "0.1.0";
    }
  } catch (e) {
    console.log(
      chalk.yellow("┃"),
      " Could not read package.json, using default version 0.1.0",
    );
  }

  const zipName = `${themeName}-${version}.zip`;
  const distDir = join(folderPath, "dist");

  if (!existsSync(distDir)) await mkdirPromise(distDir);

  console.log(chalk.blue("⬥"), " Optimizing images...");
  try {
    await optimizeImages(folderPath);
  } catch (e) {
    console.log(chalk.yellow("┃"), " Image optimization skipped or failed.");
  }

  const output = createWriteStream(join(distDir, zipName));
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => {
    console.log(
      chalk.green("⬥"),
      ` Theme packaged to dist/${zipName} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`,
    );
  });

  archive.pipe(output);
  archive.glob("**/*.hbs", { ignore: ["node_modules/**"] });
  archive.glob("assets/built/**");
  archive.glob("package.json");
  archive.glob("routes.yaml");
  archive.glob("partials/**");
  await archive.finalize();
  return join(distDir, zipName);
}

export async function deployTheme() {
  const folderPath = process.cwd();
  const pkg = JSON.parse(
    (await readFilePromise(join(folderPath, "package.json"), "utf8")) || "{}",
  );

  const url = process.env.GHOST_ADMIN_API_URL || pkg.config?.deploy?.url;
  const key = process.env.GHOST_ADMIN_API_KEY || pkg.config?.deploy?.key;

  if (!url || !key) {
    console.error(chalk.red("✘  Missing Ghost Admin API credentials."));
    console.log(
      chalk.dim("┃"),
      " Set GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY env variables.",
    );
    return;
  }

  console.log(chalk.blue("⬥"), " Building and packaging theme...");
  const zipPath = await zipTheme();

  const api = new GhostAdminApi({ url, key, version: "v5.0" });

  console.log(chalk.blue("⬥"), ` Uploading theme to ${url}...`);
  try {
    await api.themes.upload({ file: zipPath });
    console.log(chalk.green("✔"), " Theme deployed successfully!");
  } catch (error: any) {
    console.error(chalk.red("✘  Deployment failed:"), error.message);
  }
}

export async function runDoctor() {
  console.log(chalk.bold.blue("\n⬥ GTB Doctor - Environment Check\n"));
  checkNodeVersion();

  const checks = [
    { name: "Node.js Version", command: "node -v" },
    { name: "Ghost CLI", command: "ghost -v" },
    { name: "Theme package.json", file: "package.json" },
  ];

  for (const check of checks) {
    try {
      if (check.command) {
        if (check.name === "Ghost CLI" && !hasCommand("ghost")) {
          console.log(chalk.yellow("⚠"), ` ${check.name}: Not installed.`);
          continue;
        }
        let out = execSync(check.command).toString().trim();
        if (check.name === "Ghost CLI") {
          // Extract just the version number line
          const match = out.match(/Ghost-CLI version: \d+\.\d+\.\d+/);
          if (match) out = match[0];
        }
        console.log(chalk.green("✔"), ` ${check.name}: ${out}`);
      } else if (check.file) {
        await accessPromise(check.file);
        console.log(chalk.green("✔"), ` ${check.name} found.`);
      }
    } catch (e) {
      console.log(chalk.red("✘"), ` ${check.name} missing or error.`);
    }
  }
}

export async function symLinkTheme(): Promise<boolean> {
  checkNodeVersion();
  let ghostCmd = hasCommand("ghost") ? "ghost" : "npx -p ghost-cli ghost";
  if (!hasCommand("ghost")) {
    console.log(chalk.yellow("⬥"), " Ghost CLI not found.");
    const installCli = await confirm({
      message: "Would you like to install Ghost CLI globally now?",
      default: true,
    });

    if (installCli) {
      console.log(chalk.blue("⬥"), " Installing ghost-cli...");
      try {
        runCommand("npm install -g ghost-cli");
        console.log(chalk.green("✔"), " Ghost CLI installed successfully!");
        if (hasCommand("ghost")) {
          ghostCmd = "ghost";
        }
      } catch (e) {
        console.error(
          chalk.red("✘  Failed to install Ghost CLI. Fallback to npx."),
        );
      }
    } else {
      console.log(chalk.yellow("⬥"), " Skipping symlink.");
      return false;
    }
  }

  let instances: { name: string; location: string }[] = [];

  // Try reading from ~/.ghost/config first
  const ghostConfigPath = join(homedir(), ".ghost", "config");
  if (existsSync(ghostConfigPath)) {
    try {
      const configContent = await readFilePromise(ghostConfigPath, "utf8");
      const config = JSON.parse(configContent);
      if (config.instances) {
        instances = Object.entries(config.instances).map(
          ([name, data]: [string, any]) => ({
            name,
            location: data.cwd,
          }),
        );
      }
    } catch (e) {
      // Fallback to ghost ls if reading config fails
    }
  }

  // Fallback to ghost ls if no instances found via config
  if (instances.length === 0) {
    let result = runCommand(`${ghostCmd} ls`, true);
    const ansiRegex =
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    const cleanResult = result ? result.replace(ansiRegex, "") : "";
    let rows = cleanResult
      ? cleanResult
          .split("\n")
          .filter((row) => row.includes("│") && !row.includes("Name"))
      : [];

    instances = rows
      .map((row) => {
        const parts = row.split("│").map((p) => p.trim());
        return { name: parts[1], location: parts[2] };
      })
      .filter((i) => i.name && i.location);
  }

  if (instances.length === 0) {
    console.log(chalk.yellow("⬥"), " No local Ghost instances found.");
    const setupLocal = await confirm({
      message:
        "Would you like to set up a local Ghost installation in the parent directory?",
      default: true,
    });

    if (setupLocal) {
      const folderName = await input({
        message: "What should we name the Ghost directory?",
        default: "ghost-local",
      });
      const parentDir = resolve(process.cwd(), "..");
      const targetPath = join(parentDir, folderName);

      if (existsSync(targetPath)) {
        console.log(chalk.red("✘  Directory already exists:"), targetPath);
        return false;
      } else {
        console.log(chalk.blue("⬥"), ` Creating directory: ${targetPath}`);
        try {
          await mkdirPromise(targetPath, { recursive: true });
          console.log(
            chalk.blue("⬥"),
            ` Running ghost install local in ${targetPath}...`,
          );
          console.log(chalk.dim("┃"), " This may take a minute...");
          execSync(`cd "${targetPath}" && ${ghostCmd} install local`, {
            stdio: "inherit",
          });
          console.log(chalk.green("✔"), " Local Ghost installed!");

          // After installation, the config should exist, so we recursive call or just add it
          const newLocation = targetPath;
          instances = [{ name: folderName, location: newLocation }];
        } catch (e) {
          console.error(chalk.red("✘  Failed to setup local Ghost."));
          return false;
        }
      }
    } else {
      return false;
    }
  }

  let folderPath = process.cwd();
  let lastPath = "";
  while (
    folderPath !== lastPath &&
    !existsSync(join(folderPath, "package.json"))
  ) {
    lastPath = folderPath;
    folderPath = dirname(folderPath);
  }

  if (!existsSync(join(folderPath, "package.json"))) {
    console.log(
      chalk.red(
        "✘  No package.json found. Run this in a Ghost theme directory.",
      ),
    );
    return false;
  }

  const themeName = basename(folderPath);

  try {
    let targetInstance =
      instances.length === 1
        ? instances[0]
        : await select({
            message: "Link to which Ghost instance?",
            choices: instances.map((i) => ({
              name: `${i.name} (${i.location})`,
              value: i,
            })),
          });

    const resolvedLocation = targetInstance.location.replace(/^~/, homedir());
    const themesPath = join(resolvedLocation, "content", "themes", themeName);
    console.log(chalk.blue("⬥"), ` Linking theme to ${themesPath}...`);

    try {
      const stats = await lstatPromise(themesPath);
      if (stats.isSymbolicLink()) {
        const existingLink = await readlinkPromise(themesPath);
        const absoluteExistingLink = resolve(dirname(themesPath), existingLink);
        if (absoluteExistingLink === resolve(folderPath)) {
          console.log(chalk.yellow("⬥"), " Already linked correctly.");
          return true;
        }

        const replaceLink = await confirm({
          message: `Already linked to ${existingLink}. Replace?`,
          default: true,
        });
        if (replaceLink) {
          await unlinkPromise(themesPath);
        } else {
          return false;
        }
      } else if (stats.isDirectory()) {
        const replaceDir = await confirm({
          message:
            "Directory already exists and is not a link. Replace with link?",
          default: false,
        });
        if (replaceDir) {
          await mkdirPromise(dirname(themesPath), { recursive: true }); // Ensure parent exists
          const { rm } = await import("node:fs/promises");
          await rm(themesPath, { recursive: true, force: true });
        } else {
          return false;
        }
      }
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        console.error(chalk.red(`✘  Error checking themes path: ${e.message}`));
        return false;
      }
      // If ENOENT, path doesn't exist, which is fine, we'll create the symlink
    }

    try {
      const { symlink } = await import("node:fs/promises");
      await symlink(folderPath, themesPath, "dir");
      console.log(chalk.green("⬥"), " Symlink created.");
      return true;
    } catch (symErr: any) {
      console.error(
        chalk.red(`✘  Failed to create symlink: ${symErr.message}`),
      );
      if (process.platform === "win32") {
        console.log(
          chalk.yellow("┃"),
          " Note: On Windows, symlinks may require Administrator privileges or Developer Mode.",
        );
      }
      return false;
    }
  } catch (e: any) {
    console.error(chalk.red(`✘  An unexpected error occurred: ${e.message}`));
    return false;
  }
}

