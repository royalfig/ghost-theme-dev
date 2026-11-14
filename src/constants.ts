// Files written by `gtb init`. Templates follow Ghost's Source theme
// (github.com/TryGhost/Source) for anything Ghost-specific: members, social
// accounts, image sizes, custom fonts and card assets.

export const GH_ACTION_CONTENT = `# Builds the theme with gtb and uploads it to Ghost on every push to main.
#
# Setup: in Ghost Admin, go to Settings → Integrations → Add custom
# integration, then add its Admin API URL and key to this repository as the
# secrets GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY.
# Commit your package-lock.json: npm ci needs it.
#
# Learn more → https://github.com/TryGhost/action-deploy-theme#getting-started
name: Build and deploy theme

on:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: "24"

      - run: npm ci

      # Production build, image optimization and packaging, same as locally
      - run: npm run zip

      - id: zip
        run: echo "path=$(ls dist/*.zip | head -n 1)" >> "$GITHUB_OUTPUT"

      - uses: TryGhost/action-deploy-theme@v2
        with:
          api-url: \${{ secrets.GHOST_ADMIN_API_URL }}
          api-key: \${{ secrets.GHOST_ADMIN_API_KEY }}
          file: \${{ steps.zip.outputs.path }}
`;

export const DEFAULT_TEMPLATE_CONTENT = `<!DOCTYPE html>
<html lang="{{@site.locale}}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{meta_title page=(t " (Page %)")}}</title>

    {{!-- Critical JS and CSS: gtb inlines these two tags into default.hbs.
         The script sets dark/light mode before first paint. --}}
    <script src="{{asset "built/js/critical/index.js"}}"></script>
    <link rel="stylesheet" href="{{asset "built/css/critical/index.css"}}">

    {{!-- Everything else loads without blocking rendering --}}
    <script src="{{asset "built/js/index.js"}}" defer></script>
    <link rel="stylesheet" href="{{asset "built/css/index.css"}}" media="print" onload="this.media='all'">
    <noscript><link rel="stylesheet" href="{{asset "built/css/index.css"}}"></noscript>

    {{!-- SEO meta, structured data and Ghost's scripts. Keep it last in <head>. --}}
    {{ghost_head}}
</head>
<body class="{{body_class}}">
    <div class="gh-site">
        {{> "header"}}

        <main class="gh-main">
            {{{body}}}
        </main>

        {{> "footer"}}
    </div>

    {{!-- Ghost's functional scripts (members, search, comments). Keep it last in <body>. --}}
    {{ghost_foot}}
</body>
</html>`;

export const POST_TEMPLATE_CONTENT = `{{!< default}}

{{#post}}
<article class="gh-article {{post_class}}">
    <header class="gh-article-header">
        {{#primary_tag}}
            <a class="gh-article-tag" href="{{url}}">{{name}}</a>
        {{/primary_tag}}
        <h1 class="gh-article-title">{{title}}</h1>
        {{#if custom_excerpt}}
            <p class="gh-article-excerpt">{{custom_excerpt}}</p>
        {{/if}}
        <div class="gh-article-meta">
            <span class="gh-article-authors">{{authors}}</span>
            <time datetime="{{date format="YYYY-MM-DD"}}">{{date}}</time>
            {{#if reading_time}}
                <span>{{reading_time minute=(t "1 min read") minutes=(t "% min read")}}</span>
            {{/if}}
        </div>
        {{> "feature-image"}}
    </header>

    <section class="gh-content">
        {{content}}
    </section>

    {{#if comments}}
        <section class="gh-comments">
            {{comments}}
        </section>
    {{/if}}
</article>
{{/post}}

{{!-- Related posts. data-nosnippet keeps them out of search result snippets. --}}
{{#if @custom.show_related_articles}}
    {{#get "posts" include="authors" filter="id:-{{post.id}}" limit="3" as |related|}}
        {{#if related}}
            <section class="gh-related" data-nosnippet>
                <h2>{{t "Read more"}}</h2>
                <div class="gh-feed">
                    {{#foreach related}}
                        {{> "card"}}
                    {{/foreach}}
                </div>
            </section>
        {{/if}}
    {{/get}}
{{/if}}`;

