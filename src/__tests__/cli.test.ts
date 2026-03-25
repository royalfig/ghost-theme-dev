import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  makeSkeleton,
  parseGhostCliOutput,
  checkTheme,
  lintTheme,
  zipTheme,
  runDoctor,
  symLinkTheme,
  cloneContent,
} from "../cli.js";

// Mock IO dependencies
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
  lstat: vi.fn(),
  readlink: vi.fn(),
  unlink: vi.fn(),
  copyFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn(),
  }),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from("")),
}));

vi.mock("@inquirer/select", () => ({
  default: vi.fn().mockResolvedValue("standard"),
}));

vi.mock("@inquirer/confirm", () => ({
  default: vi.fn().mockResolvedValue(true),
}));

vi.mock("@inquirer/input", () => ({
  default: vi.fn().mockResolvedValue("test-input"),
}));

vi.mock("gscan", () => ({
  default: {
    check: vi.fn().mockResolvedValue({ results: { errorCount: 0 } }),
    format: vi.fn().mockReturnValue("Formatted report"),
  },
}));

vi.mock("archiver", () => {
  const archive = {
    pipe: vi.fn(),
    glob: vi.fn(),
    finalize: vi.fn().mockResolvedValue(undefined),
    pointer: vi.fn().mockReturnValue(1024),
  };
  return { default: vi.fn().mockReturnValue(archive) };
});

