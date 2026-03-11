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
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{meta_title}}</title>
    
    {{!-- Critical script for dark mode to prevent flash --}}
    <script src="{{asset "built/js/critical.js"}}"></script>

    <link rel="stylesheet" href="{{asset "built/css/index.css"}}">
    {{ghost_head}}
</head>
<body class="{{body_class}}">

    <div class="flex flex-col min-h-screen">
        {{> "header"}}

        <main class="grow">
            {{{body}}}
        </main>

        {{> "footer"}}
    </div>

    <script src="{{asset "built/js/index.js"}}" defer></script>
    {{ghost_foot}}

</body>
</html>`;

export const POST_TEMPLATE_CONTENT = `{{!< default}}

{{#post}}
<article class="pt-16 pb-24 px-4 md:px-8 max-w-7xl mx-auto w-full">
    <header class="max-w-3xl mx-auto text-center mb-12">
        {{#if primary_tag}}
            {{#primary_tag}}
                <a href="{{url}}" class="inline-block text-brand px-3 py-1 bg-brand/10 text-sm font-semibold tracking-wide uppercase mb-6 hover:bg-brand/20 transition-colors">
                   # {{name}}
                </a>
            {{/primary_tag}}
        {{/if}}

        <h1 class="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-8">
            {{title}}
        </h1>

        <div class="flex items-center mx-auto justify-center gap-4 font-medium">
            {{#foreach authors}}
                <div class="flex items-center gap-3 text-left">
                    {{#if profile_image}}
                        <img src="{{img_url profile_image size="xs"}}" alt="{{name}}" class="w-10 h-10 rounded-full border border-border object-cover" />
                    {{/if}}
                    <div class="flex flex-col text-xs">
                        <a href="{{url}}" class="font-semibold">{{name}}</a>
                        <time datetime="{{date ../published_at format="YYYY-MM-DD"}}"> {{date ../published_at format="DD MMMM YYYY"}}</time>
                    </div>
                </div>
            {{/foreach}}
        </div>
    </header>

    {{#if feature_image}}
    <div class="max-w-5xl mx-auto mb-16 rounded-3xl overflow-hidden shadow-2xl">
        <img 
            class="w-full h-auto object-cover max-h-[600px]"
            srcset="{{img_url feature_image size="s"}} 300w,
                    {{img_url feature_image size="m"}} 600w,
                    {{img_url feature_image size="l"}} 1000w,
                    {{img_url feature_image size="xl"}} 2000w"
            sizes="(max-width: 1000px) 100vw, 1000px"
            src="{{img_url feature_image size="l"}}"
            alt="{{#if feature_image_alt}}{{feature_image_alt}}{{else}}{{title}}{{/if}}"
        />
    </div>
    {{/if}}

    <div class="prose prose-lg md:prose-xl dark:prose-invert mx-auto max-w-3xl">
        {{content}}
    </div>
</article>
{{/post}}`;

export const INDEX_TEMPLATE_CONTENT = `{{!< default}}

<section class="max-w-7xl mx-auto px-4 md:px-8 pt-16 pb-24">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {{#foreach posts}}
            {{> "card"}}
        {{/foreach}}
    </div>

    <div class="mt-16 flex justify-center">
        {{pagination}}
    </div>
</section>`;

export const PAGE_TEMPLATE_CONTENT = `{{!< default}}

{{#post}}
<article class="pt-16 pb-24 px-4 md:px-8 max-w-7xl mx-auto w-full">
    <header class="max-w-3xl mx-auto text-center mb-12">
        <h1 class="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-8">
            {{title}}
        </h1>
    </header>

    {{#if feature_image}}
    <div class="max-w-5xl mx-auto mb-16 rounded-3xl overflow-hidden shadow-2xl">
        <img 
            class="w-full h-auto object-cover max-h-[500px]"
            src="{{img_url feature_image size="l"}}"
            alt="{{title}}"
        />
    </div>
    {{/if}}

    <div class="prose prose-lg md:prose-xl dark:prose-invert mx-auto max-w-3xl">
        {{content}}
    </div>
</article>
{{/post}}`;

export const AUTHOR_TEMPLATE_CONTENT = `{{!< default}}

<section class="max-w-7xl mx-auto px-4 md:px-8 pt-16 pb-24">
    <div class="mb-16 border-b border-border pb-12 flex flex-col md:flex-row items-center gap-8">
        {{#author}}
            {{#if profile_image}}
                <img class="w-24 h-24 rounded-full object-cover shadow-lg border-2 border-border" src="{{img_url profile_image size="s"}}" alt="{{name}}" />
            {{/if}}

            <div class="text-center md:text-left">
                <h1 class="text-4xl font-extrabold tracking-tight mb-2">{{name}}</h1>
                {{#if bio}}
                    <p class="text-xl max-w-2xl leading-relaxed mb-4">{{bio}}</p>
                {{/if}}
            </div>
        {{/author}}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {{#foreach posts}}
            {{> "card"}}
        {{/foreach}}
    </div>

    <div class="mt-16 flex justify-center">
        {{pagination}}
    </div>
</section>`;

export const TAG_TEMPLATE_CONTENT = `{{!< default}}

<section class="max-w-7xl mx-auto px-4 md:px-8 pt-16 pb-24">
    <header class="mb-16 border-b border-border pb-12">
        {{#tag}}
            <h1 class="text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl mb-4">{{name}}</h1>
            <p class="text-xl max-w-2xl leading-relaxed">
                {{#if description}}
                    {{description}}
                {{else}}
                    A collection of {{plural ../pagination.total empty='zero posts' uint='one post' other='% posts'}}
                {{/if}}
            </p>
        {{/tag}}
    </header>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {{#foreach posts}}
            {{> "card"}}
        {{/foreach}}
    </div>

    <div class="mt-16 flex justify-center">
        {{pagination}}
    </div>
</section>`;

export const ERROR_404_TEMPLATE_CONTENT = `{{!< default}}

<section class="max-w-7xl mx-auto px-4 md:px-8 py-32 flex flex-col items-center justify-center text-center">
    <h1 class="text-9xl font-extrabold text-brand/20 mb-4">404</h1>
    <h2 class="text-4xl font-bold mb-6">Page not found</h2>
    <p class="text-xl text-muted-foreground mb-12 max-w-md">Sorry, we couldn't find the page you're looking for. It might have been moved or deleted.</p>
    <a href="{{@site.url}}" class="bg-brand text-white px-8 py-3 rounded-full font-bold hover:opacity-90 transition-all shadow-lg transform hover:-translate-y-1">
        Back to Home
    </a>
</section>`;

export const CARD_PARTIAL_CONTENT = `<article class="flex flex-col gap-4 group">
    {{#if feature_image}}
    <a href="{{url}}" class="aspect-video overflow-hidden rounded-lg">
        <img 
            class="object-cover w-full h-full transform transition duration-500 group-hover:scale-105"
            src="{{img_url feature_image size="m"}}"
            alt="{{title}}"
            loading="lazy"
        />
    </a>
    {{/if}}

    <div class="flex flex-col gap-3">
        <div class="flex items-center gap-3 text-sm font-medium">
            {{#primary_tag}}
                <span class="text-brand">{{name}}</span>
            {{/primary_tag}}
            <span class="text-muted-foreground">
                <time datetime="{{date format="YYYY-MM-DD"}}">{{date format="D MMM YYYY"}}</time>
            </span>
        </div>
        
        <a href="{{url}}">
            <h2 class="text-2xl font-bold leading-tight tracking-tight group-hover:text-brand transition-colors">
                {{title}}
            </h2>
        </a>
        <p class="text-muted-foreground line-clamp-2 leading-relaxed">
            {{excerpt words="30"}}
        </p>
    </div>
</article>`;

export const HEADER_PARTIAL_CONTENT = `<header class="py-6 border-b border-border px-4 md:px-8">
    <nav class="flex max-w-7xl items-center justify-between mx-auto">
        <div class="flex items-center">
            <a class="text-2xl font-bold tracking-tight" href="{{@site.url}}">
                {{#if @site.logo}}
                    <img src="{{@site.logo}}" alt="{{@site.title}}" class="h-8 w-auto dark:invert" />
                {{else}}
                    {{@site.title}}
                {{/if}}
            </a>
        </div>
        <div class="hidden md:block">
            {{navigation}}
        </div>
        <div class="flex items-center gap-4">
            {{> "dark-mode-toggle"}}
            <button class="gh-search-icon" data-ghost-search aria-label="Search">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </button>
        </div>
    </nav>
</header>`;

export const FOOTER_PARTIAL_CONTENT = `<footer class="py-12 mt-20 border-t border-border">
    <div class="max-w-7xl mx-auto px-4 md:px-8">
        <div class="flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-muted-foreground">
            <div>
                &copy; {{date format="YYYY"}} {{@site.title}}. All rights reserved.
            </div>
            <div class="flex items-center gap-6">
                {{navigation type="secondary"}}
            </div>
        </div>
    </div>
</footer>`;

export const NAVIGATION_PARTIAL_CONTENT = `<ul class="flex items-center gap-8 list-none p-0 m-0">
    {{#foreach navigation}}
        <li class="{{link_class for=url class=(concat "nav-" slug)}}">
            <a href="{{url absolute="true"}}" class="text-sm font-semibold hover:text-brand transition-colors">{{label}}</a>
        </li>
    {{/foreach}}
</ul>`;

export const PAGINATION_PARTIAL_CONTENT = `<nav class="flex items-center justify-between border-t border-border px-4 py-8 w-full" role="pagination">
    <div class="flex flex-1 w-0">
        {{#if prev}}
            <a href="{{page_url prev}}" class="inline-flex items-center pt-4 pr-1 text-sm font-medium hover:text-brand transition-all">
                ← Previous
            </a>
        {{/if}}
    </div>
    
    <div class="hidden md:flex">
        <span class="inline-flex items-center pt-4 text-sm font-medium">
            Page {{page}} of {{pages}}
        </span>
    </div>

    <div class="flex flex-1 justify-end w-0">
        {{#if next}}
            <a href="{{page_url next}}" class="inline-flex items-center pt-4 pl-1 text-sm font-medium hover:text-brand transition-all">
                Next →
            </a>
        {{/if}}
    </div>
</nav>`;

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

export const TAILWIND_V4_CSS = `@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme {
  --color-brand: #3eb0ef;
  --color-muted-foreground: oklch(0.556 0 0);
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
      "xxs": { "width": 30 },
      "xs": { "width": 100 },
      "s": { "width": 300 },
      "m": { "width": 600 },
      "l": { "width": 1000 },
      "xl": { "width": 2000 }
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
    "@tailwindcss/typography": "^0.5.15",
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
