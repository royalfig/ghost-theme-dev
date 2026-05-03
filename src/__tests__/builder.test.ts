import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  writeAssets,
  inlineCritical,
  tree,
  BuildResult,
  CompilationDetails,
} from "../builder.js";

// Mock esbuild
vi.mock("esbuild", () => ({
  build: vi.fn(),
}));

// Mock fs and fs/promises
vi.mock("node:fs", () => ({
  readdirSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock utils
vi.mock("../utils.js", () => ({
  formatBytes: vi.fn((bytes: number) => `${bytes} bytes`),
  GtbConfig: vi.fn(),
  logToFile: vi.fn(),
}));

// Mock constants
vi.mock("../constants.js", () => ({
  EXTERNAL_ASSETS: [
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.svg",
    "*.gif",
    "*.woff",
    "*.woff2",
    "*.ttf",
    "*.otf",
  ],
}));

// Mock lightningcss and browserslist
vi.mock("lightningcss", () => ({
  transform: vi.fn(() => ({ code: Buffer.from(""), map: undefined })),
  Features: {
    Nesting: 1,
    CustomProperties: 2,
    ContainerQueries: 4,
    MediaQueries: 8,
    Colors: 16,
  },
  browserslistToTargets: vi.fn((x) => x),
}));

vi.mock("browserslist", () => ({
  default: vi.fn(() => ["chrome >= 90", "firefox >= 88", "safari >= 14"]),
}));

import * as esbuild from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";

function makeMetafile(
  outputs: Record<
    string,
    {
      bytes: number;
      entryPoint?: string;
      inputs?: Record<string, { bytesInOutput: number }>;
    }
  >,
  inputs?: Record<string, { bytes: number }>,
) {
  return {
    metafile: {
      inputs: inputs || {},
      outputs,
    },
  };
}

describe("writeAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tree.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should build assets successfully", async () => {
    const mockEsbuild = vi.mocked(esbuild);

mockEsbuild.build.mockResolvedValue(
      makeMetafile(
        {
          "assets/built/js/index.js": {
            bytes: 512,
            entryPoint: "src/js/index.ts",
            inputs: { "src/js/index.ts": { bytesInOutput: 512 } },
          },
        },
        { "src/js/index.ts": { bytes: 1024 } },
      ) as any,
    );

    const result = await writeAssets(["src/js/index.ts"], 3000, false);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      file: "assets/built/js/index.js",
      value: "512 bytes",
    });
    expect(result.time).toBeGreaterThan(0);
  });

  it("should handle critical assets and call inlineCritical", async () => {
    const mockEsbuild = vi.mocked(esbuild);
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);
    const mockReaddirSync = vi.mocked(readdirSync);

    // writeAssets build
    mockEsbuild.build.mockResolvedValue(
      makeMetafile(
        {
          "assets/built/js/critical/index.js": {
            bytes: 512,
            entryPoint: "src/js/critical/index.ts",
            inputs: {
              "src/js/critical/index.ts": { bytesInOutput: 512 },
            },
          },
        },
        { "src/js/critical/index.ts": { bytes: 1024 } },
      ) as any,
    );

    const CSS_TAG =
      '<link rel="stylesheet" href="{{asset "built/css/critical/index.css"}}">';

    // inlineCritical reads: default.hbs, then critical css (may fail), then getCriticalDirs
    mockReadFile
      .mockResolvedValueOnce(`<!DOCTYPE html><head>${CSS_TAG}</head>` as any)
      .mockResolvedValueOnce("/* critical css */" as any);

    mockReaddirSync
      .mockReturnValueOnce([] as any)
      .mockReturnValueOnce([] as any);

    mockWriteFile.mockResolvedValue();

    vi.spyOn(console, "log").mockImplementation(() => {});

    await writeAssets(["src/js/critical/index.ts"], 3000, false);

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining("<style>/* critical css */</style>"),
    );
  });

  it("should not inline critical if tags not found in template", async () => {
    const mockEsbuild = vi.mocked(esbuild);
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);

    mockEsbuild.build.mockResolvedValue(
      makeMetafile(
        {
          "assets/built/js/critical/index.js": {
            bytes: 512,
            entryPoint: "src/js/critical/index.ts",
            inputs: {
              "src/js/critical/index.ts": { bytesInOutput: 512 },
            },
          },
        },
        { "src/js/critical/index.ts": { bytes: 1024 } },
      ) as any,
    );

    // Template without the expected tags
    mockReadFile.mockResolvedValue("plain template content" as any);
    mockWriteFile.mockResolvedValue();

    await writeAssets(["src/js/critical/index.ts"], 3000, false);

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.not.stringContaining("<script>"),
    );
  });

  it("should handle build errors gracefully in watch mode", async () => {
    const mockEsbuild = vi.mocked(esbuild);

    mockEsbuild.build.mockRejectedValue(new Error("Build failed"));

    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await writeAssets(["src/js/index.ts"], 3000, true);

    expect(result.results).toHaveLength(0);
    expect(result.time).toBe(0);
  });

  it("should throw error in production mode", async () => {
    const mockEsbuild = vi.mocked(esbuild);

    mockEsbuild.build.mockRejectedValue(new Error("Build failed"));

    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      writeAssets(["src/js/index.ts"], 3000, false),
    ).rejects.toThrow("Build failed");
  });

  it("should handle multiple entry points", async () => {
    const mockEsbuild = vi.mocked(esbuild);

    // writeAssets splits entries: mainEntry (src/js/index*) builds separately from others
    // So esbuild.build is called twice with different entry sets
    mockEsbuild.build
      .mockResolvedValueOnce(
        makeMetafile(
          {
            "assets/built/js/index.js": {
              bytes: 512,
              entryPoint: "src/js/index.ts",
              inputs: { "src/js/index.ts": { bytesInOutput: 512 } },
            },
          },
          { "src/js/index.ts": { bytes: 1024 } },
        ) as any,
      )
      .mockResolvedValueOnce(
        makeMetafile(
          {
            "assets/built/css/index.css": {
              bytes: 256,
              entryPoint: "src/css/index.css",
              inputs: { "src/css/index.css": { bytesInOutput: 256 } },
            },
          },
          { "src/css/index.css": { bytes: 512 } },
        ) as any,
      );

    const result = await writeAssets(
      ["src/js/index.ts", "src/css/index.css"],
      3000,
      false,
    );

    expect(result.results).toHaveLength(2);
  });

  it("should populate tree with input-to-entryPoint mapping", async () => {
    const mockEsbuild = vi.mocked(esbuild);

    mockEsbuild.build.mockResolvedValue(
      makeMetafile(
        {
          "assets/built/js/index.js": {
            bytes: 512,
            entryPoint: "src/js/index.ts",
            inputs: {
              "src/js/index.ts": { bytesInOutput: 400 },
              "src/js/util.ts": { bytesInOutput: 112 },
            },
          },
        },
        { "src/js/index.ts": { bytes: 1024 } },
      ) as any,
    );

    await writeAssets(["src/js/index.ts"], 3000, false);

    expect(tree.get("src/js/index.ts")).toBe("src/js/index.ts");
    expect(tree.get("src/js/util.ts")).toBe("src/js/index.ts");
  });

  it("should skip .map files in results", async () => {
    const mockEsbuild = vi.mocked(esbuild);

    mockEsbuild.build.mockResolvedValue(
      makeMetafile(
        {
          "assets/built/js/index.js": {
            bytes: 512,
            entryPoint: "src/js/index.ts",
            inputs: { "src/js/index.ts": { bytesInOutput: 512 } },
          },
          "assets/built/js/index.js.map": {
            bytes: 256,
            inputs: { "src/js/index.ts": { bytesInOutput: 256 } },
          },
        },
        { "src/js/index.ts": { bytes: 1024 } },
      ) as any,
    );

    const result = await writeAssets(["src/js/index.ts"], 3000, false);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].file).not.toContain(".map");
  });
});