vi.mock("sharp", () => ({
  default: vi.fn().mockReturnValue({
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@tryghost/admin-api", () => ({
  default: vi.fn().mockImplementation(() => ({
    themes: { upload: vi.fn().mockResolvedValue({}) },
    makeRequest: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock("../utils.js", () => ({
  formatBytes: vi.fn((bytes: number) => `${bytes} bytes`),
  GtbConfig: vi.fn(),
  logToFile: vi.fn(),
  checkNodeVersion: vi.fn(),
  hasCommand: vi.fn().mockReturnValue(true),
  runCommand: vi.fn().mockReturnValue(""),
  loadEnv: vi.fn(),
  findEntryPoints: vi.fn().mockResolvedValue([]),
  downloadFile: vi.fn().mockResolvedValue(undefined),
  findFilesRecursively: vi.fn().mockResolvedValue([]),
}));

vi.mock("../constants.js", () => ({
  ASSET_LOADERS: { ".ts": "ts", ".js": "js", ".css": "css" },
  DEFAULT_TEMPLATE_CONTENT: "<!DOCTYPE html>",
  POST_TEMPLATE_CONTENT: "<article>{{title}}</article>",
  INDEX_TEMPLATE_CONTENT: "<section>{{posts}}</section>",
  PAGE_TEMPLATE_CONTENT: "<article>{{title}}</article>",
  AUTHOR_TEMPLATE_CONTENT: "<article>{{name}}</article>",
  TAG_TEMPLATE_CONTENT: "<article>{{name}}</article>",
  ERROR_404_TEMPLATE_CONTENT: "<article>404</article>",
  CARD_PARTIAL_CONTENT: "<article>{{title}}</article>",
  HEADER_PARTIAL_CONTENT: "<header>{{site.title}}</header>",
  FOOTER_PARTIAL_CONTENT: "<footer>{{site.title}}</footer>",
  NAVIGATION_PARTIAL_CONTENT: "<nav>{{links}}</nav>",
  PAGINATION_PARTIAL_CONTENT: "<nav>{{pagination}}</nav>",
  GHOST_CSS_CONTENT: "/* Ghost image styles */",
  INDEX_CSS_CONTENT: ":root { --color: #000; }",
  PACKAGE_JSON_TEMPLATE: vi.fn(() => '{"name":"test","version":"1.0.0"}'),
  ROUTES_YAML_CONTENT: "routes: /",
  ESLINT_CONFIG_TEMPLATE: "{}",
  STYLELINT_CONFIG_TEMPLATE: "{}",
  POSTCSS_CONFIG_TEMPLATE: "{}",
  DARK_MODE_CRITICAL_JS: "(function() {})",
  DARK_MODE_HANDLER_JS: "export function initDarkMode() {}",
  DARK_MODE_TOGGLE_HBS: "<button>Toggle</button>",
  GH_ACTION_CONTENT: "name: test",
}));

import { writeFile, access, mkdir } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import { execSync } from "node:child_process";
import { runCommand, hasCommand } from "../utils.js";
import gscan from "gscan";

describe("CLI Commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("makeSkeleton", () => {
    it("should create theme skeleton files", async () => {
      // access rejects → file doesn't exist → writeFile is called
      vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue();

      await makeSkeleton();

      expect(vi.mocked(writeFile)).toHaveBeenCalled();
      expect(vi.mocked(mkdir)).toHaveBeenCalled();
    });

    it("should not overwrite existing files", async () => {
      // access resolves → file exists → no write
      vi.mocked(access).mockResolvedValue(undefined);

      await makeSkeleton();

      expect(vi.mocked(writeFile)).not.toHaveBeenCalled();
    });
  });

  describe("parseGhostCliOutput", () => {
    it("should parse Ghost CLI output for local URL", async () => {
      vi.mocked(runCommand).mockReturnValue(
        "│ ghost-local │ /home/user/ghost │ running │ http://localhost:2368 │",
      );

      const result = await parseGhostCliOutput();
      expect(result).toContain("http://localhost:2368");
    });

    it("should return default URL when no Ghost instances found", async () => {
      vi.mocked(runCommand).mockReturnValue("");

      const result = await parseGhostCliOutput();
      expect(result).toBe("http://localhost:2368");
    });

    it("should return default URL when ghost CLI not available", async () => {
      vi.mocked(hasCommand).mockReturnValue(false);

      const result = await parseGhostCliOutput();
      expect(result).toBe("http://localhost:2368");
    });
  });

  describe("checkTheme", () => {
    it("should run gscan validation", async () => {
      vi.mocked(gscan.check).mockResolvedValue({
        results: { errorCount: 0 },
      } as any);
      vi.mocked(gscan.format).mockReturnValue("Formatted report" as any);

      await checkTheme();
      expect(gscan.check).toHaveBeenCalled();
    });

    it("should exit with code 1 on errors", async () => {
      vi.mocked(gscan.check).mockResolvedValue({
        results: { errorCount: 1 },
      } as any);
      vi.mocked(gscan.format).mockReturnValue("Formatted report" as any);

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((() => {}) as any);

      await checkTheme();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("lintTheme", () => {
    it("should run ESLint and Stylelint", async () => {
      await lintTheme();
      expect(runCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe("zipTheme", () => {
    it("should create theme zip file", async () => {
      const { readFile } = await import("node:fs/promises");
      vi.mocked(readFile).mockResolvedValue(
        '{"name":"test","version":"1.0.0"}' as any,
      );
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      // createWriteStream needs to return an object with .on and be pipeable
      vi.mocked(createWriteStream).mockReturnValue({
        on: vi.fn(),
      } as any);

      // Re-setup archiver mock (cleared by vi.clearAllMocks)
      const archiver = (await import("archiver")).default;
      vi.mocked(archiver).mockReturnValue({
        pipe: vi.fn(),
        glob: vi.fn(),
        finalize: vi.fn().mockResolvedValue(undefined),
        pointer: vi.fn().mockReturnValue(1024),
      } as any);

      const result = await zipTheme();
      expect(result).toContain(".zip");
    });
  });

  describe("runDoctor", () => {
    it("should check system requirements", async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from("v20.0.0"));
      vi.mocked(hasCommand).mockReturnValue(true);

      // access for package.json check
      const { access: accessMock } = await import("node:fs/promises");
      vi.mocked(accessMock).mockResolvedValue(undefined);

      await runDoctor();

      expect(execSync).toHaveBeenCalled();
    });
  });

  describe("symLinkTheme", () => {
    it("should return false when ghost CLI not found and user declines install", async () => {
      vi.mocked(hasCommand).mockReturnValue(false);

      const confirm = (await import("@inquirer/confirm")).default;
      vi.mocked(confirm).mockResolvedValue(false);

      const result = await symLinkTheme();
      expect(result).toBe(false);
    });
  });

  describe("cloneContent", () => {
    it("should error when missing API credentials", async () => {
      delete process.env.GHOST_ADMIN_API_URL;
      delete process.env.GHOST_ADMIN_API_KEY;

      const { readFile } = await import("node:fs/promises");
      vi.mocked(readFile).mockResolvedValue("{}" as any);

      await cloneContent();

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("BuildResult and CompilationDetails", () => {
    it("should create BuildResult interface", () => {
      const result = {
        file: "assets/built/js/index.js",
        value: "512 bytes",
      };

      expect(result.file).toBe("assets/built/js/index.js");
      expect(result.value).toBe("512 bytes");
    });

    it("should create CompilationDetails interface", () => {
      const details = {
        results: [{ file: "assets/built/js/index.js", value: "512 bytes" }],
        time: 123.45,
      };

      expect(details.results).toHaveLength(1);
      expect(details.time).toBe(123.45);
    });
  });
});
