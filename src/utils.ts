import { execSync, spawnSync } from "node:child_process";
import { readdir, stat, readFile, mkdir, unlink, copyFile, access, constants } from "node:fs/promises";
import { join, dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, unlinkSync, readFileSync, lstatSync } from "node:fs";
import chalk from "chalk";
import type { Stats } from "node:fs";

const IGNORED_SEGMENT = /(^|[/\\])(node_modules|dist)([/\\]|$)/i;
const BUILT_DIR = /(^|[/\\])assets[/\\]built([/\\]|$)/i;
const WATCHED_FILE = /\.(hbs|css|js|ts|json|jpe?g|png|webp|avif|svg|woff2?|ttf|otf)$/i;

/**
 * chokidar `ignored` filter for `gtb dev`. Directories are matched by whole
 * path segment, so `partials/distance.hbs` is watched but `dist/` is not.
 */
export function isIgnoredPath(path: string, stats?: Stats): boolean {
  if (path !== "." && /(^|[/\\])\../.test(path)) return true;
  if (IGNORED_SEGMENT.test(path) || BUILT_DIR.test(path)) return true;
  if (/(^|[/\\])(postcss\.config\.js|package-lock\.json|gtb-debug\.log)$/i.test(path)) return true;
  if (stats?.isFile()) return !WATCHED_FILE.test(path);
  // Without stats chokidar may be asking about a directory; only rule out
  // paths that clearly name a file of a type gtb doesn't care about.
  if (/\.[^/\\]+$/.test(path)) return !WATCHED_FILE.test(path);
  return false;
}

export interface GtbConfig {
    esbuild?: any;
}

import { appendFileSync } from "node:fs";

export function logToFile(message: any) {
    const logPath = join(process.cwd(), "gtb-debug.log");
    const timestamp = new Date().toISOString();
    const cleanMessage = typeof message === "string" ? message : JSON.stringify(message, null, 2);
    // Strip ANSI codes for the log file
    const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    const strippedMessage = cleanMessage.replace(ansiRegex, "");
    appendFileSync(logPath, `[${timestamp}] ${strippedMessage}\n`);
}

export function clearLogFile() {
    const logPath = join(process.cwd(), "gtb-debug.log");
    if (existsSync(logPath)) {
        try {
            unlinkSync(logPath);
        } catch (e) {
            // ignore
        }
    }
}

export async function loadConfig(): Promise<GtbConfig> {
    const cwd = process.cwd();
    await loadEnv();
    const configPath = join(cwd, "gtb.config.js");
    
    try {
        await stat(configPath);
        // Using dynamic import with timestamp to avoid cache
        const module = await import(`${pathToFileURL(configPath).href}?t=${Date.now()}`);
        return module.default || {};
    } catch (e) {
        // No config file, check package.json
        try {
            const pkgPath = join(cwd, "package.json");
            const pkgContent = await readFile(pkgPath, "utf8");
            const pkg = JSON.parse(pkgContent);
            return pkg.gtb || {};
        } catch (e2) {
            return {};
        }
    }
}

export function hasCommand(command: string): boolean {
    try {
        const result = spawnSync("which", [command], { stdio: ['pipe', 'pipe', 'ignore'] });
        return result.status === 0;
    } catch (e) {
        return false;
    }
}

let nodeVersionChecked = false;

export function checkNodeVersion() {
    if (nodeVersionChecked) return;
    nodeVersionChecked = true;

    // Only check Node version if Ghost CLI is not installed
    // If Ghost is already installed, the warning is irrelevant to the current theme dev directory
    if (hasCommand("ghost") || hasCommand("npx")) {
        return;
    }

    const version = process.versions.node;
    const major = parseInt(version.split(".")[0]);
    
    try {
        const supportedString = execSync("npm view ghost-cli engines.node", { 
            stdio: 'pipe',
            timeout: 2000
        }).toString().trim();
        // Simple extraction of major versions from string like "^12.22.1 || ^14.17.0 || ^16.13.0 || ^18.0.0 || ^20.11.1 || ^22.11.0"
        const supportedMajors = supportedString.match(/\^(\d+)/g)?.map(v => parseInt(v.replace("^", ""))) || [];
        
        if (supportedMajors.length > 0) {
            const maxMajor = Math.max(...supportedMajors);
            if (major > maxMajor || !supportedMajors.includes(major)) {
                console.warn(chalk.yellow(`\n⚠ Warning: Your Node.js version (${version}) may be incompatible with Ghost.`));
                console.warn(chalk.yellow(`Ghost CLI officially supports Node: ${supportedString}`));
                console.warn(chalk.yellow(`You are running Node v${major}, which is newer or different from supported LTS versions.`));
                console.warn(chalk.yellow(`If you encounter issues, please use a supported version (e.g., nvm use 22).\n`));
            }
        }
    } catch (e) {
        // If npm check fails, just skip the warning or fallback to a silent fail
    }
}