export const INDEX_TEMPLATE_CONTENT = `{{!< default}}

<section class="gh-feed">
    {{#foreach posts}}
        {{> "card"}}
    {{/foreach}}
</section>

{{pagination}}`;

export const PAGE_TEMPLATE_CONTENT = `{{!< default}}

{{#post}}
<article class="gh-article {{post_class}}">
    {{#match @page.show_title_and_feature_image}}
        <header class="gh-article-header">
            <h1 class="gh-article-title">{{title}}</h1>
            {{> "feature-image"}}
        </header>
    {{/match}}

    <section class="gh-content">
        {{content}}
    </section>
</article>
{{/post}}`;

export const AUTHOR_TEMPLATE_CONTENT = `{{!< default}}

{{#author}}
<header class="gh-archive">
    {{#if profile_image}}
        <img class="gh-author-image" src="{{img_url profile_image size="xs" format="webp"}}" alt="{{name}}">
    {{/if}}
    <h1>{{name}}</h1>
    {{#if bio}}
        <p>{{bio}}</p>
    {{/if}}
    <div class="gh-author-meta">
        {{#if location}}
            <span>{{location}}</span>
        {{/if}}
        {{#if website}}
            <a href="{{website}}" target="_blank" rel="noopener">{{t "Website"}}</a>
        {{/if}}
        {{#social_accounts this}}
            <a href="{{href}}" target="_blank" rel="noopener">{{name}}</a>
        {{/social_accounts}}
    </div>
</header>
{{/author}}

<section class="gh-feed">
    {{#foreach posts}}
        {{> "card"}}
    {{/foreach}}
</section>

{{pagination}}`;

export const TAG_TEMPLATE_CONTENT = `{{!< default}}

{{#tag}}
<header class="gh-archive">
    <h1>{{name}}</h1>
    {{#if description}}
        <p>{{description}}</p>
    {{else}}
        <p>{{plural ../pagination.total empty=(t "No posts") singular=(t "1 post") plural=(t "% posts")}}</p>
    {{/if}}
</header>
{{/tag}}

<section class="gh-feed">
    {{#foreach posts}}
        {{> "card"}}
    {{/foreach}}
</section>

{{pagination}}`;

export const ERROR_404_TEMPLATE_CONTENT = `{{!< default}}

<section class="gh-error">
    <h1>404</h1>
    <h2>{{t "Page not found"}}</h2>
    <p>{{t "Sorry, we couldn't find the page you're looking for."}}</p>
    <a href="{{@site.url}}">{{t "Back to home"}}</a>
</section>`;

export const CARD_PARTIAL_CONTENT = `<article class="gh-card {{post_class}}">
    <a class="gh-card-link" href="{{url}}">
        {{#if feature_image}}
            <img
                class="gh-card-image"
                srcset="{{img_url feature_image size="xs" format="webp"}} 160w,
                        {{img_url feature_image size="s" format="webp"}} 320w,
                        {{img_url feature_image size="m" format="webp"}} 600w"
                sizes="(max-width: 600px) 100vw, 320px"
                src="{{img_url feature_image size="m"}}"
                alt="{{#if feature_image_alt}}{{feature_image_alt}}{{else}}{{title}}{{/if}}"
                loading="lazy"
            >
        {{/if}}
        <div class="gh-card-meta">
            {{#primary_tag}}
                <span class="gh-card-tag">{{name}}</span>
            {{/primary_tag}}
            <time datetime="{{date format="YYYY-MM-DD"}}">{{date}}</time>
            {{#if reading_time}}
                <span>{{reading_time minute=(t "1 min read") minutes=(t "% min read")}}</span>
            {{/if}}
        </div>
        <h2 class="gh-card-title">{{title}}</h2>
        {{#if excerpt}}
            <p class="gh-card-excerpt">{{excerpt words="30"}}</p>
        {{/if}}
    </a>
</article>`;

