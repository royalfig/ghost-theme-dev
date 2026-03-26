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
          node-version: '22'
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
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{meta_title}}</title>

    {{!-- Add preconnect for jsdelivr --}}
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <link rel="dns-prefetch" href="https://cdn.jsdelivr.net">

    {{!-- Critical script for dark mode to prevent flash. Replaced during build. --}}
    <script src="{{asset "built/js/critical/index.js"}}"></script>
    <link rel="stylesheet" href="{{asset "built/css/critical/index.css"}}">

    <script src="{{asset "built/js/index.js"}}" defer></script>
    <link rel="stylesheet" href="{{asset "built/css/index.css"}}" media="print" onload="this.media='all'">
    {{ghost_head}}
</head>
<body class="{{body_class}}">

    <div class="">
        {{> "header"}}

        <main class="">
            {{{body}}}
        </main>

        {{> "footer"}}
    </div>

    {{ghost_foot}}
</body>
</html>`;

export const POST_TEMPLATE_CONTENT = `{{!< default}}

{{#post}}
<div class="{{post_class}}">
    
</div>
{{/post}}`;

export const INDEX_TEMPLATE_CONTENT = `{{!< default}}

<section class="">
    {{#foreach posts}}
        {{> "card"}}
    {{/foreach}}
</section>`;

export const PAGE_TEMPLATE_CONTENT = `{{!< default}}

{{#post}}
<article class="{{post_class}}">
    {{#match @page.show_title_and_feature_image}}
    <header class="">
        <h1>
            {{title}}
        </h1>
    </header>
    {{/match}}

    {{!-- content here --}}
</article>
{{/post}}`;

export const AUTHOR_TEMPLATE_CONTENT = `{{!< default}}

<section class="">
    <div class="">
        {{#author}}
            {{!-- author header --}}
        {{/author}}
    </div>

    <div class="">
        {{#foreach posts}}
            {{> "card"}}
        {{/foreach}}
    </div>

    <div class="">
        {{pagination}}
    </div>
</section>`;

export const TAG_TEMPLATE_CONTENT = `{{!< default}}

<section class="">
    <header class="">
        {{#tag}}
            <h1 class="">{{name}}</h1>
            <p class="">
                {{#if description}}
                    {{description}}
                {{else}}
                    A collection of {{plural ../pagination.total empty='zero posts' uint='one post' other='% posts'}}
                {{/if}}
            </p>
        {{/tag}}
    </header>

    <div class="">
        {{#foreach posts}}
            {{> "card"}}
        {{/foreach}}
    </div>

    <div class="">
        {{pagination}}
    </div>
</section>`;

export const ERROR_404_TEMPLATE_CONTENT = `{{!< default}}

<section class="">
    <h1 class="">404</h1>
    <h2 class="">Page not found</h2>
    <p class="">Sorry, we couldn't find the page you're looking for. It might have been moved or deleted.</p>
    <a href="{{@site.url}}" class="">
        Back to Home
    </a>
</section>`;

export const CARD_PARTIAL_CONTENT = `<article class="">
    {{#if feature_image}}
    <a href="{{url}}" class="">
        
    </a>
    {{/if}}

    <div class="">
        <div class="">
            {{#primary_tag}}
                <span class="">{{name}}</span>
            {{/primary_tag}}
            <span class="text-muted-foreground">
                <time datetime="{{date format='YYYY-MM-DD'}}">{{date format='D MMM YYYY'}}</time>
            </span>
        </div>

        <a href="{{url}}">
            <h2 class="">
                {{title}}
            </h2>
        </a>
        <p class="">
            {{excerpt words="30"}}
        </p>
    </div>
</article>`;

export const HEADER_PARTIAL_CONTENT = `<header class="">
    {{navigation}}
</header>`;

export const FOOTER_PARTIAL_CONTENT = `<footer class="">
    <div class="">
        <div class="">
            <div>
                &copy; {{date format='YYYY'}} {{@site.title}}. All rights reserved.
            </div>
            <div class="flex items-center gap-6">
                {{navigation type="secondary"}}
            </div>
        </div>
    </div>
</footer>`;

export const NAVIGATION_PARTIAL_CONTENT = `<ul class="flex items-center gap-8 list-none p-0 m-0">
    {{#foreach navigation}}
        <li class="{{link_class for=url class=(concat 'nav-' slug)}}">
            <a href="{{url absolute='true'}}" class="text-sm font-semibold hover:text-brand transition-colors">{{label}}</a>
        </li>
    {{/foreach}}
</ul>`;

export const GHOST_CSS_CONTENT = `/* Ghost image styles */
.kg-width-wide img { max-width: 80vw; width: 100%; margin: 2rem auto; }
.kg-width-full img { max-width: 100vw; width: 100%; margin: 2rem auto; }
.kg-card figcaption { text-align: center; font-size: 0.8rem; margin-top: 0.5rem; opacity: 0.6; }`;

export const INDEX_CSS_CONTENT = `@import "ghost.css";

:root {
    --color-brand: #3eb0ef;
}

.text-brand { color: var(--color-brand); }
.bg-brand { background-color: var(--color-brand); }
.border-brand { border-color: var(--color-brand); }
`;

export const PACKAGE_JSON_TEMPLATE = (name: string) => `{
  "name": "${name}",
  "description": "A new Ghost theme",
  "version": "0.1.0",
  "engines": {
    "ghost": ">=6.0.0"
  },
  "author": {
    "name": "Example Name",
    "email": "name@example.com",
    "url": "https://example.com"
  },
  "license": "MIT",
  "keywords": [
    "ghost-theme",
    "Ghost",
    "Theme"
  ],
  "config": {
    "posts_per_page": 25,
    "image_sizes": {
      "50": {
        "width": 50
      },
      "100": {
        "width": 100
      },
      "400": {
        "width": 400
      },
      "600": {
        "width": 600
      },
      "800": {
        "width": 800
      },
      "1000": {
        "width": 1000
      },
      "1200": {
        "width": 1200
      },
      "1600": {
        "width": 1600
      },
      "2000": {
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
    "@eslint/js": "^9.13.0",
    "globals": "^15.11.0",
    "@types/eslint__js": "^8.42.3",
    "@types/node": "^22.13.4",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.11.0",
    "stylelint": "^16.0.0",
    "stylelint-config-standard": "^36.0.0",
    "stylelint-config-recess-order": "^5.1.1"
  },
  "type": "module"
}
`;

export const ESLINT_CONFIG_TEMPLATE = `{
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/stylistic",
  ],
  rules: {
    "no-console": 1,
  },
}
`;

export const STYLELINT_CONFIG_TEMPLATE = `{
  "extends": ["stylelint-config-standard", "stylelint-config-recess-order"],
  "rules": {
    "import-notation": null,
    "hue-degree-notation": "number"
  }
}`;

export const DARK_MODE_CRITICAL_JS = `function toggleDarkModeShareButton(newMode: string) {
  const shareButton = document.querySelector("share-button");

  if (!shareButton) {
    return;
  }

  const modeAsBool = newMode === "dark" ? "true" : "false";
  shareButton?.setAttribute("dark-mode", modeAsBool);
}

function autoDarkMode() {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    document.documentElement.dataset.mode = "dark";
  } else {
    document.documentElement.dataset.mode = "light";
  }
}

function setDarkMode() {
  const prefers = localStorage.getItem("s-dark-mode");
  if (prefers) {
    document.documentElement.dataset.mode = prefers;
  } else {
    autoDarkMode();
  }
}

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", (e) => {
    const prefers = localStorage.getItem("s-dark-mode");

    // Abort if user has already set a preference
    if (prefers) {
      return;
    }

    if (e.matches) {
      toggleDarkModeShareButton("dark");
    } else {
      toggleDarkModeShareButton("light");
    }
    autoDarkMode();
  });

setDarkMode();`;

export const DARK_MODE_HANDLER_JS = `export function darkModeHandler() {
  const darkModeToggleButton = document.querySelectorAll(".s-dark-mode-toggle");

  if (!darkModeToggleButton) {
    return;
  }

  const mode = document.documentElement.dataset.mode!;
  toggleDarkModeShareButton(mode);

  Array.from(darkModeToggleButton).map((btn) =>
    btn.addEventListener("click", () => {
      const newMode = invertMode();
      toggleDarkModeShareButton(newMode);
      document.documentElement.dataset.mode = newMode;
      localStorage.setItem("s-dark-mode", newMode);
    })
  );
}

export function invertMode() {
  const currentMode = document.documentElement.dataset.mode!;
  return currentMode === "dark" ? "light" : "dark";
}`;

export const DARK_MODE_TOGGLE_HBS = `<button class="gtb-dark-mode-toggle" aria-label="Toggle dark mode">
    <span class="gtb-dark-mode">🌙</span>
    <span class="gtb-light-mode">☀️</span>
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
    ".otf": "file"
} as const;

