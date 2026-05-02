# GTB (Ghost Theme Builder)

A development framework and build tool for Ghost themes.

gtb provides a development environment with live reload, CSS injection, critical asset inlining, and image optimization.

## Project Structure

```
your-theme/
├── src/
│   ├── js/              # TypeScript / JavaScript entry points
│   │   └── css/         # CSS entry points
│   │   └── img/         # Images (optimized via sharp)
│   │   └── critical/    # Critical CSS/JS (inlined into templates)
├── assets/
│   ├── fonts/           # Static font files
│   └── built/           # Build output (js, css, img)
├── default-template.hbs  # Your template (edited here, rendered to default.hbs)
└── gtb.config.js        # Optional: esbuild overrides only
```

## Features

- Fast builds with esbuild
- Live reload with CSS hot injection
- Critical CSS/JS inlining
- Dark mode support
- TypeScript / JavaScript compilation
- Image compression/resizing
- Environment diagnostics (doctor command)
- Theme validation with gscan

---

## Getting Started

### 1. Initialize a New Theme

In an empty directory, run:

```bash
npx @royalfig/gtb init
```

This will:

1. Scaffold the entire Ghost theme directory structure.
2. Automatically detect local Ghost instances and symlink your theme.

### 2. Start Developing

```bash
npx gtb dev --open
```

Starts the dev server, watches all files, and opens your local Ghost site in the browser.

---

## Commands

| Command      | Description                                                                                           |
| :----------- | :---------------------------------------------------------------------------------------------------- |
| `gtb dev`    | Starts the watch process with live reload and CSS hot injection. Use `--open` to auto-launch browser. |
| `gtb build`  | Runs a production build (minified, no source maps).                                                   |
| `gtb init`   | Scaffolds a new theme and creates a symlink to a local Ghost instance.                                |
| `gtb lint`   | Runs ESLint (JS/TS) and Stylelint (CSS) with auto-fix enabled.                                        |
| `gtb check`  | Validates your theme against Ghost's official gscan engine.                                           |
| `gtb zip`    | Optimizes images and packages the theme for distribution.                                             |
| `gtb doctor` | Checks your environment for compatibility and configuration issues.                                   |

---

## Critical Assets & Dark Mode

gtb handles performance-critical patterns natively:

- **Critical CSS/JS**: Any file placed in `src/css/critical/` or named `critical.ts` will be built as a critical asset and automatically inlined into `default.hbs`.
- **Dark Mode**: The init command generates a `critical.ts` that prevents theme flickering and a `darkMode.ts` for toggle logic.

:::warning

Make changes to `default-template.hbs`. On dev/build, this file is rendered as `default.hbs` with critical assets inlined.

---

## Configuration (gtb.config.js)

gtb is zero-config by default — it reads from `src/js/` and `src/css/`, outputting to `assets/built/`. You can customize esbuild options only:

```javascript
/** @type {import('@royalfig/gtb').GtbConfig} */
export default {
  esbuild: {
    target: "esnext",
    external: ["node-fetch"],
  },
};
```

---

## Requirements

- **Node.js**: v18, v20, or v22 (LTS versions). gtb will warn you if your Node version is incompatible with Ghost.
- **Ghost CLI**: Required for local development features (`init`, `dev`).

---

Created by [Ryan Feigenbaum](https://ryanfeigenbaum.com)
