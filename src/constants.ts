export const GH_ACTION_CONTENT = `# Learn more → https://github.com/TryGhost/action-deploy-theme#getting-started
name: Build and deploy theme
on:
  push:
    branches:
      - main
jobs:
  build: 
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - name: Deploy theme
        uses: TryGhost/action-deploy-theme@v1
        with:
          api-url: \${{ secrets.GHOST_ADMIN_API_URL }}
          api-key: \${{ secrets.GHOST_ADMIN_API_KEY }}`;

export const DEFAULT_TEMPLATE_CONTENT = `<!DOCTYPE html>
<html lang="{{@site.locale}}">
  <head>
      {{!-- Basic meta - advanced meta is output with {{ghost_head}} below --}}
      <title>{{meta_title}}</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">

      {{!-- Critical script for dark mode to prevent flash --}}
      <script src="{{asset "built/js/critical.js"}}"></script>

      {{!-- Theme assets - use the {{asset}} helper to reference styles & scripts --}}
      <link rel="stylesheet" type="text/css" href="{{asset "built/css/index.css"}}">
      <script src="{{asset "built/js/index.js"}}" defer></script>

      {{ghost_head}}
  </head>
  <body class="{{body_class}}">

  <header>
      {{> "dark-mode-toggle"}}
  </header>

  {{{body}}}

  {{ghost_foot}}
  </body>
</html>`;

export const POST_TEMPLATE_CONTENT = `{{!< default}}
{{!-- The tag above means: insert everything in this file into the body of the default.hbs template --}}

{{#post}}
{{!-- Learn more: https://ghost.org/docs/themes/helpers/post/ --}}
{{/post}}`;

export const INDEX_TEMPLATE_CONTENT = `{{!< default}}
{{!-- The tag above means: insert everything in this file into the body of the default.hbs template --}}

{{#foreach posts}}
{{!-- Learn more: https://ghost.org/docs/themes/contexts/index-context/ --}}
{{/foreach}}`;

export const GHOST_CSS_CONTENT = `/* Learn more about Ghost image styles -> https://ghost.org/docs/themes/content/#image-size-options */
.kg-width-wide {
  /* Styles for wide images in the editor */
}

.kg-width-full {
  /* Styles for full-width images in the editor */
}`;

export const INDEX_CSS_CONTENT = `@import "ghost.css";

`;

export const TAILWIND_V4_CSS = `@import "tailwindcss";

@theme {
  --color-brand: #ff0000;
}
`;

export const PACKAGE_JSON_TEMPLATE = (name: string) => `{
  "name": "${name}",
  "description": "A new Ghost theme",
  "version": "0.1.0",
  "engines": {
    "ghost": ">=5.0.0"
  },
  "license": "MIT",
  "config": {
    "posts_per_page": 25,
    "image_sizes": {
      "xxs": {
        "width": 30
      },
      "xs": {
        "width": 100
      },
      "s": {
        "width": 300
      },
      "m": {
        "width": 600
      },
      "l": {
        "width": 1000
      },
      "xl": {
        "width": 2000
      }
    }
  },
  "scripts": {
    "dev": "gtb dev",
    "build": "gtb",
    "lint": "gtb lint",
    "check": "gtb check",
    "zip": "gtb zip"
  },
  "devDependencies": {
    "@royalfig/gtb": "latest",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "stylelint": "^16.0.0",
    "stylelint-config-standard": "^36.0.0"
  }
}
`;

export const ROUTES_YAML_CONTENT = `routes:

collections:
  /:
    permalink: /{slug}/
    template: index

taxonomies:
  tag: /tag/{slug}/
  author: /author/{slug}/
`;

export const ESLINT_CONFIG_TEMPLATE = `{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "no-console": "warn"
  }
}
`;

export const STYLELINT_CONFIG_TEMPLATE = `{
  "extends": [
    "stylelint-config-standard"
  ],
  "rules": {
    "import-notation": null,
    "hue-degree-notation": "number"
  }
}
`;

export const TAILWIND_CONFIG_TEMPLATE = `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./*.hbs", "./partials/**/*.hbs", "./assets/js/**/*.ts", "./assets/js/**/*.js"],
  theme: {
    extend: {},
  },
}
`;

export const POSTCSS_CONFIG_TEMPLATE = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;

export const DARK_MODE_CRITICAL_JS = `(function() {
    function getInitialMode() {
        const savedMode = localStorage.getItem('gtb-dark-mode');
        if (savedMode) return savedMode;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    const mode = getInitialMode();
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.dataset.mode = mode;
})();`;

export const DARK_MODE_HANDLER_JS = `export function initDarkMode() {
    const toggles = document.querySelectorAll('.gtb-dark-mode-toggle');
    toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            const newMode = isDark ? 'dark' : 'light';
            document.documentElement.dataset.mode = newMode;
            localStorage.setItem('gtb-dark-mode', newMode);
        });
    });
}`;

export const DARK_MODE_TOGGLE_HBS = `<button class="gtb-dark-mode-toggle" aria-label="Toggle dark mode">
    <span class="dark:hidden">🌙</span>
    <span class="hidden dark:inline">☀️</span>
</button>`;

export const ASSET_LOADERS = {
  ".png": "file",
  ".jpg": "file",
  ".jpeg": "file",
  ".svg": "file",
  ".gif": "file",
  ".woff": "file",
  ".woff2": "file",
  ".ttf": "file",
  ".otf": "file",
} as const;
