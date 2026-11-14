import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  writeAssets,
  inlineCritical,
  tree,
  dependentsOf,
  disposeContexts,
  BuildResult,
  CompilationDetails,
} from "../builder.js";
import { CLIENT_MARKER } from "../client.js";

vi.mock("esbuild", () => ({
  build: vi.fn(),
  context: vi.fn(),
  formatMessages: vi.fn(async (msgs: any[]) => msgs.map((m) => `pretty: ${m.text}`)),
}));

vi.mock("node:fs", () => ({
  readdirSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../utils.js", () => ({
  formatBytes: vi.fn((bytes: number) => `${bytes} bytes`),
  GtbConfig: vi.fn(),
  logToFile: vi.fn(),
  findEntryPoints: vi.fn(async () => []),
}));

vi.mock("../constants.js", () => ({
  EXTERNAL_ASSETS: ["*.png", "*.woff2"],
}));

vi.mock("lightningcss", () => ({
  transform: vi.fn(({ code }: { code: Buffer }) => ({ code, map: undefined })),
  browserslistToTargets: vi.fn((x) => x),
}));

vi.mock("browserslist", () => ({
  default: vi.fn(() => ["chrome 120", "firefox 120", "safari 17.4"]),
}));

import * as esbuild from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { transform } from "lightningcss";

const CSS_TAG = '<link rel="stylesheet" href="{{asset "built/css/critical/index.css"}}">';
const JS_TAG = '<script src="{{asset "built/js/critical/index.js"}}"></script>';
const HOME_CSS_TAG = '<link rel="stylesheet" href="{{asset "built/css/critical/home/index.css"}}">';

/** In-memory files for readFile/writeFile, keyed by path. */
let files: Record<string, string>;
let dirs: Record<string, string[]>;

function useFakeFs(initial: Record<string, string>, criticalDirs: Record<string, string[]> = {}) {
  files = { ...initial };
  dirs = criticalDirs;
  vi.mocked(readFile).mockImplementation((async (path: string, enc?: string) => {
    if (!(path in files)) throw Object.assign(new Error(`ENOENT ${path}`), { code: "ENOENT" });
    return enc ? files[path] : Buffer.from(files[path]);
  }) as any);
  vi.mocked(writeFile).mockImplementation((async (path: string, data: any) => {
    files[path] = Buffer.isBuffer(data) ? data.toString() : String(data);
  }) as any);
  vi.mocked(readdirSync).mockImplementation(((path: string) => {
    if (!(path in dirs)) throw new Error("ENOENT");
    return dirs[path].map((name) => ({ name, isDirectory: () => true }));
  }) as any);
}

function output(
  file: string,
  entryPoint: string,
  inputs: string[],
  bytes = 100,
) {
  return {
    [file]: {
      bytes,
      entryPoint,
      inputs: Object.fromEntries(inputs.map((i) => [i, { bytesInOutput: 1 }])),
    },
  };
}

function metafile(outputs: Record<string, any>) {
  return { metafile: { inputs: {}, outputs }, warnings: [], errors: [] } as any;
}

/** Dev mode builds through esbuild.context(); each context's rebuild() returns `result`. */
function mockContexts(byEntry: Record<string, () => any>) {
  const rebuilds: Record<string, ReturnType<typeof vi.fn>> = {};
  vi.mocked(esbuild.context).mockImplementation((async (opts: any) => {
    const entry = opts.entryPoints[0];
    const rebuild = vi.fn(async () => byEntry[entry]());
    rebuilds[entry] = rebuild;
    return { rebuild, dispose: vi.fn(async () => {}) };
  }) as any);
  return rebuilds;
}

