import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock IO dependencies
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

import {
  formatBytes,
  loadConfig,
  findEntryPoints,
  hasCommand,
  runCommand,
  loadEnv,
  findFilesRecursively,
} from "../utils.js";
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";

describe("formatBytes", () => {
  it("should format bytes to human-readable format", () => {
    // parseFloat strips trailing zeros: parseFloat("1.00") === 1
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
    // Second call should not add more warnings
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

    const result = await findEntryPoints("assets/js", [".css"]);
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
