# GTB (Ghost Theme Builder)

A development framework and build tool for Ghost themes.

gtb provides a development environment with live reload, CSS injection, critical asset inlining, and image optimization.

## Project Structure

```text
your-theme/
├── src/
│   ├── js/
│   │   ├── index.ts     # Entry point → assets/built/js/index.js
│   │   ├── *.ts         # Modules imported by index.ts (not built separately)
│   │   ├── post/        # Another bundle: post/index.ts → built/js/post/index.js
│   │   └── critical/    # Critical JS (inlined into default.hbs)
│   ├── css/
│   │   ├── index.css    # Entry point → assets/built/css/index.css
│   │   ├── *.css        # Partials @imported by index.css (not built separately)
│   │   ├── home/        # Another bundle: home/index.css → built/css/home/index.css
│   │   └── critical/    # Critical CSS (inlined into default.hbs)
│   └── img/             # Images (resized and converted to assets/built/img)
├── assets/
│   ├── fonts/           # Static font files
│   └── built/           # Build output (js, css, img)
├── locales/             # Translation files
├── partials/            # Handlebars partials
├── default-template.hbs # Your template (rendered to default.hbs)
└── gtb.config.js        # Optional: esbuild overrides only
```

Only files named `index` (or containing `critical`) are entry points, at the top level and in each subfolder. Every other file is a partial, bundled into whichever entry imports it.

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
| `gtb build`  | Runs a production build (minified, with source maps) and optimizes images.                           |
| `gtb init`   | Scaffolds a new theme and creates a symlink to a local Ghost instance.                                |
| `gtb lint`   | Runs ESLint (JS/TS) and Stylelint (CSS) with auto-fix enabled. Exits non-zero if either fails.        |
| `gtb check`  | Validates your theme against Ghost's official gscan engine.                                           |
| `gtb zip`    | Runs a production build, optimizes images, and packages the theme for distribution.                   |
| `gtb deploy` | Zips theme and deploys directly to your Ghost site via the Admin API.                                 |
| `gtb doctor` | Checks your environment for compatibility and configuration issues.                                   |

---

## Live Reload

During `gtb dev`, a small client is added to `default.hbs` (it is removed by `gtb build`, `zip` and `deploy`). It logs what it does to the browser console, prefixed with `[gtb]`:

- CSS changes are swapped in place without a reload, including critical CSS: its inlined `<style>` block is updated directly. Changes to critical JS, other JS, templates and images trigger a full reload.
- Build errors are shown in the terminal and the browser console, and the page keeps the previous version until the next successful build.
- If the dev server restarts or the connection drops, the client reconnects and reloads.
- Changes Ghost only picks up on restart (new root templates, `package.json`, `locales/`) are flagged in both places.

## Critical Assets & Dark Mode

gtb handles performance-critical patterns natively:

- **Critical CSS/JS**: `src/css/critical/index.css` and `src/js/critical/index.ts` are built like any other entry point, then inlined into `default.hbs` in place of their tags in `default-template.hbs`:

  ```handlebars
  <link rel="stylesheet" href="{{asset "built/css/critical/index.css"}}">
  <script src="{{asset "built/js/critical/index.js"}}"></script>
  ```

  Subfolders work the same way for page-specific critical assets, e.g. `src/css/critical/home/index.css` replaces `{{asset "built/css/critical/home/index.css"}}`. A tag that doesn't match exactly is left as a normal external file.

- **Dark Mode**: The init command generates `src/js/critical/index.ts`, which sets the color scheme before first paint to prevent flicker, and `src/js/darkMode.ts` for the toggle logic.

> [!WARNING]
> Make changes to `default-template.hbs`. On dev/build, this file is rendered as `default.hbs` with critical assets inlined.

## Images

Images in `src/img/` are resized to each width in `config.image_sizes` from your theme's `package.json` (the same setting Ghost uses for responsive images), and written to `assets/built/img/` as `name-<width>.<ext>` plus `.webp` and `.avif` versions. Without `image_sizes`, gtb uses widths of 30, 100, 300, 600, 1000 and 2000px. In `gtb dev`, adding or changing an image regenerates its outputs, and deleting one removes them.

---

## Configuration (gtb.config.js)

gtb is zero-config by default — it reads from `src/js/` and `src/css/`, outputting to `assets/built/`. You can customize esbuild options only; they are merged over gtb's defaults:

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

- **Node.js**: v22.22 or later (Ghost 6 runs on Node 22).
- **Ghost CLI**: Required for local development features (`init`, `dev`).

---

Created by [Ryan Feigenbaum](https://ryanfeigenbaum.com)