beforeEach(async () => {
  vi.clearAllMocks();
  tree.clear();
  await disposeContexts();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writeAssets (production)", () => {
  it("builds all entries in one esbuild.build call and reports outputs", async () => {
    useFakeFs({ "default-template.hbs": "<html><body></body></html>" });
    vi.mocked(esbuild.build).mockResolvedValue(
      metafile({
        ...output("assets/built/js/index.js", "src/js/index.ts", ["src/js/index.ts"], 512),
        "assets/built/js/index.js.map": { bytes: 9, inputs: {} },
      }),
    );

    const result = await writeAssets(["src/js/index.ts"], 0, false);

    expect(esbuild.build).toHaveBeenCalledTimes(1);
    expect(esbuild.context).not.toHaveBeenCalled();
    expect(result.results).toEqual([{ file: "assets/built/js/index.js", value: "512 bytes" }]);
    expect(result.outputs).toEqual(["assets/built/js/index.js"]);
    expect(result.errors).toEqual([]);
    expect(result.time).toBeGreaterThan(0);
  });

  it("inlines critical CSS and JS into default.hbs without the dev client", async () => {
    useFakeFs({
      "default-template.hbs": `<head>${JS_TAG}${CSS_TAG}</head><body></body>`,
      "assets/built/css/critical/index.css": "html{color:red}\n/*# sourceMappingURL=index.css.map */\n",
      "assets/built/js/critical/index.js": "(()=>{document.x=1})();\n//# sourceMappingURL=index.js.map\n",
      "default.hbs": `old ${CLIENT_MARKER}`,
    });
    vi.mocked(esbuild.build).mockResolvedValue(metafile({}));

    const result = await writeAssets([], 0, false);

    const hbs = files["default.hbs"];
    expect(hbs).toContain("<style>html{color:red}</style>");
    expect(hbs).toContain("<script>(()=>{document.x=1})();</script>");
    expect(hbs).not.toContain("sourceMappingURL");
    expect(hbs).not.toContain(CLIENT_MARKER);
    expect(result.templateChanged).toBe(true);
  });

  it("throws with every error when the build fails", async () => {
    useFakeFs({ "default-template.hbs": "" });
    vi.mocked(esbuild.build).mockRejectedValue(
      Object.assign(new Error("Build failed with 1 error"), {
        errors: [{ text: "Expected identifier", location: { file: "src/js/index.ts", line: 3, column: 6 } }],
        warnings: [],
      }),
    );

    await expect(writeAssets(["src/js/index.ts"], 0, false)).rejects.toThrow(
      /Build failed:\nsrc\/js\/index.ts:3:6: Expected identifier/,
    );
    expect(console.error).toHaveBeenCalledWith("pretty: Expected identifier");
  });

  it("throws plain errors too", async () => {
    useFakeFs({ "default-template.hbs": "" });
    vi.mocked(esbuild.build).mockRejectedValue(new Error("boom"));

    await expect(writeAssets(["src/js/index.ts"], 0, false)).rejects.toThrow("Build failed");
  });
});

describe("writeAssets (dev)", () => {
  it("reuses one esbuild context per entry across rebuilds", async () => {
    useFakeFs({ "default-template.hbs": "" });
    const rebuilds = mockContexts({
      "src/js/index.ts": () => metafile(output("assets/built/js/index.js", "src/js/index.ts", ["src/js/index.ts"])),
    });

    await writeAssets(["src/js/index.ts"], 3000, true);
    await writeAssets(["src/js/index.ts"], 3000, true);

    expect(esbuild.context).toHaveBeenCalledTimes(1);
    expect(rebuilds["src/js/index.ts"]).toHaveBeenCalledTimes(2);
  });

  it("returns errors instead of throwing, and still builds the healthy entries", async () => {
    useFakeFs({ "default-template.hbs": "" });
    mockContexts({
      "src/js/index.ts": () => {
        throw Object.assign(new Error("fail"), {
          errors: [{ text: "Expected identifier", location: { file: "src/js/index.ts", line: 3, column: 6 } }],
          warnings: [],
        });
      },
      "src/css/index.css": () => metafile(output("assets/built/css/index.css", "src/css/index.css", ["src/css/index.css"])),
    });
    files["assets/built/css/index.css"] = "a{}";

    const result = await writeAssets(["src/js/index.ts", "src/css/index.css"], 3000, true);

    expect(result.errors).toEqual([
      {
        file: "src/js/index.ts",
        text: "src/js/index.ts:3:6: Expected identifier",
        pretty: "pretty: Expected identifier",
      },
    ]);
    expect(result.outputs).toEqual(["assets/built/css/index.css"]);
  });

  it("reports CSS post-processing failures as errors", async () => {
    useFakeFs({ "default-template.hbs": "", "assets/built/css/index.css": "a{}" });
    mockContexts({
      "src/css/index.css": () => metafile(output("assets/built/css/index.css", "src/css/index.css", ["src/css/index.css"])),
    });
    vi.mocked(transform).mockImplementationOnce(() => {
      throw new Error("Unexpected token");
    });

    const result = await writeAssets(["src/css/index.css"], 3000, true);

    expect(result.errors?.[0].text).toContain("Unexpected token");
    expect(result.errors?.[0].file).toBe("assets/built/css/index.css");
  });

  it("does not touch default.hbs when only a non-critical asset was rebuilt", async () => {
    useFakeFs({ "default-template.hbs": "<body></body>", "assets/built/css/index.css": "a{}" });
    mockContexts({
      "src/css/index.css": () => metafile(output("assets/built/css/index.css", "src/css/index.css", ["src/css/index.css"])),
    });

    const result = await writeAssets(["src/css/index.css"], 3000, true);

    expect(result.templateChanged).toBe(false);
    expect("default.hbs" in files).toBe(false);
  });

  it("re-renders default.hbs when a critical asset was rebuilt", async () => {
    useFakeFs({
      "default-template.hbs": `<head>${CSS_TAG}</head><body></body>`,
      "assets/built/css/critical/index.css": "html{}",
    });
    mockContexts({
      "src/css/critical/index.css": () =>
        metafile(output("assets/built/css/critical/index.css", "src/css/critical/index.css", ["src/css/critical/index.css"])),
    });

    const result = await writeAssets(["src/css/critical/index.css"], 3000, true);

    expect(result.templateChanged).toBe(true);
    expect(files["default.hbs"]).toContain("<style>html{}</style>");
  });

  it("injects the live-reload client before </body> when asked to render", async () => {
    useFakeFs({ "default-template.hbs": "<html><body>{{{body}}}</body></html>" });
    mockContexts({});

    await writeAssets([], 3456, true, undefined, { renderTemplate: true });

    const hbs = files["default.hbs"];
    expect(hbs).toContain(CLIENT_MARKER);
    expect(hbs).toContain("var PORT = 3456;");
    expect(hbs.indexOf(CLIENT_MARKER)).toBeLessThan(hbs.indexOf("</body>"));
  });

  it("maps a partial shared by several entries to all of them", async () => {
    useFakeFs({ "default-template.hbs": "", "assets/built/css/index.css": "", "assets/built/css/critical/index.css": "" });
    mockContexts({
      "src/css/index.css": () =>
        metafile(output("assets/built/css/index.css", "src/css/index.css", ["src/css/index.css", "src/css/card.css"])),
      "src/css/critical/index.css": () =>
        metafile(output("assets/built/css/critical/index.css", "src/css/critical/index.css", ["src/css/critical/index.css", "src/css/card.css"])),
    });

    await writeAssets(["src/css/index.css", "src/css/critical/index.css"], 3000, true);

    expect(dependentsOf("src/css/card.css").sort()).toEqual(["src/css/critical/index.css", "src/css/index.css"]);
    expect(dependentsOf("src/css/index.css")).toEqual(["src/css/index.css"]);
  });

  it("forgets imports an entry no longer has", async () => {
    useFakeFs({ "default-template.hbs": "" });
    let inputs = ["src/js/index.ts", "src/js/old.ts"];
    mockContexts({
      "src/js/index.ts": () => metafile(output("assets/built/js/index.js", "src/js/index.ts", inputs)),
    });

    await writeAssets(["src/js/index.ts"], 3000, true);
    expect(dependentsOf("src/js/old.ts")).toEqual(["src/js/index.ts"]);

    inputs = ["src/js/index.ts"];
    await writeAssets(["src/js/index.ts"], 3000, true);
    expect(tree.has("src/js/old.ts")).toBe(false);
  });
});