describe("inlineCritical", () => {
  const CSS_TAG =
    '<link rel="stylesheet" href="{{asset "built/css/critical/index.css"}}">';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should inline critical CSS", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);
    const mockReaddirSync = vi.mocked(readdirSync);

    // Call order: 1=default-template.hbs, 2=css/critical/index.css, 3=getCriticalDirs css, 4=getCriticalDirs js
    mockReadFile
      .mockResolvedValueOnce(`<head>${CSS_TAG}</head>` as any)
      .mockResolvedValueOnce("/* critical css */" as any);

    mockReaddirSync
      .mockReturnValueOnce([] as any)
      .mockReturnValueOnce([] as any);

    mockWriteFile.mockResolvedValue();

    vi.spyOn(console, "log").mockImplementation(() => {});

    await inlineCritical();

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining("<style>/* critical css */</style>"),
    );
  });

  it("should not inline if tags not found", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);
    const mockReaddirSync = vi.mocked(readdirSync);

    mockReadFile
      .mockResolvedValueOnce("no tags here" as any)
      .mockRejectedValueOnce(new Error("Not found"));

    mockReaddirSync
      .mockReturnValueOnce([] as any)
      .mockReturnValueOnce([] as any);

    mockWriteFile.mockResolvedValue();

    vi.spyOn(console, "log").mockImplementation(() => {});

    await inlineCritical();

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.not.stringContaining("<style>"),
    );
  });

  it("should handle missing critical files", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);
    const mockReaddirSync = vi.mocked(readdirSync);

    mockReadFile
      .mockResolvedValueOnce(`<head>${CSS_TAG}</head>` as any)
      .mockRejectedValueOnce(new Error("Not found"));

    mockReaddirSync
      .mockReturnValueOnce([] as any)
      .mockReturnValueOnce([] as any);

    mockWriteFile.mockResolvedValue();

    vi.spyOn(console, "log").mockImplementation(() => {});

    await inlineCritical();

    // No CSS content, template unchanged (tags remain)
    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining(CSS_TAG),
    );
  });

  it("should handle write errors gracefully", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);
    const mockReaddirSync = vi.mocked(readdirSync);

    mockReadFile.mockResolvedValueOnce("test content" as any);
    mockWriteFile.mockRejectedValue(new Error("Write failed"));

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(inlineCritical()).resolves.not.toThrow();
  });
});

