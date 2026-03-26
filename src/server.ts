import chalk from "chalk";
import { readFileSync } from "node:fs";
import WebSocket, { WebSocketServer } from "ws";
import { FSWatcher } from "chokidar";
import { CompilationDetails, tree, writeAssets } from "./builder.js";
import { GtbConfig, logToFile, spawnSync } from "./utils.js";

export interface SiteData {
  url: string;
  title: string;
  version: string | null;
}

let siteData: SiteData | null = null;
let timeoutId: NodeJS.Timeout | null = null;

export function printCompilationDetails(
  content: CompilationDetails,
  change?: string | null,
  firstTime = false,
) {
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
      }${file} (${chalk.bold.magenta(value)})`,
    );
  });
  console.log(chalk.dim("┃"));
  console.log(
    `${chalk.dim("┗━ Done in")} ${content.time.toFixed(2)}ms ${chalk.dim(
      "at",
    )} ${new Date().toLocaleTimeString(undefined, { timeStyle: "short" })}\n`,
  );
}

export function printHeader(
  url: string,
  connectionError = false,
  firstConnection = false,
) {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
  );
  console.clear();
  console.log(
    `${chalk.bold.green("●")}  Ghost theme dev server running (v${pkg.version})...`,
  );

  if (connectionError) {
    console.log(
      chalk.redBright.bold("✘  No connection. "),
      `Try refreshing your browser or visiting ${chalk.underline.blue(url)}.`,
    );
  } else if (firstConnection) {
    console.log(
      chalk.blueBright.bold("➜"),
      ` Connected to ${chalk.underline.blue(url)}.`,
    );
  } else if (siteData?.version) {
    console.log(
      chalk.blueBright.bold("➜"),
      ` Connected to ${chalk.underline.blue(siteData.url)} ${chalk.dim(
        `(${siteData.version})`,
      )}`,
    );
  } else {
    console.log(
      chalk.blueBright.bold("➜"),
      ` Visit ${chalk.underline.blue(url)} to see your changes live.`,
    );
  }
  console.log("");
}

export async function initWs(
  res: CompilationDetails,
  port: number,
  url: string,
  watcher: FSWatcher,
  config?: GtbConfig,
) {
  timeoutId = setTimeout(() => {
    console.clear();
    printHeader(url, true);
  }, 5000);
  printHeader(url);
  printCompilationDetails(res, null, true);

  const wss = new WebSocketServer({
    port,
  });

  let firstConnection = true;

  watcher.on("all", async (event: string, path: string) => {
    logToFile(`File event: ${event} on ${path}`);
    if (path.endsWith(".hbs")) {
      printHeader(url, false, false);
      console.log(chalk.cyanBright(`{{  `), `${path} changed. Reloading...`);
      logToFile(`HBS change: ${path}. Reloading...`);

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send("HBS changed: " + path);
        }
      });
    }

    const isBuildArtifact =
      path.endsWith(".d.ts") ||
      path.endsWith(".map") ||
      path.includes("/assets/built/");
    if (isBuildArtifact) {
      return;
    }

    if (path.endsWith(".css") || path.endsWith(".js") || path.endsWith(".ts")) {
      let rootFile = path;

      if (!/index\.(css|js|ts)$/.test(path)) {
        const entryPoint = tree.get(path);
        if (!entryPoint) {
          logToFile(`No root file found for ${path}`);
          return;
        }
        rootFile = entryPoint;
      }

      logToFile(`Rebuilding ${rootFile} due to change in ${path}`);
      try {
        const res = await writeAssets([rootFile], port, true, config);

        printHeader(url, false, false);
        printCompilationDetails(res, path);

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(`File changed: ${path}`);
          }
        });
      } catch (e) {
        logToFile(`Build error for ${rootFile}: ${e instanceof Error ? e.message : String(e)}`);
        printHeader(url, true);
      }
    }
  });

  wss.on("connection", (ws) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (firstConnection) {
      printHeader(url, false, true);
      firstConnection = false;
    }

    ws.on("message", (message: string) => {
      try {
        const data = JSON.parse(message);
        siteData = data as SiteData;
      } catch (e) {
        // Ignore malformed messages
      }
    });
  });

  watcher.on("close", () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  });
}
