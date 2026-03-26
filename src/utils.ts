import { execSync, spawnSync } from "node:child_process";
import { readdir, stat, readFile, mkdir, unlink, copyFile, access, constants } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, unlinkSync, readFileSync, lstatSync } from "node:fs";
import chalk from "chalk";
import sharp from "sharp";

export { spawnSync };

export interface GtbConfig {
    assetsDir?: string;
    outDir?: string;
    entryPoints?: {
        js?: string[];
        css?: string[];
    };
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

export async function findEntryPoints(entryPointPath: string, exts: string[]): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const entryPoints: string[] = [];
    const entries = await readdir(entryPointPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === "built" || entry.name === "dist" || entry.name === "node_modules") continue;

        const subDirPath = join(entryPointPath, entry.name);
        try {
          const subEntries = await readdir(subDirPath, { withFileTypes: true });
          for (const subEntry of subEntries) {
            if (!subEntry.isDirectory()) {
              if ((subEntry.name.includes("index") || subEntry.name.includes("critical")) &&
                  exts.some((ext) => subEntry.name.endsWith(ext))) {
                entryPoints.push(join(subDirPath, subEntry.name));
              }
            }
          }
        } catch (e) { /* ignore */ }
      } else {
        if (exts.some(ext => entry.name.endsWith(ext))) {
          entryPoints.push(join(entryPointPath, entry.name));
        }
      }
    }
    return entryPoints;
  } catch (error) {
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

export async function downloadFile(url: string, dest: string) {
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

export async function optimizeImages(folderPath: string, force = false) {
    const imgDir = join(folderPath, "assets/img");
    const builtImgDir = join(folderPath, "assets/built/img");

    if (!existsSync(imgDir)) return;

    let imageSizes = {
        xxs: { width: 30 },
        xs: { width: 100 },
        s: { width: 300 },
        m: { width: 600 },
        l: { width: 1000 },
        xl: { width: 2000 }
    };

    try {
        const pkgContent = readFileSync(join(folderPath, "package.json"), "utf8");
        const pkg = JSON.parse(pkgContent);
        if (pkg.config?.image_sizes) {
            imageSizes = pkg.config.image_sizes;
        }
    } catch { }

    const files = await findFilesRecursively(imgDir);
    const imageFiles = files.filter((f) =>
        /\.(jpg|jpeg|png|webp|avif|svg)$/i.test(f),
    );

    for (const file of imageFiles) {
        const relativePath = file.replace(imgDir, "");
        let targetPath = join(builtImgDir, relativePath);

        const targetDir = dirname(targetPath);

        if (!existsSync(targetDir))
            await mkdir(targetDir, { recursive: true });

        if (file.toLowerCase().endsWith(".svg")) {
            await copyFile(file, targetPath);
        } else {
            const ext = extname(file);
            
            for (const [sizeName, sizeConfig] of Object.entries(imageSizes)) {
                const width = sizeConfig.width;
                
                const originalOutputPath = targetPath.slice(0, -ext.length || undefined) + `-${width}${ext}`;
                const webpOutputPath = targetPath.slice(0, -ext.length || undefined) + `-${width}.webp`;
                const avifOutputPath = targetPath.slice(0, -ext.length || undefined) + `-${width}.avif`;
                
                if (!force && await checkFileUptodate(file, [originalOutputPath, webpOutputPath, avifOutputPath])) {
                    continue;
                }
                
                await sharp(file)
                    .rotate()
                    .resize({ width, withoutEnlargement: true })
                    [ext.slice(1) as "webp" | "avif" | "jpeg" | "png"]()
                    .toFile(originalOutputPath);
                
                if (ext !== ".webp") {
                    await sharp(file)
                        .rotate()
                        .resize({ width, withoutEnlargement: true })
                        .webp({ quality: 80 })
                        .toFile(webpOutputPath);
                }
                
                if (ext !== ".avif") {
                    await sharp(file)
                        .rotate()
                        .resize({ width, withoutEnlargement: true })
                        .avif({ quality: 80 })
                        .toFile(avifOutputPath);
                }
            }
        }
    }
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