export function runCommand(command: string, silent = false) {
  try {
    const output = execSync(command, { stdio: silent ? 'pipe' : 'inherit' });
    return output?.toString() ?? "";
  } catch (error: any) {
    if (silent && error && typeof error === "object") return null;
    throw error;
  }
}

export function formatBytes(bytes: number, decimals = 2) {
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

export async function findFilesRecursively(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function traverseDirectory(dir: string) {
    try {
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
    } catch (e: any) {
        if (e.code !== 'ENOENT' && e.code !== 'EACCES') {
            console.warn(`Warning: Could not read directory ${dir}: ${e.message}`);
        }
    }
  }

  await traverseDirectory(directory);
  return files;
}

function isEntryPoint(filename: string, exts: string[]): boolean {
  return exts.some((ext) => filename.endsWith(ext)) && (filename.includes("index") || filename.includes("critical"));
}

async function collectDeepEntries(subDirPath: string, subDirName: string, exts: string[]): Promise<string[]> {
    const results: string[] = [];
    try {
        const deepEntries = await readdir(join(subDirPath, subDirName), { withFileTypes: true });
        for (const deepEntry of deepEntries) {
            if (!deepEntry.isDirectory() && isEntryPoint(deepEntry.name, exts)) {
                results.push(join(subDirPath, subDirName, deepEntry.name));
            }
        }
    } catch { /* ignore */ }
    return results;
}

async function collectSubDirEntries(subDirPath: string, exts: string[]): Promise<string[]> {
    const results: string[] = [];
    try {
        const subEntries = await readdir(subDirPath, { withFileTypes: true });
        for (const subEntry of subEntries) {
            if (!subEntry.isDirectory()) {
                if (isEntryPoint(subEntry.name, exts)) results.push(join(subDirPath, subEntry.name));
            } else {
                results.push(...await collectDeepEntries(subDirPath, subEntry.name, exts));
            }
        }
    } catch { /* ignore */ }
    return results;
}

export async function findEntryPoints(entryPointPath: string, exts: string[]): Promise<string[]> {
    try {
        const entryPoints: string[] = [];
        const entries = await readdir(entryPointPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (entry.name === "built" || entry.name === "dist" || entry.name === "node_modules") continue;
                entryPoints.push(...await collectSubDirEntries(join(entryPointPath, entry.name), exts));
            } else if (isEntryPoint(entry.name, exts)) {
                // Same rule as subfolders: siblings such as footer.css are
                // partials imported by index.css, not bundles of their own.
                entryPoints.push(join(entryPointPath, entry.name));
            }
        }
        return entryPoints;
    } catch {
        return [];
    }
}

export async function loadEnv() {
    const envPath = join(process.cwd(), ".env");
    if (existsSync(envPath)) {
        try {
            const content = await readFile(envPath, "utf8");
            content.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#")).forEach(line => {
                const parts = line.split("=");
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join("=").trim().replace(/^["']|["']$/g, "");
                    process.env[key] = value;
                }
            });
        } catch (e) {
            // Ignore env loading errors
        }
    }
}

