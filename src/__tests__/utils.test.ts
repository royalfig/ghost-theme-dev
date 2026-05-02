import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  appendFileSync: vi.fn(),
  readFileSync: vi.fn(),
  lstatSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  copyFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock("sharp", () => ({
  __esModule: true,
  default: vi.fn(),
}));

import {
  formatBytes,
  loadConfig,
  findEntryPoints,
  hasCommand,
  runCommand,
  loadEnv,
  findFilesRecursively,
  optimizeImages,
} from "../utils.js";
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, lstatSync } from "node:fs";
import { readFile, readdir, stat, copyFile, unlink } from "node:fs/promises";
import sharp from "sharp";

describe("formatBytes", () => {
  it("should format bytes to human-readable format", () => {
    expect(formatBytes(1024)).toBe("1 KiB");
    expect(formatBytes(1048576)).toBe("1 MiB");
    expect(formatBytes(1073741824)).toBe("1 GiB");
  });

  it("should handle zero bytes", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
  });

  it("should handle custom decimals", () => {
    expect(formatBytes(1024, 0)).toBe("1 KiB");
    expect(formatBytes(1024, 4)).toBe("1 KiB");
  });

  it("should handle negative decimals", () => {
    expect(formatBytes(1024, -1)).toBe("1 KiB");
  });

  it("should format non-round values", () => {
    expect(formatBytes(1536)).toBe("1.5 KiB");
  });
});

describe("checkNodeVersion", () => {
  let checkNodeVersion: typeof import("../utils.js").checkNodeVersion;

  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should not warn if execSync fails (e.g. npm not available)", async () => {
    vi.doMock("node:child_process", () => ({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error("not found");
      }),
      spawnSync: vi.fn(),
    }));
    vi.doMock("node:fs", () => ({
      existsSync: vi.fn(),
      appendFileSync: vi.fn(),
    }));
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn(),
      stat: vi.fn(),
      readdir: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
    }));

    const mod = await import("../utils.js");
    mod.checkNodeVersion();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("should warn if version is incompatible", async () => {
    vi.doMock("node:child_process", () => ({
      execSync: vi.fn().mockReturnValue(Buffer.from("^18.0.0")),
      spawnSync: vi.fn(),
    }));
    vi.doMock("node:fs", () => ({
      existsSync: vi.fn(),
      appendFileSync: vi.fn(),
    }));
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn(),
      stat: vi.fn(),
      readdir: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
    }));

    vi.spyOn(process, "versions", "get").mockReturnValue({
      node: "20.0.0",
      ares: "",
      http_parser: "",
      modules: "",
      openssl: "",
      uv: "",
      v8: "",
      zlib: "",
    } as any);

    const mod = await import("../utils.js");
    mod.checkNodeVersion();
    expect(console.warn).toHaveBeenCalled();
  });

  it("should only check once", async () => {
    vi.doMock("node:child_process", () => ({
      execSync: vi.fn().mockReturnValue(Buffer.from("^18.0.0")),
      spawnSync: vi.fn(),
    }));
    vi.doMock("node:fs", () => ({
      existsSync: vi.fn(),
      appendFileSync: vi.fn(),
    }));
    vi.doMock("node:fs/promises", () => ({
      readFile: vi.fn(),
      stat: vi.fn(),
      readdir: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
    }));

    vi.spyOn(process, "versions", "get").mockReturnValue({
      node: "20.0.0",
      ares: "",
      http_parser: "",
      modules: "",
      openssl: "",
      uv: "",
      v8: "",
      zlib: "",
    } as any);

    const mod = await import("../utils.js");
    mod.checkNodeVersion();
    const callCountAfterFirst = (console.warn as any).mock.calls.length;
    expect(callCountAfterFirst).toBeGreaterThan(0);

    mod.checkNodeVersion();
    expect((console.warn as any).mock.calls.length).toBe(callCountAfterFirst);
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty object if no config found", async () => {
    vi.mocked(stat).mockRejectedValue(new Error("Not found"));
    vi.mocked(readFile).mockRejectedValue(new Error("Not found"));
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await loadConfig();
    expect(result).toEqual({});
  });
});

describe("findEntryPoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty array if no entry points found", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("Not found"));

    const result = await findEntryPoints("src/js", [".css"]);
    expect(result).toHaveLength(0);
  });
});

describe("hasCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true if command exists", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    expect(hasCommand("node")).toBe(true);
  });

  it("should return false if command does not exist", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);
    expect(hasCommand("nonexistent-command")).toBe(false);
  });
});

describe("runCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return command output in silent mode", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("hello"));
    const result = runCommand("echo hello", true);
    expect(result).toBe("hello");
  });

  it("should throw error if command fails and not silent", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("Command failed");
    });
    expect(() => runCommand("bad-cmd")).toThrow("Command failed");
  });

  it("should return null if command fails in silent mode", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("Command failed");
    });
    const result = runCommand("bad-cmd", true);
    expect(result).toBeNull();
  });
});

describe("loadEnv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TEST_LOAD_ENV_VAR;
  });

  afterEach(() => {
    delete process.env.TEST_LOAD_ENV_VAR;
  });

  it("should not throw error if .env does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await expect(loadEnv()).resolves.not.toThrow();
  });

  it("should load env variables from .env file", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      "TEST_LOAD_ENV_VAR=hello" as any,
    );
    await loadEnv();
    expect(process.env.TEST_LOAD_ENV_VAR).toBe("hello");
  });
});

