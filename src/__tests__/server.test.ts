import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import chalk from "chalk";

// Disable chalk colors for predictable assertions
chalk.level = 0;

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => JSON.stringify({ version: "3.0.0" })),
}));

let currentMockWsServer: any = null;

vi.mock("ws", () => {
  const MockWebSocket = vi.fn() as any;
  MockWebSocket.OPEN = 1;
  return {
    default: MockWebSocket,
    WebSocket: MockWebSocket,
    WebSocketServer: vi.fn().mockImplementation(class {
      constructor() { return currentMockWsServer; }
    } as any),
  };
});

vi.mock("../builder.js", () => {
  const tree = new Map<string, Set<string>>();
  return {
    tree,
    writeAssets: vi.fn(),
    inlineCritical: vi.fn(async () => true),
    forgetEntry: vi.fn(async () => {}),
    dependentsOf: (path: string) => [...(tree.get(path) ?? [])],
  };
});

vi.mock("../utils.js", () => ({
  GtbConfig: vi.fn(),
  logToFile: vi.fn(),
  findEntryPoints: vi.fn(async () => []),
  optimizeImage: vi.fn(async () => {}),
  removeImageOutputs: vi.fn(async () => {}),
}));

import { printCompilationDetails, printHeader, initWs, classifyChange } from "../server.js";
import { tree, writeAssets, inlineCritical } from "../builder.js";
import { optimizeImage, findEntryPoints } from "../utils.js";
import type { CompilationDetails } from "../builder.js";
import { WebSocketServer } from "ws";

function captureOutput(fn: () => void): string {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "clear").mockImplementation(() => {});
  fn();
  const output = spy.mock.calls.map((call) => call.join(" ")).join("\n");
  return output;
}

describe("printCompilationDetails", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should print compilation details with change", () => {
    const mockDetails: CompilationDetails = {
      results: [
        { file: "assets/built/js/index.js", value: "512 bytes" },
        { file: "assets/built/css/index.css", value: "256 bytes" },
      ],
      time: 123.45,
    };

    const output = captureOutput(() =>
      printCompilationDetails(mockDetails, "assets/js/index.ts"),
    );

    expect(output).toContain("Change detected");
    expect(output).toContain("assets/built/js/index.js");
    expect(output).toContain("assets/built/css/index.css");
    expect(output).toContain("123.45ms");
  });

  it("should print 'Change detected' when no change path and not first time", () => {
    const mockDetails: CompilationDetails = {
      results: [{ file: "assets/built/js/index.js", value: "512 bytes" }],
      time: 123.45,
    };

    const output = captureOutput(() => printCompilationDetails(mockDetails));

    expect(output).toContain("Change detected");
    expect(output).toContain("assets/built/js/index.js");
  });

  it("should print 'Building...' on first time compilation", () => {
    const mockDetails: CompilationDetails = {
      results: [{ file: "assets/built/js/index.js", value: "512 bytes" }],
      time: 123.45,
    };

    const output = captureOutput(() =>
      printCompilationDetails(mockDetails, null, true),
    );

    expect(output).toContain("Building...");
    expect(output).not.toContain("Change detected");
  });

  it("should handle empty results", () => {
    const mockDetails: CompilationDetails = {
      results: [],
      time: 0,
    };

    const output = captureOutput(() => printCompilationDetails(mockDetails));

    expect(output).toContain("Done in");
  });
});

describe("printHeader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should print header with version", () => {
    const output = captureOutput(() =>
      printHeader("http://localhost:3000", false, false),
    );

    expect(output).toContain("v3.0.0");
    expect(output).toContain("http://localhost:3000");
  });

  it("should print header with connection error", () => {
    const output = captureOutput(() =>
      printHeader("http://localhost:3000", true, false),
    );

    expect(output).toContain("No connection");
  });

  it("should print header on first connection", () => {
    const output = captureOutput(() =>
      printHeader("http://localhost:3000", false, true),
    );

    expect(output).toContain("Connected");
  });

  it("should show Visit message when no site data", () => {
    const output = captureOutput(() =>
      printHeader("http://localhost:3000", false, false),
    );

    expect(output).toContain("Visit");
  });
});