describe("BuildResult and CompilationDetails", () => {
  it("should create BuildResult interface", () => {
    const result: BuildResult = {
      file: "src/built/js/index.js",
      value: "512 bytes",
    };

    expect(result.file).toBe("src/built/js/index.js");
    expect(result.value).toBe("512 bytes");
  });

  it("should create CompilationDetails interface", () => {
    const details: CompilationDetails = {
      results: [{ file: "src/built/js/index.js", value: "512 bytes" }],
      time: 123.45,
    };

    expect(details.results).toHaveLength(1);
    expect(details.time).toBe(123.45);
  });
});

describe("inlineCritical - multiple templates", () => {
  const CSS_TAG =
    '<link rel="stylesheet" href="{{asset "built/css/critical/index.css"}}">';
  const HOME_CSS_TAG =
    '<link rel="stylesheet" href="{{asset "built/css/critical/home/index.css"}}">';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset readdirSync mock
    const mockReaddirSync = vi.mocked(readdirSync);
    mockReaddirSync.mockReset();
    mockReaddirSync.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should inline CSS for all critical directories", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);
    const mockReaddirSync = vi.mocked(readdirSync);

    // Call order:
    // 1=default-template.hbs, 2=css/critical/index.css, 3=getCriticalDirs css, 4=getCriticalDirs js
    // then for home dir: read css/critical/home/index.css
    mockReadFile
      .mockResolvedValueOnce(
        `<head>${CSS_TAG}${HOME_CSS_TAG}</head>` as any,
      )
      .mockResolvedValueOnce("/* default css */" as any)
      .mockResolvedValueOnce("/* home css */" as any);

    mockReaddirSync
      .mockReturnValueOnce([
        { name: "index", isDirectory: () => true },
        { name: "home", isDirectory: () => true },
      ] as any)
      .mockReturnValueOnce([
        { name: "index", isDirectory: () => true },
        { name: "home", isDirectory: () => true },
      ] as any);

    await inlineCritical();

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining("<style>/* default css */</style>"),
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining("<style>/* home css */</style>"),
    );
  });

  it("should skip directories without CSS files", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);
    const mockReaddirSync = vi.mocked(readdirSync);

    // Call order:
    // 1=default-template.hbs, 2=css/critical/index.css, 3=getCriticalDirs css, 4=getCriticalDirs js
    // then for home dir: try to read its CSS (fails)
    mockReadFile
      .mockResolvedValueOnce(
        `<head>${CSS_TAG}${HOME_CSS_TAG}</head>` as any,
      )
      .mockRejectedValueOnce(new Error("ENOENT"));

    mockReaddirSync
      .mockReturnValueOnce([
        { name: "index", isDirectory: () => true },
        { name: "home", isDirectory: () => true },
      ] as any)
      .mockReturnValueOnce([
        { name: "index", isDirectory: () => true },
        { name: "home", isDirectory: () => true },
      ] as any);

    await inlineCritical();

    // index.css didn't load, so no inlining happened
    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining(CSS_TAG),
    );
  });

  it("should skip tags not found in template", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);
    const mockReaddirSync = vi.mocked(readdirSync);

    // Template has home tag but no index tag
    mockReadFile
      .mockResolvedValueOnce(`<head>${HOME_CSS_TAG}</head>` as any)
      .mockResolvedValueOnce("/* default css */" as any)
      .mockResolvedValueOnce("/* home css */" as any);

    mockReaddirSync
      .mockReturnValueOnce([
        { name: "index", isDirectory: () => true },
        { name: "home", isDirectory: () => true },
      ] as any)
      .mockReturnValueOnce([
        { name: "index", isDirectory: () => true },
        { name: "home", isDirectory: () => true },
      ] as any);

    await inlineCritical();

    // home tag replaced, index tag never existed in template so remains untouched
    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining("<style>/* home css */</style>"),
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.not.stringContaining(CSS_TAG),
    );
  });

  it("should handle no critical directories found", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);
    const mockReaddirSync = vi.mocked(readdirSync);

    mockReadFile
      .mockResolvedValueOnce(`<head>${CSS_TAG}</head>` as any)
      .mockResolvedValueOnce("/* default css */" as any);

    mockReaddirSync
      .mockReturnValueOnce([] as any)
      .mockReturnValueOnce([] as any);

    await inlineCritical();

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining("<style>/* default css */</style>"),
    );
  });
});