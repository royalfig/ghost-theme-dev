import { execSync, spawnSync } from "node:child_process";
import { readdir, stat, readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import chalk from "chalk";

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
        execSync(`command -v ${command} > /dev/null 2>&1`);
        return true;
    } catch (e) {
        return false;
    }
}

let nodeVersionChecked = false;

export function checkNodeVersion() {
    if (nodeVersionChecked) return;
    nodeVersionChecked = true;

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
    return output ? output.toString() : "";
  } catch (error) {
    if (silent) return null;
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
    } catch (e) {
        // Directory doesn't exist or is not readable
    }
  }

  await traverseDirectory(directory);
  return files;
}

export async function findEntryPoints(entryPointPath: string, exts: string[]): Promise<string[]> {
  try {
    const files = await findFilesRecursively(entryPointPath);
    const entryPoints = files.filter(
      (file) => (file.includes("index") || file.includes("critical")) && exts.some((ext) => file.endsWith(ext))
    );
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
        const result = spawnSync("curl", ["-s", "-L", url, "-o", dest]);
        if (result.status !== 0) {
            throw new Error(`Curl exited with status ${result.status}`);
        }
    } catch (e) {
        throw new Error(`Failed to download ${url}: ${e}`);
    }
}