describe("classifyChange", () => {
  const entries = new Set(["src/css/index.css"]);

  it("classifies theme files", () => {
    expect(classifyChange("default.hbs", entries)).toBe("ignore");
    expect(classifyChange("default-template.hbs", entries)).toBe("layout");
    expect(classifyChange("partials/distance.hbs", entries)).toBe("template");
    expect(classifyChange("src/css/components/card.css", entries)).toBe("source");
    expect(classifyChange("src/img/a.png", entries)).toBe("image");
    expect(classifyChange("assets/fonts/inter.woff2", entries)).toBe("asset");
    expect(classifyChange("package.json", entries)).toBe("package");
    expect(classifyChange("locales/en.json", entries)).toBe("locale");
    expect(classifyChange("gtb.config.js", entries)).toBe("ignore");
    expect(classifyChange("tsconfig.json", entries)).toBe("ignore");
  });
});

describe("initWs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tree.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function getWatcherCallback(mockWatcher: any) {
    return mockWatcher.on.mock.calls.find((call: any[]) => call[0] === "all")?.[1];
  }

  function getConnectionCallback(mockWsServer: any) {
    return mockWsServer.on.mock.calls.find((call: any[]) => call[0] === "connection")?.[1];
  }

  function setupInitWs() {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "clear").mockImplementation(() => {});

    const sent: any[] = [];
    const client = { readyState: 1, send: (m: string) => sent.push(JSON.parse(m)) };
    const mockWsServer = {
      on: vi.fn(),
      clients: new Set([client]),
    };
    currentMockWsServer = mockWsServer;
    vi.mocked(writeAssets).mockResolvedValue({ results: [], time: 0 });

    const mockWatcher = { on: vi.fn() };

    return { mockWsServer, mockWatcher, sent };
  }

  async function start(entries: string[] = ["src/css/index.css", "src/js/index.ts"]) {
    const ctx = setupInitWs();
    const handle = await initWs({ results: [], time: 0 }, 3000, "http://localhost:2368", ctx.mockWatcher as any, {}, entries);
    const fire = getWatcherCallback(ctx.mockWatcher);
    const settle = async () => {
      await vi.advanceTimersByTimeAsync(100);
      await handle.idle();
    };
    return { ...ctx, fire, settle };
  }

  function built(outputs: string[]) {
    vi.mocked(writeAssets).mockResolvedValueOnce({
      results: outputs.map((file) => ({ file, value: "1 KiB" })),
      time: 1,
      outputs,
      errors: [],
      warnings: [],
    });
  }

  it("should initialize WebSocket server on the given port", async () => {
    await start();
    expect(WebSocketServer).toHaveBeenCalledWith({ port: 3000 });
  });

  it("hot-swaps CSS when a stylesheet entry changes", async () => {
    const { fire, settle, sent } = await start();
    built(["assets/built/css/index.css"]);

    fire("change", "src/css/index.css");
    await settle();

    expect(writeAssets).toHaveBeenCalledWith(["src/css/index.css"], 3000, true, {}, { renderTemplate: false });
    expect(sent).toEqual([{ type: "css", files: ["built/css/index.css"], source: "src/css/index.css" }]);
  });

  it("rebuilds every entry that imports a changed partial", async () => {
    const { fire, settle } = await start(["src/css/index.css", "src/css/critical/index.css"]);
    tree.set("src/css/card.css", new Set(["src/css/index.css", "src/css/critical/index.css"]));
    built(["assets/built/css/index.css", "assets/built/css/critical/index.css"]);

    fire("change", "src/css/card.css");
    await settle();

    expect(vi.mocked(writeAssets).mock.calls[0][0].sort()).toEqual(["src/css/critical/index.css", "src/css/index.css"]);
  });

  it("reloads instead of hot-swapping when a critical asset changed", async () => {
    const { fire, settle, sent } = await start(["src/css/critical/index.css"]);
    built(["assets/built/css/critical/index.css"]);

    fire("change", "src/css/critical/index.css");
    await settle();

    expect(sent).toEqual([{ type: "reload", reason: "critical asset changed (inlined in default.hbs)" }]);
  });

  it("reloads on JS changes", async () => {
    const { fire, settle, sent } = await start();
    built(["assets/built/js/index.js"]);

    fire("change", "src/js/index.ts");
    await settle();

    expect(sent).toEqual([{ type: "reload", reason: "JS changed: src/js/index.ts" }]);
  });

  it("sends the error and does not reload when the build fails", async () => {
    const { fire, settle, sent } = await start();
    vi.mocked(writeAssets).mockResolvedValueOnce({
      results: [],
      time: 0,
      outputs: [],
      errors: [{ file: "src/js/index.ts", text: "src/js/index.ts:1:6: Expected identifier", pretty: "x" }],
      warnings: [],
    });

    fire("change", "src/js/index.ts");
    await settle();

    expect(sent).toEqual([
      { type: "error", file: "src/js/index.ts", message: "src/js/index.ts:1:6: Expected identifier" },
    ]);
  });

  it("coalesces a burst of template saves into one reload", async () => {
    const { fire, settle, sent } = await start();

    fire("change", "partials/card.hbs");
    fire("change", "partials/card.hbs");
    fire("change", "partials/card.hbs");
    await settle();

    expect(sent).toEqual([{ type: "reload", reason: "template changed: partials/card.hbs" }]);
  });

  it("ignores gtb's own writes to default.hbs", async () => {
    const { fire, settle, sent } = await start();

    fire("change", "default.hbs");
    await settle();

    expect(sent).toEqual([]);
    expect(writeAssets).not.toHaveBeenCalled();
  });

  it("re-renders default.hbs when the layout template changes", async () => {
    const { fire, settle, sent } = await start();

    fire("change", "default-template.hbs");
    await settle();

    expect(inlineCritical).toHaveBeenCalledWith("assets/built", "default-template.hbs", 3000);
    expect(sent).toEqual([{ type: "reload", reason: "layout changed: default-template.hbs" }]);
  });

  it("optimizes just the changed image and reloads", async () => {
    const { fire, settle, sent } = await start();

    fire("add", "src/img/hero.png");
    await settle();

    expect(optimizeImage).toHaveBeenCalledWith("src/img/hero.png", process.cwd());
    expect(sent).toEqual([{ type: "reload", reason: "image added: src/img/hero.png" }]);
  });

  it("builds an entry point added while dev is running", async () => {
    const { fire, settle, sent } = await start([]);
    vi.mocked(findEntryPoints).mockImplementation(async (dir: string) => (dir === "src/css" ? ["src/css/post.css"] : []));
    built(["assets/built/css/post.css"]);

    fire("add", "src/css/post.css");
    await settle();

    expect(vi.mocked(writeAssets).mock.calls[0][0]).toEqual(["src/css/post.css"]);
    expect(sent).toEqual([{ type: "css", files: ["built/css/post.css"], source: "src/css/post.css" }]);
  });

  it("tells the browser when a changed file isn't imported anywhere", async () => {
    const { fire, settle, sent } = await start();

    fire("change", "src/css/components/orphan.css");
    await settle();

    expect(writeAssets).not.toHaveBeenCalled();
    expect(sent[0]).toMatchObject({ type: "notice" });
    expect(sent[0].message).toContain("orphan.css");
  });

  it("normalizes Windows paths", async () => {
    const { fire, settle } = await start();
    built(["assets/built/css/index.css"]);

    fire("change", "src\\css\\index.css");
    await settle();

    expect(vi.mocked(writeAssets).mock.calls[0][0]).toEqual(["src/css/index.css"]);
  });

  it("should handle WebSocket connection", async () => {
    const { mockWsServer } = await start();

    const connectionCallback = getConnectionCallback(mockWsServer);
    const mockWs = { on: vi.fn(), send: vi.fn() };
    connectionCallback(mockWs);

    expect(mockWs.on).toHaveBeenCalledWith("message", expect.any(Function));
    const messageCallback = mockWs.on.mock.calls.find((call: any[]) => call[0] === "message")?.[1];
    expect(() =>
      messageCallback(JSON.stringify({ url: "http://localhost:2368", title: "Test", version: "6.0" })),
    ).not.toThrow();
    expect(() => messageCallback("invalid json")).not.toThrow();
  });
});