async function downloadFile(url: string, dest: string) {
    const dir = dirname(dest);
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }

    try {
        const result = spawnSync("curl", ["-s", "-L", url, "-o", dest], { stdio: ['pipe', 'pipe', 'inherit'] });
        if (result.status !== 0) {
            throw new Error(`Curl exited with status ${result.status}`);
        }
    } catch (e) {
        if (existsSync(dest)) {
            try {
                await unlink(dest);
            } catch { }
        }
        throw new Error(`Failed to download ${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
}

function loadImageSizes(folderPath: string): Record<string, { width: number }> {
    const defaults: Record<string, { width: number }> = {
        xxs: { width: 30 },
        xs: { width: 100 },
        s: { width: 300 },
        m: { width: 600 },
        l: { width: 1000 },
        xl: { width: 2000 },
    };
    try {
        const pkgContent = readFileSync(join(folderPath, "package.json"), "utf8");
        const pkg = JSON.parse(pkgContent);
        return pkg.config?.image_sizes ?? defaults;
    } catch {
        return defaults;
    }
}

const IMAGE_FILE_RE = /\.(jpg|jpeg|png|webp|avif|svg)$/i;

/** Output paths for one source image, e.g. `assets/built/img/a-300.jpg`, `.webp`, `.avif`. */
function imageOutputPaths(
    targetPath: string,
    ext: string,
    imageSizes: Record<string, { width: number }>,
): { width: number; original: string; webp: string | null; avif: string | null }[] {
    const basePath = targetPath.slice(0, -ext.length || undefined);
    return Object.values(imageSizes).map(({ width }) => ({
        width,
        original: `${basePath}-${width}${ext}`,
        webp: ext.toLowerCase() !== ".webp" ? `${basePath}-${width}.webp` : null,
        avif: ext.toLowerCase() !== ".avif" ? `${basePath}-${width}.avif` : null,
    }));
}

async function processImageFile(
    file: string,
    imgDir: string,
    builtImgDir: string,
    imageSizes: Record<string, { width: number }>,
    force: boolean,
): Promise<void> {
    const relativePath = file.replace(imgDir, "");
    const targetPath = join(builtImgDir, relativePath);
    const targetDir = dirname(targetPath);

    if (!existsSync(targetDir)) await mkdir(targetDir, { recursive: true });

    if (file.toLowerCase().endsWith(".svg")) {
        await copyFile(file, targetPath);
        return;
    }

    const ext = extname(file);
    const lowerExt = ext.slice(1).toLowerCase();
    const format = lowerExt === "jpg" ? "jpeg" : lowerExt as "webp" | "avif" | "jpeg" | "png";

    // Loaded on demand: sharp is a large native module most commands never need.
    const { default: sharp } = await import("sharp");
    const source = sharp(file);
    const jobs: Promise<unknown>[] = [];

    for (const out of imageOutputPaths(targetPath, ext, imageSizes)) {
        const targets = [out.original, out.webp, out.avif].filter((t): t is string => t !== null);
        if (!force && await checkFileUptodate(file, targets)) continue;

        const resized = () => source.clone().rotate().resize({ width: out.width, withoutEnlargement: true });
        jobs.push(resized()[format]().toFile(out.original));
        if (out.webp) jobs.push(resized().webp({ quality: 80 }).toFile(out.webp));
        if (out.avif) jobs.push(resized().avif({ quality: 80 }).toFile(out.avif));
    }

    await Promise.all(jobs);
}

export async function optimizeImages(folderPath: string, force = false) {
    const imgDir = join(folderPath, "src/img");
    const builtImgDir = join(folderPath, "assets/built/img");

    if (!existsSync(imgDir)) return;

    const imageSizes = loadImageSizes(folderPath);
    const files = await findFilesRecursively(imgDir);
    const imageFiles = files.filter((f) => IMAGE_FILE_RE.test(f));

    for (const file of imageFiles) {
        await processImageFile(file, imgDir, builtImgDir, imageSizes, force);
    }
}

/** Optimizes one image from src/img (path relative to the theme or absolute). */
export async function optimizeImage(file: string, folderPath: string, force = false) {
    if (!IMAGE_FILE_RE.test(file)) return;
    const imgDir = join(folderPath, "src/img");
    const builtImgDir = join(folderPath, "assets/built/img");
    await processImageFile(resolve(folderPath, file), imgDir, builtImgDir, loadImageSizes(folderPath), force);
}

/** Deletes the built outputs of an image that was removed from src/img. */
export async function removeImageOutputs(file: string, folderPath: string) {
    const imgDir = join(folderPath, "src/img");
    const builtImgDir = join(folderPath, "assets/built/img");
    const targetPath = join(builtImgDir, resolve(folderPath, file).replace(imgDir, ""));
    const ext = extname(file);

    const targets = ext.toLowerCase() === ".svg"
        ? [targetPath]
        : imageOutputPaths(targetPath, ext, loadImageSizes(folderPath)).flatMap((o) =>
            [o.original, o.webp, o.avif].filter((t): t is string => t !== null));

    await Promise.all(targets.map((t) => unlink(t).catch(() => undefined)));
}

async function checkFileUptodate(source: string, targets: string[]): Promise<boolean> {
    try {
        const sourceMtime = lstatSync(source).mtimeMs;
        for (const target of targets) {
            if (!existsSync(target)) return false;
            const targetMtime = lstatSync(target).mtimeMs;
            if (targetMtime < sourceMtime) return false;
        }
        return true;
    } catch {
        return false;
    }
}