export const HEADER_PARTIAL_CONTENT = `<header class="gh-header">
    <a class="gh-header-logo" href="{{@site.url}}">
        {{#if @site.logo}}
            <img src="{{@site.logo}}" alt="{{@site.title}}">
        {{else}}
            {{@site.title}}
        {{/if}}
    </a>

    <nav class="gh-header-nav">
        {{navigation}}
    </nav>

    <div class="gh-header-actions">
        <button class="gh-search" type="button" aria-label="{{t "Search this site"}}" data-ghost-search>{{t "Search"}}</button>
        {{> "dark-mode-toggle"}}

        {{!-- Member links only when memberships are on; data-portal opens Ghost's Portal --}}
        {{#if @site.members_enabled}}
            {{#unless @member}}
                <a href="#/portal/signin" data-portal="signin">{{t "Sign in"}}</a>
                {{#unless @site.members_invite_only}}
                    <a class="gh-button" href="#/portal/signup" data-portal="signup">{{t "Subscribe"}}</a>
                {{/unless}}
            {{else}}
                <a class="gh-button" href="#/portal/account" data-portal="account">{{t "Account"}}</a>
            {{/unless}}
        {{/if}}
    </div>
</header>`;

export const FOOTER_PARTIAL_CONTENT = `<footer class="gh-footer">
    {{#if @site.members_enabled}}
        {{#unless @member}}
            {{#unless @site.members_invite_only}}
                <section class="gh-footer-signup">
                    <h2>{{@site.title}}</h2>
                    {{#if @site.description}}
                        <p>{{@site.description}}</p>
                    {{/if}}
                    {{> "email-subscription" email_field_id="footer-email"}}
                </section>
            {{/unless}}
        {{/unless}}
    {{/if}}

    {{!-- Social accounts set in Settings → General (Ghost 6.38+) --}}
    <div class="gh-footer-social">
        {{#social_accounts @site}}
            <a href="{{href}}" target="_blank" rel="noopener" aria-label="{{name}}">{{name}}</a>
        {{/social_accounts}}
    </div>

    <div class="gh-footer-bar">
        <span>&copy; {{date format="YYYY"}} {{@site.title}}</span>
        {{navigation type="secondary"}}
    </div>
</footer>`;

export const EMAIL_SUBSCRIPTION_PARTIAL_CONTENT = `{{!-- Ghost adds .loading, .success or .error to the form while it submits --}}
<form class="gh-form" data-members-form="signup">
    <label class="gh-visually-hidden" for="{{email_field_id}}">{{t "Your email address"}}</label>
    <input id="{{email_field_id}}" type="email" name="email" placeholder="{{t "jamie@example.com"}}" required data-members-email>
    <button type="submit">{{t "Subscribe"}}</button>
    <p class="gh-form-success">{{t "Check your inbox to confirm your subscription."}}</p>
    <p class="gh-form-error" data-members-error></p>
</form>`;

export const NAVIGATION_PARTIAL_CONTENT = `<ul class="gh-nav">
    {{#foreach navigation}}
        <li class="{{link_class for=url class=(concat "nav-" slug)}}">
            <a href="{{url absolute="true"}}">{{label}}</a>
        </li>
    {{/foreach}}
</ul>`;

export const FEATURE_IMAGE_PARTIAL_CONTENT = `{{!-- Above the fold on posts and pages, so it loads with high priority, not lazily --}}
{{#if feature_image}}
    <figure class="gh-feature-image">
        <img
            srcset="{{img_url feature_image size="s" format="webp"}} 320w,
                    {{img_url feature_image size="m" format="webp"}} 600w,
                    {{img_url feature_image size="l" format="webp"}} 960w,
                    {{img_url feature_image size="xl" format="webp"}} 1200w,
                    {{img_url feature_image size="xxl" format="webp"}} 2000w"
            sizes="(max-width: 1200px) 100vw, 1200px"
            src="{{img_url feature_image size="xl"}}"
            alt="{{#if feature_image_alt}}{{feature_image_alt}}{{else}}{{title}}{{/if}}"
            fetchpriority="high"
        >
        {{#if feature_image_caption}}
            <figcaption>{{feature_image_caption}}</figcaption>
        {{/if}}
    </figure>
{{/if}}`;

