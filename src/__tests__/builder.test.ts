import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  writeAssets,
  inlineCritical,
  tree,
  BuildResult,
  CompilationDetails,
} from "../builder.js";
import { formatBytes, GtbConfig, logToFile } from "../utils.js";
import { ASSET_LOADERS } from "../constants.js";

// Mock esbuild
vi.mock("esbuild", () => ({
  build: vi.fn(),
}));

vi.mock("esbuild-style-plugin", () => ({
  default: vi.fn(),
}));

vi.mock("postcss-import", () => ({
  default: vi.fn(),
}));

vi.mock("autoprefixer", () => ({
  default: vi.fn(),
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  copyFile: vi.fn(),
}));

// Mock utils
vi.mock("../utils.js", () => ({
  formatBytes: vi.fn((bytes: number) => `${bytes} bytes`),
  GtbConfig: vi.fn(),
  logToFile: vi.fn(),
}));

// Mock constants
vi.mock("../constants.js", () => ({
  ASSET_LOADERS: {
    ".ts": "ts",
    ".js": "js",
    ".css": "css",
  },
}));

import * as esbuild from "esbuild";
import { readFile, writeFile } from "node:fs/promises";

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
            entryPoint: "assets/js/index.ts",
            inputs: { "assets/js/index.ts": { bytesInOutput: 512 } },
          },
        },
        { "assets/js/index.ts": { bytes: 1024 } },
      ) as any,
    );

    const result = await writeAssets(["assets/js/index.ts"], 3000, false);

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

    // writeAssets build
    mockEsbuild.build.mockResolvedValue(
      makeMetafile(
        {
          "assets/built/js/critical/index.js": {
            bytes: 512,
            entryPoint: "assets/js/critical/index.ts",
            inputs: {
              "assets/js/critical/index.ts": { bytesInOutput: 512 },
            },
          },
        },
        { "assets/js/critical/index.ts": { bytes: 1024 } },
      ) as any,
    );

    const JS_TAG =
      '<script src="{{asset "built/js/critical/index.js"}}"></script>';

    // inlineCritical reads: default.hbs, then critical css (may fail), then critical js
    mockReadFile
      .mockResolvedValueOnce(`<!DOCTYPE html><head>${JS_TAG}</head>` as any)
      .mockRejectedValueOnce(new Error("no css"))
      .mockResolvedValueOnce("// critical js" as any);

    mockWriteFile.mockResolvedValue();

    await writeAssets(["assets/js/critical/index.ts"], 3000, false);

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining("<script>// critical js</script>"),
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
            entryPoint: "assets/js/critical/index.ts",
            inputs: {
              "assets/js/critical/index.ts": { bytesInOutput: 512 },
            },
          },
        },
        { "assets/js/critical/index.ts": { bytes: 1024 } },
      ) as any,
    );

    // Template without the expected tags
    mockReadFile.mockResolvedValue("plain template content" as any);
    mockWriteFile.mockResolvedValue();

    await writeAssets(["assets/js/critical/index.ts"], 3000, false);

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.not.stringContaining("<script>"),
    );
  });

  it("should handle build errors gracefully in watch mode", async () => {
    const mockEsbuild = vi.mocked(esbuild);

    mockEsbuild.build.mockRejectedValue(new Error("Build failed"));

    vi.spyOn(console, "error").mockImplementation(() => { });

    const result = await writeAssets(["assets/js/index.ts"], 3000, true);

    expect(result.results).toHaveLength(0);
    expect(result.time).toBe(0);
  });

  it("should throw error in production mode", async () => {
    const mockEsbuild = vi.mocked(esbuild);

    mockEsbuild.build.mockRejectedValue(new Error("Build failed"));

    vi.spyOn(console, "error").mockImplementation(() => { });

    await expect(
      writeAssets(["assets/js/index.ts"], 3000, false),
    ).rejects.toThrow("Build failed");
  });

  it("should handle multiple entry points", async () => {
    const mockEsbuild = vi.mocked(esbuild);

    // writeAssets splits entries: mainEntry (assets/js/index*) builds separately from others
    // So esbuild.build is called twice with different entry sets
    mockEsbuild.build
      .mockResolvedValueOnce(
        makeMetafile(
          {
            "assets/built/js/index.js": {
              bytes: 512,
              entryPoint: "assets/js/index.ts",
              inputs: { "assets/js/index.ts": { bytesInOutput: 512 } },
            },
          },
          { "assets/js/index.ts": { bytes: 1024 } },
        ) as any,
      )
      .mockResolvedValueOnce(
        makeMetafile(
          {
            "assets/built/css/index.css": {
              bytes: 256,
              entryPoint: "assets/css/index.css",
              inputs: { "assets/css/index.css": { bytesInOutput: 256 } },
            },
          },
          { "assets/css/index.css": { bytes: 512 } },
        ) as any,
      );

    const result = await writeAssets(
      ["assets/js/index.ts", "assets/css/index.css"],
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
            entryPoint: "assets/js/index.ts",
            inputs: {
              "assets/js/index.ts": { bytesInOutput: 400 },
              "assets/js/util.ts": { bytesInOutput: 112 },
            },
          },
        },
        { "assets/js/index.ts": { bytes: 1024 } },
      ) as any,
    );

    await writeAssets(["assets/js/index.ts"], 3000, false);

    expect(tree.get("assets/js/index.ts")).toBe("assets/js/index.ts");
    expect(tree.get("assets/js/util.ts")).toBe("assets/js/index.ts");
  });

  it("should skip .map files in results", async () => {
    const mockEsbuild = vi.mocked(esbuild);

    mockEsbuild.build.mockResolvedValue(
      makeMetafile(
        {
          "assets/built/js/index.js": {
            bytes: 512,
            entryPoint: "assets/js/index.ts",
            inputs: { "assets/js/index.ts": { bytesInOutput: 512 } },
          },
          "assets/built/js/index.js.map": {
            bytes: 256,
            inputs: { "assets/js/index.ts": { bytesInOutput: 256 } },
          },
        },
        { "assets/js/index.ts": { bytes: 1024 } },
      ) as any,
    );

    const result = await writeAssets(["assets/js/index.ts"], 3000, false);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].file).not.toContain(".map");
  });
});