describe("inlineCritical", () => {
  it("inlines critical CSS", async () => {
    useFakeFs({
      "default-template.hbs": `<head>${CSS_TAG}</head>`,
      "assets/built/css/critical/index.css": "/* critical css */",
    });

    expect(await inlineCritical()).toBe(true);
    expect(files["default.hbs"]).toContain("<style>/* critical css */</style>");
  });

  it("leaves the tag alone when the critical file is missing", async () => {
    useFakeFs({ "default-template.hbs": `<head>${CSS_TAG}</head>` });

    await inlineCritical();
    expect(files["default.hbs"]).toContain(CSS_TAG);
  });

  it("does not rewrite default.hbs when nothing changed", async () => {
    useFakeFs({ "default-template.hbs": "<head></head>", "default.hbs": "<head></head>" });

    expect(await inlineCritical()).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("escapes Handlebars braces and keeps $ patterns literal", async () => {
    useFakeFs({
      "default-template.hbs": `<head>${JS_TAG}</head>`,
      "assets/built/js/critical/index.js": "if(a){{b()}} x.replace(/a/, '$&');",
    });

    await inlineCritical();
    expect(files["default.hbs"]).toContain("<script>if(a)\\{{b()}} x.replace(/a/, '$&');</script>");
  });

  it("inlines every critical directory", async () => {
    useFakeFs(
      {
        "default-template.hbs": `<head>${CSS_TAG}${HOME_CSS_TAG}</head>`,
        "assets/built/css/critical/index.css": "/* default css */",
        "assets/built/css/critical/home/index.css": "/* home css */",
      },
      { "assets/built/css/critical": ["home", "index"] },
    );

    await inlineCritical();
    expect(files["default.hbs"]).toContain("<style>/* default css */</style>");
    expect(files["default.hbs"]).toContain("<style>/* home css */</style>");
  });

  it("survives write errors", async () => {
    useFakeFs({ "default-template.hbs": "x" });
    vi.mocked(writeFile).mockRejectedValue(new Error("Write failed"));

    await expect(inlineCritical()).resolves.toBe(false);
  });
});

describe("BuildResult and CompilationDetails", () => {
  it("has the expected shape", () => {
    const result: BuildResult = { file: "assets/built/js/index.js", value: "512 bytes" };
    const details: CompilationDetails = { results: [result], time: 1 };
    expect(details.results[0]).toBe(result);
  });
});