export const DARK_MODE_TOGGLE_HBS = `<button class="gtb-dark-mode-toggle" type="button" aria-label="{{t "Toggle dark mode"}}">
    <span class="gtb-dark-mode">{{t "Dark"}}</span>
    <span class="gtb-light-mode">{{t "Light"}}</span>
</button>`;

export const GHOST_CSS_CONTENT = `/* Wide and full-width cards in post content (required by Ghost) */
.kg-width-wide img {
  width: 100%;
  max-width: 80vw;
  margin: 2rem auto;
}

.kg-width-full img {
  width: 100%;
  max-width: 100vw;
  margin: 2rem auto;
}

.kg-card figcaption {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  text-align: center;
  opacity: 0.6;
}

/* Members signup form (partials/email-subscription.hbs) */
.gh-form-success { display: none; }
.gh-form.success .gh-form-success { display: block; }
.gh-form.success input,
.gh-form.success button { display: none; }
.gh-form-error:empty { display: none; }

.gh-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`;

export const INDEX_CSS_CONTENT = `/* Main stylesheet. Files next to this one are partials: import them here. */
@import "ghost.css";
`;

export const CRITICAL_CSS_CONTENT = `/* Inlined into default.hbs. Keep it to what the first screen needs. */
@import "reset.css";
@import "base.css";
`;

export const BASE_CSS_CONTENT = `/* data-mode is set before first paint by src/js/critical/index.ts */
:root {
  color-scheme: light;
  --color-bg: #fff;
  --color-text: #15171a;
  --color-muted: #6b7280;
  --color-accent: var(--ghost-accent-color, #ff1a75);

  /* Fonts picked in Ghost Admin (Settings → Design → Brand) override these */
  --font-body: var(--gh-font-body, system-ui, sans-serif);
  --font-heading: var(--gh-font-heading, var(--font-body));
}

:root[data-mode="dark"] {
  color-scheme: dark;
  --color-bg: #15171a;
  --color-text: #f3f4f6;
  --color-muted: #9ca3af;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
}

a {
  color: var(--color-accent);
}

/* The toggle shows the mode it switches to */
:root[data-mode="dark"] .gtb-dark-mode,
:root:not([data-mode="dark"]) .gtb-light-mode {
  display: none;
}
`;

export const CSS_RESET = `
/* https://www.joshwcomeau.com/css/custom-css-reset/ */
/* 1. Use a more-intuitive box-sizing model */
*, *::before, *::after {
  box-sizing: border-box;
}

/* 2. Remove default margin */
*:not(dialog) {
  margin: 0;
}

/* 3. Enable keyword animations */
@media (prefers-reduced-motion: no-preference) {
  html {
    interpolate-size: allow-keywords;
  }
}

body {
  /* 4. Increase line-height */
  line-height: 1.5;
  /* 5. Improve text rendering */
  -webkit-font-smoothing: antialiased;
}

/* 6. Improve media defaults */
img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
}

/* 7. Inherit fonts for form controls */
input, button, textarea, select {
  font: inherit;
}

/* 8. Avoid text overflows */
p, h1, h2, h3, h4, h5, h6 {
  overflow-wrap: break-word;
}

/* 9. Improve line wrapping */
p {
  text-wrap: pretty;
}
h1, h2, h3, h4, h5, h6 {
  text-wrap: balance;
}
`;

export const INDEX_JS_CONTENT = `// Main script. Files next to this one are modules: import them here.
import { darkModeHandler } from "./darkMode";

darkModeHandler();
`;