describe("inlineCritical", () => {
  const CSS_TAG =
    '<link rel="stylesheet" type="text/css" href="{{asset "built/css/critical/index.css"}}">';
  const JS_TAG =
    '<script src="{{asset "built/js/critical/index.js"}}"></script>';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should inline critical CSS", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);

    mockReadFile
      .mockResolvedValueOnce(`<head>${CSS_TAG}</head>` as any)
      .mockResolvedValueOnce("/* critical css */" as any)
      .mockRejectedValueOnce(new Error("no js"));

    mockWriteFile.mockResolvedValue();

    vi.spyOn(console, "log").mockImplementation(() => { });

    await inlineCritical();

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining("<style>/* critical css */</style>"),
    );
  });

  it("should inline critical JS", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);

    mockReadFile
      .mockResolvedValueOnce(`<head>${JS_TAG}</head>` as any)
      .mockRejectedValueOnce(new Error("no css"))
      .mockResolvedValueOnce("// critical js" as any);

    mockWriteFile.mockResolvedValue();

    vi.spyOn(console, "log").mockImplementation(() => { });

    await inlineCritical();

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining("<script>// critical js</script>"),
    );
  });

  it("should not inline if tags not found", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);

    mockReadFile.mockResolvedValue("no tags here" as any);
    mockWriteFile.mockResolvedValue();

    vi.spyOn(console, "log").mockImplementation(() => { });

    await inlineCritical();

    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.not.stringContaining("<style>"),
    );
  });

  it("should handle missing critical files", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);

    mockReadFile
      .mockResolvedValueOnce(`<head>${CSS_TAG}${JS_TAG}</head>` as any)
      .mockRejectedValueOnce(new Error("Not found"))
      .mockRejectedValueOnce(new Error("Not found"));

    mockWriteFile.mockResolvedValue();

    vi.spyOn(console, "log").mockImplementation(() => { });

    await inlineCritical();

    // No content to inline, template unchanged (tags remain)
    expect(mockWriteFile).toHaveBeenCalledWith(
      "default.hbs",
      expect.stringContaining(CSS_TAG),
    );
  });

  it("should handle write errors gracefully", async () => {
    const mockReadFile = vi.mocked(readFile);
    const mockWriteFile = vi.mocked(writeFile);

    mockReadFile.mockResolvedValue("test content" as any);
    mockWriteFile.mockRejectedValue(new Error("Write failed"));

    vi.spyOn(console, "log").mockImplementation(() => { });
    vi.spyOn(console, "error").mockImplementation(() => { });

    await expect(inlineCritical()).resolves.not.toThrow();
  });
});

describe("BuildResult and CompilationDetails", () => {
  it("should create BuildResult interface", () => {
    const result: BuildResult = {
      file: "assets/built/js/index.js",
      value: "512 bytes",
    };

    expect(result.file).toBe("assets/built/js/index.js");
    expect(result.value).toBe("512 bytes");
  });

  it("should create CompilationDetails interface", () => {
    const details: CompilationDetails = {
      results: [{ file: "assets/built/js/index.js", value: "512 bytes" }],
      time: 123.45,
    };

    expect(details.results).toHaveLength(1);
    expect(details.time).toBe(123.45);
  });
});
