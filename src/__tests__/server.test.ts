import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import chalk from "chalk";

// Disable chalk colors for predictable assertions
chalk.level = 0;

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

vi.mock("ws", () => {
  const MockWebSocket = vi.fn() as any;
  MockWebSocket.OPEN = 1;
  return {
    default: MockWebSocket,
    WebSocket: MockWebSocket,
    WebSocketServer: vi.fn(),
  };
});

vi.mock("../builder.js", () => ({
  tree: new Map(),
  writeAssets: vi.fn(),
}));

vi.mock("../utils.js", () => ({
  GtbConfig: vi.fn(),
  logToFile: vi.fn(),
}));

import { printCompilationDetails, printHeader, initWs } from "../server.js";
import { tree, writeAssets } from "../builder.js";
import type { CompilationDetails } from "../builder.js";
import { readFileSync } from "node:fs";
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
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ version: "3.0.0" }),
    );

    const output = captureOutput(() =>
      printHeader("http://localhost:3000", false, false),
    );

    expect(output).toContain("v3.0.0");
    expect(output).toContain("http://localhost:3000");
  });

  it("should print header with connection error", () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ version: "3.0.0" }),
    );

    const output = captureOutput(() =>
      printHeader("http://localhost:3000", true, false),
    );

    expect(output).toContain("No connection");
  });

  it("should print header on first connection", () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ version: "3.0.0" }),
    );

    const output = captureOutput(() =>
      printHeader("http://localhost:3000", false, true),
    );

    expect(output).toContain("Connected");
  });

  it("should show Visit message when no site data", () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ version: "3.0.0" }),
    );

    const output = captureOutput(() =>
      printHeader("http://localhost:3000", false, false),
    );

    expect(output).toContain("Visit");
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

  function setupInitWs() {
    vi.useFakeTimers();
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ version: "3.0.0" }),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "clear").mockImplementation(() => {});

    const mockWsServer = {
      on: vi.fn(),
      clients: new Set(),
    };
    vi.mocked(WebSocketServer).mockReturnValue(mockWsServer as any);
    vi.mocked(writeAssets).mockResolvedValue({ results: [], time: 0 });

    const mockWatcher = { on: vi.fn() };

    return { mockWsServer, mockWatcher };
  }

  it("should initialize WebSocket server on the given port", async () => {
    const { mockWatcher } = setupInitWs();

    await initWs(
      { results: [], time: 0 },
      3000,
      "http://localhost:3000",
      mockWatcher as any,
      {},
    );

    expect(WebSocketServer).toHaveBeenCalledWith({ port: 3000 });
  });

  it("should register watcher and connection handlers", async () => {
    const { mockWsServer, mockWatcher } = setupInitWs();

    await initWs(
      { results: [], time: 0 },
      3000,
      "http://localhost:3000",
      mockWatcher as any,
      {},
    );

    expect(mockWatcher.on).toHaveBeenCalledWith("all", expect.any(Function));
    expect(mockWsServer.on).toHaveBeenCalledWith(
      "connection",
      expect.any(Function),
    );
  });

  it("should rebuild on JS/TS file changes", async () => {
    const { mockWatcher } = setupInitWs();

    await initWs(
      { results: [], time: 0 },
      3000,
      "http://localhost:3000",
      mockWatcher as any,
      {},
    );

    const watcherCallback = mockWatcher.on.mock.calls.find(
      (call: any[]) => call[0] === "all",
    )?.[1];

    await watcherCallback("change", "assets/js/index.ts");
    expect(writeAssets).toHaveBeenCalled();
  });

  it("should rebuild on CSS file changes", async () => {
    const { mockWatcher } = setupInitWs();

    await initWs(
      { results: [], time: 0 },
      3000,
      "http://localhost:3000",
      mockWatcher as any,
      {},
    );

    const watcherCallback = mockWatcher.on.mock.calls.find(
      (call: any[]) => call[0] === "all",
    )?.[1];

    await watcherCallback("change", "assets/css/index.css");
    expect(writeAssets).toHaveBeenCalled();
  });

  it("should skip build artifacts", async () => {
    const { mockWatcher } = setupInitWs();

    await initWs(
      { results: [], time: 0 },
      3000,
      "http://localhost:3000",
      mockWatcher as any,
      {},
    );

    const watcherCallback = mockWatcher.on.mock.calls.find(
      (call: any[]) => call[0] === "all",
    )?.[1];

    await watcherCallback("change", "assets/built/js/index.js.map");
    expect(writeAssets).not.toHaveBeenCalled();
  });

  it("should handle WebSocket connection", async () => {
    const { mockWsServer, mockWatcher } = setupInitWs();

    await initWs(
      { results: [], time: 0 },
      3000,
      "http://localhost:3000",
      mockWatcher as any,
      {},
    );

    const connectionCallback = mockWsServer.on.mock.calls.find(
      (call: any[]) => call[0] === "connection",
    )?.[1];

    const mockWs = { on: vi.fn(), send: vi.fn() };
    connectionCallback(mockWs);

    expect(mockWs.on).toHaveBeenCalledWith("message", expect.any(Function));
  });

  it("should handle valid WebSocket messages", async () => {
    const { mockWsServer, mockWatcher } = setupInitWs();

    await initWs(
      { results: [], time: 0 },
      3000,
      "http://localhost:3000",
      mockWatcher as any,
      {},
    );

    const connectionCallback = mockWsServer.on.mock.calls.find(
      (call: any[]) => call[0] === "connection",
    )?.[1];

    const mockWs = { on: vi.fn(), send: vi.fn() };
    connectionCallback(mockWs);

    const messageCallback = mockWs.on.mock.calls.find(
      (call: any[]) => call[0] === "message",
    )?.[1];

    expect(() =>
      messageCallback(
        JSON.stringify({
          url: "http://localhost:3000",
          title: "Test",
          version: "3.0.0",
        }),
      ),
    ).not.toThrow();
  });

  it("should handle malformed WebSocket messages gracefully", async () => {
    const { mockWsServer, mockWatcher } = setupInitWs();

    await initWs(
      { results: [], time: 0 },
      3000,
      "http://localhost:3000",
      mockWatcher as any,
      {},
    );

    const connectionCallback = mockWsServer.on.mock.calls.find(
      (call: any[]) => call[0] === "connection",
    )?.[1];

    const mockWs = { on: vi.fn(), send: vi.fn() };
    connectionCallback(mockWs);

    const messageCallback = mockWs.on.mock.calls.find(
      (call: any[]) => call[0] === "message",
    )?.[1];

    expect(() => messageCallback("invalid json")).not.toThrow();
  });
});
