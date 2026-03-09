# @royalfig/gtb (Ghost Theme Builder) ⬥ v3.0.0

A modern, high-performance development framework and build tool for Ghost themes. Built with **TypeScript**, powered by **esbuild**, and optimized for **Tailwind CSS v4**.

`gtb` transforms the Ghost theme development experience by providing a seamless, "zero-config" environment with pro-level features like CSS Hot Injection, Critical Asset Inlining, and Automated Deployment.

## ⬥ Features

- **⚡ Blazing Fast Builds**: Powered by \`esbuild\` for near-instant JS/TS and CSS compilation.
- **🎨 Tailwind CSS v4 + PostCSS**: Built-in support for Tailwind, Autoprefixer, and Nesting out of the box.
- **🔥 Advanced Live Reload**: 
    - **CSS Hot Injection**: Update styles instantly without losing page state or scroll position.
    - **Resilient Building**: Errors won't crash your dev server; it waits for your fix and retries.
- **🌑 Intelligent Dark Mode**: Native support with a critical "anti-flash" script, Tailwind selector integration, and persistent storage.
- **📦 Critical Asset Inlining**: Automatically detect and inline critical CSS/JS into your \`default.hbs\` for perfect performance scores.
- **🚀 One-Touch Deployment**: Deploy your theme directly to your Ghost site via the Admin API with a single command.
- **🏥 GTB Doctor**: Built-in environment diagnostics with **Dynamic Node.js Version Checking** to ensure your Node and Ghost setup are healthy.
- **🔄 Content Syncing**: Clone content (posts, pages, images) from your production site to your local development environment.
- **🛠 Modular & Extensible**: Support for \`gtb.config.js\` to customize entry points and \`esbuild\` plugins.

---

## ⬥ Getting Started

### 1. Initialize a New Theme
In an empty directory, run:
\`\`\`bash
npx @royalfig/gtb init
\`\`\`
This will:
1.  Ask you to choose a **Starter Kit** (Standard, Minimal, or Tailwind Advanced).
2.  Scaffold the entire Ghost theme directory structure.
3.  Automatically detect local Ghost instances and **symlink** your theme so it's live immediately.

### 2. Start Developing
\`\`\`bash
npx gtb dev --open
\`\`\`
Starts the dev server, watches all files, and opens your local Ghost site in the browser.

---

## ⬥ Commands

| Command | Description |
| :--- | :--- |
| \`gtb dev\` | Starts the watch process with Live Reload and Hot Injection. Use \`--open\` to auto-launch browser. |
| \`gtb build\` | Runs a production build (minified, no source maps). |
| \`gtb init\` | Scaffolds a new theme and creates a symlink to a local Ghost instance. |
| \`gtb lint\` | Runs ESLint (JS/TS) and Stylelint (CSS) with auto-fix enabled. |
| \`gtb check\` | Validates your theme against Ghost's official \`gscan\` engine. |
| \`gtb zip\` | Optimizes images (MozJPEG, Pngquant, SVGO) and packages the theme for distribution. |
| \`gtb deploy\` | Builds, zips, and uploads the theme to your Ghost site via Admin API. |
| \`gtb clone\` | Clones remote content (JSON export + Images) to your local Ghost environment. |
| \`gtb doctor\` | Checks your environment for compatibility and configuration issues. |

---

## ⬥ Content Syncing (\`gtb clone\`)

To accurately develop themes, you often need real content. \`gtb clone\` allows you to pull content from your production/staging site:

1. Set your **Admin API Credentials** in a \`.env\` file.
2. Run \`gtb clone\`.
3. \`gtb\` will:
    - Export your site content to a JSON file.
    - **Sync Images**: Automatically download all images/assets from your remote site to your local Ghost \`content/images\` folder.
    - Provide instructions for importing the JSON into your local instance.

---

## ⬥ Critical Assets & Dark Mode

\`gtb\` handles performance-critical patterns natively:

- **Critical CSS/JS**: Any file placed in \`assets/css/critical/\` or named \`critical.ts\` will be built as a critical asset and automatically inlined into \`default.hbs\` if the corresponding tags exist.
- **Dark Mode**: The \`init\` command generates a \`critical.ts\` that prevents theme flickering and a \`darkMode.ts\` for toggle logic. Tailwind is pre-configured to use the \`.dark\` selector.

---

## ⬥ Configuration (\`gtb.config.js\`)

While \`gtb\` is zero-config, you can customize it by creating a \`gtb.config.js\` in your root:

\`\`\`javascript
/** @type {import('@royalfig/gtb').GtbConfig} */
export default {
  assetsDir: "assets",
  outDir: "assets/built",
  entryPoints: {
    js: ["assets/js/index.ts", "assets/js/custom-feature.ts"],
    css: ["assets/css/index.css"]
  },
  esbuild: {
    // Direct access to esbuild options
    target: 'esnext',
    external: ['node-fetch']
  }
}
\`\`\`

---

## ⬥ Deployment & API Credentials

For commands like \`gtb deploy\` and \`gtb clone\`, create a \`.env\` file in your theme root (ensure it is in your \`.gitignore\`):

\`\`\`.env
GHOST_ADMIN_API_URL=https://your-site.com
GHOST_ADMIN_API_KEY=your-admin-api-key:your-admin-api-secret
\`\`\`

---

## ⬥ Requirements
- **Node.js**: v18, v20, or v22 (LTS versions). \`gtb\` will warn you if your Node version is incompatible with Ghost.
- **Ghost CLI**: Required for local development features (\`init\`, \`dev\`, \`clone\`).

---

**Created by [Ryan Feigenbaum](https://github.com/royalfig)**