export const DARK_MODE_CRITICAL_JS = `// Inlined into <head> by gtb, so it runs before first paint and the page never
// flashes the wrong color scheme. The toggle button lives in src/js/darkMode.ts.
const STORAGE_KEY = "gtb-dark-mode";
const query = window.matchMedia("(prefers-color-scheme: dark)");

function storedMode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function systemMode(): "dark" | "light" {
  return query.matches ? "dark" : "light";
}

document.documentElement.dataset.mode = storedMode() ?? systemMode();

// Follow the system setting until the reader picks a mode with the toggle.
query.addEventListener("change", () => {
  if (!storedMode()) document.documentElement.dataset.mode = systemMode();
});
`;

export const DARK_MODE_HANDLER_JS = `const STORAGE_KEY = "gtb-dark-mode";

/** Wires up every .gtb-dark-mode-toggle (partials/dark-mode-toggle.hbs). */
export function darkModeHandler(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".gtb-dark-mode-toggle");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const root = document.documentElement;
      const next = root.dataset.mode === "dark" ? "light" : "dark";
      root.dataset.mode = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage unavailable (private mode): the choice lasts for this page only.
      }
    });
  });
}
`;

export const PACKAGE_JSON_TEMPLATE = (name: string) => `{
  "name": "${name}",
  "description": "A new Ghost theme",
  "version": "0.1.0",
  "engines": {
    "ghost": ">=6.38.0"
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
    "posts_per_page": 12,
    "card_assets": true,
    "image_sizes": {
      "xs": {
        "width": 160
      },
      "s": {
        "width": 320
      },
      "m": {
        "width": 600
      },
      "l": {
        "width": 960
      },
      "xl": {
        "width": 1200
      },
      "xxl": {
        "width": 2000
      }
    },
    "custom": {
      "show_related_articles": {
        "type": "boolean",
        "default": true
      }
    }
  },
  "scripts": {
    "dev": "gtb dev",
    "build": "gtb build",
    "lint": "gtb lint",
    "check": "gtb check",
    "zip": "gtb zip",
    "deploy": "gtb deploy"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@royalfig/gtb": "^5.0.1",
    "@types/node": "^26.6.6",
    "eslint": "^10.15.0",
    "globals": "^17.14.0",
    "stylelint": "^17.16.0",
    "stylelint-config-recess-order": "^7.10.0",
    "stylelint-config-standard": "^40.0.0",
    "typescript": "~6.0.3",
    "typescript-eslint": "^8.72.2"
  },
  "type": "module"
}
`;

export const ESLINT_CONFIG_TEMPLATE = `// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["assets/built/", "dist/"]),
  {
    files: ["**/*.{js,ts}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "no-console": "warn",
    },
  },
]);
`;

export const STYLELINT_CONFIG_TEMPLATE = `{
  "extends": ["stylelint-config-standard", "stylelint-config-recess-order"],
  "rules": {
    "import-notation": null,
    "hue-degree-notation": "number"
  }
}`;

export const EXTERNAL_ASSETS = [
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.svg",
  "*.gif",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.otf",
] as const;

export const LOCALES_EN_JSON_CONTENT = `{
    " (Page %)": " (Page %)",
    "1 min read": "1 min read",
    "% min read": "% min read",
    "% posts": "% posts",
    "1 post": "1 post",
    "Account": "Account",
    "Back to home": "Back to home",
    "Check your inbox to confirm your subscription.": "Check your inbox to confirm your subscription.",
    "Dark": "Dark",
    "jamie@example.com": "jamie@example.com",
    "Light": "Light",
    "No posts": "No posts",
    "Page not found": "Page not found",
    "Read more": "Read more",
    "Search": "Search",
    "Search this site": "Search this site",
    "Sign in": "Sign in",
    "Sorry, we couldn't find the page you're looking for.": "Sorry, we couldn't find the page you're looking for.",
    "Subscribe": "Subscribe",
    "Toggle dark mode": "Toggle dark mode",
    "Website": "Website",
    "Your email address": "Your email address"
}
`;

export const GITIGNORE_CONTENT = `node_modules
dist
assets/built
.DS_Store
.env*

# Generated by gtb
default.hbs
gtb-debug.log
`;