describe("findFilesRecursively", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty array if directory does not exist", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("Not found"));
    const result = await findFilesRecursively("nonexistent");
    expect(result).toHaveLength(0);
  });
});

describe("optimizeImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readdir).mockClear();
    vi.mocked(stat).mockClear();
  });

  it("should skip if src/img directory does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await optimizeImages("/test/path");
    expect(vi.mocked(readdir)).not.toHaveBeenCalled();
  });

  it("should copy SVG files without processing", async () => {
    vi.mocked(readdir).mockResolvedValue(["image.svg"] as any);
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as any);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("{}");

    const toFileMock = {
      toFile: vi.fn().mockResolvedValue(undefined),
    };
    const resizeMock = {
      webp: vi.fn().mockReturnValue(toFileMock),
      avif: vi.fn().mockReturnValue(toFileMock),
      jpeg: vi.fn().mockReturnValue(toFileMock),
      jpg: vi.fn().mockReturnValue(toFileMock),
      png: vi.fn().mockReturnValue(toFileMock),
    };
    const rotateMock = {
      resize: vi.fn().mockReturnValue(resizeMock),
    };
    const mockSharp = {
      rotate: vi.fn().mockReturnValue(rotateMock),
    };
    (sharp as any).mockImplementation(() => mockSharp);

    await optimizeImages("/test/path");

    expect(readdir).toHaveBeenCalledWith("/test/path/src/img");
    expect(toFileMock.toFile).not.toHaveBeenCalled();
  });

  it("should process non-SVG images with multiple sizes", async () => {
    const pkgContent = JSON.stringify({
      config: {
        image_sizes: {
          s: { width: 300 },
          m: { width: 600 },
        },
      },
    });

    vi.mocked(readdir).mockResolvedValue(["image.jpg"] as any);
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as any);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(pkgContent);

    const toFileMock = {
      toFile: vi.fn().mockResolvedValue(undefined),
    };
    const resizeMock = {
      webp: vi.fn().mockReturnValue(toFileMock),
      avif: vi.fn().mockReturnValue(toFileMock),
      jpeg: vi.fn().mockReturnValue(toFileMock),
      jpg: vi.fn().mockReturnValue(toFileMock),
      png: vi.fn().mockReturnValue(toFileMock),
    };
    const rotateMock = {
      resize: vi.fn().mockReturnValue(resizeMock),
    };
    const mockSharp = {
      rotate: vi.fn().mockReturnValue(rotateMock),
    };
    (sharp as any).mockImplementation(() => mockSharp);

    await optimizeImages("/test/path");

    expect(readdir).toHaveBeenCalledWith("/test/path/src/img");
    expect(toFileMock.toFile).toHaveBeenCalledTimes(6);
  });

  it("should skip already optimized files when force is false", async () => {
    vi.mocked(readdir).mockResolvedValue(["image.jpg"] as any);
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as any);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("{}");

    const mockLstat = {
      mtimeMs: 1000,
    };
    vi.mocked(lstatSync).mockReturnValue(mockLstat as any);

    const toFileMock = {
      toFile: vi.fn().mockResolvedValue(undefined),
    };
    const resizeMock = {
      webp: vi.fn().mockReturnValue(toFileMock),
      avif: vi.fn().mockReturnValue(toFileMock),
      jpeg: vi.fn().mockReturnValue(toFileMock),
      jpg: vi.fn().mockReturnValue(toFileMock),
      png: vi.fn().mockReturnValue(toFileMock),
    };
    const rotateMock = {
      resize: vi.fn().mockReturnValue(resizeMock),
    };
    const mockSharp = {
      rotate: vi.fn().mockReturnValue(rotateMock),
    };
    (sharp as any).mockImplementation(() => mockSharp);

    await optimizeImages("/test/path");

    expect(readdir).toHaveBeenCalledWith("/test/path/src/img");
    expect(toFileMock.toFile).not.toHaveBeenCalled();
  });

it("should process all files when force is true", async () => {
    const pkgContent = JSON.stringify({
      config: {
        image_sizes: {
          s: { width: 300 },
        },
      },
    });

    vi.mocked(readdir).mockResolvedValue(["image.jpg"] as any);
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as any);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(pkgContent);

    const mockLstat = {
      mtimeMs: 1000,
    };
    vi.mocked(lstatSync).mockReturnValue(mockLstat as any);

    const toFileMock = {
      toFile: vi.fn().mockResolvedValue(undefined),
    };
    const resizeMock = {
      webp: vi.fn().mockReturnValue(toFileMock),
      avif: vi.fn().mockReturnValue(toFileMock),
      jpeg: vi.fn().mockReturnValue(toFileMock),
      jpg: vi.fn().mockReturnValue(toFileMock),
      png: vi.fn().mockReturnValue(toFileMock),
    };
    const rotateMock = {
      resize: vi.fn().mockReturnValue(resizeMock),
    };
    const mockSharp = {
      rotate: vi.fn().mockReturnValue(rotateMock),
    };
    (sharp as any).mockImplementation(() => mockSharp);

    await optimizeImages("/test/path", true);

    expect(readdir).toHaveBeenCalledWith("/test/path/src/img");
    expect(toFileMock.toFile).toHaveBeenCalledTimes(3);
  });
});
