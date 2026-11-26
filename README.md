# Shopify App Template - Extension Only

This is a template for building a [Shopify app](https://shopify.dev/docs/apps/getting-started) using [Preact](https://preactjs.com/) and [Vite](https://vite.dev/). It uses Shopify's [Direct API access](https://shopify.dev/docs/api/app-home#direct-api-access) and [App Bridge](https://shopify.dev/docs/api/app-bridge) to make authenticated calls to the Shopify Admin API directly from the browser — no server required.

Rather than cloning this repo, follow the [Quick Start steps](#quick-start) below.

## Quick start

### Prerequisites

Before you begin, you'll need to [download and install the Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) if you haven't already.

### Setup

```shell
shopify app init --template=https://github.com/Shopify/shopify-app-template-extension-only
```

### Local Development

```shell
shopify app dev
```

Press P to open the URL to your app. Once you click install, you can start development.

Local development is powered by [Shopify CLI](https://shopify.dev/docs/apps/build/cli-for-apps/test-apps-locally). It logs into your account, connects to an app, provides environment variables, updates remote config, creates a tunnel and provides commands to generate extensions.

## Deploy and install

Shopify hosts the `one-free-item` Discount Function and the `promo-settings` admin UI extension. A live store needs Shopify Plus to run the Discount Function through a custom app. [Shopify Functions availability](https://shopify.dev/docs/api/functions/latest)

### 1. Prepare the build

Use Node.js 24 LTS, pnpm, and Shopify CLI. Check `node -v` before deploying. Node.js 23.6.1 fails during GraphQL type generation in this project.

On macOS with Homebrew, install and select Node.js 24 if needed. [Homebrew Node.js 24 package](https://formulae.brew.sh/formula/node@24)

```sh
brew install node@24
export PATH="$(brew --prefix node@24)/bin:$PATH"
node -v
```

From the repository root, run `pnpm install --frozen-lockfile` if dependencies are missing or the lockfile has changed.

### 2. Link the app and release a version

If you need to link the project to a Shopify app, run `shopify app config link` from the repository root. Select the organization that should own the app, then select an existing app or create a new one. Choose a configuration name when prompted. Check that the linked TOML includes the scopes and `[discount.metafields.app.function-configuration]` definition from [the reference config](./shopify.app.one-free-promo.toml). Keep the linked app's Client ID. [Shopify app configuration guide](https://shopify.dev/docs/apps/build/cli-for-apps/manage-app-config-files)

From the repository root, replace `YOUR_CONFIG_NAME` with the name you chose when linking the app. For a file named `shopify.app.<name>.toml`, use the `<name>` portion. Confirm the organization and app in the CLI prompt. The command builds both extensions and releases a version. In the Dev Dashboard, open **Apps → your app → Versions** and check for the **Active** badge. [Shopify app version deployment](https://shopify.dev/docs/apps/launch/deployment/deploy-app-versions)

```sh
shopify app deploy --config YOUR_CONFIG_NAME
```

### 3. Install on the live store

1. In **Dev Dashboard → Apps**, open your app and select **Distribution**. For the first installation, choose **Custom distribution** and confirm. Shopify locks the distribution method once selected. The **Test app** button is for development stores. [Shopify custom distribution](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method)
2. Open **Manage custom install link**, enter the store's `myshopify.com` domain, and click **Generate link**. If the store belongs to a different organization, configure the required IP allowlist before installation. [IP allowlist for extension-only apps](https://shopify.dev/docs/apps/build/app-extensions/build-extension-only-app#meet-the-ip-allowlist-requirement)
3. Open the link while signed in as the store owner, review the permissions, and click **Install**.
4. In the store admin, go to **Discounts → Create discount → Product promotion with quantity cap**. Configure and save the promotion, then test it at checkout with an eligible cart.

For subsequent releases, run the same deploy command. Installed stores receive the active version automatically. [Shopify app version deployment](https://shopify.dev/docs/apps/launch/deployment/deploy-app-versions)

## How it works

### Authentication

This template uses [Shopify managed installation](https://shopify.dev/docs/apps/build/authentication-authorization/app-installation). Shopify handles the OAuth flow and app installation automatically. Once installed, the app is fully embedded in the Shopify Admin.

### Querying data

This template uses [Direct API access](https://shopify.dev/docs/api/app-home#direct-api-access) — the Shopify Admin API is called directly from the browser using App Bridge. No server-side code is needed.

This template comes pre-configured with examples of querying data using GraphQL with direct API access, and using [metaobjects](https://shopify.dev/docs/apps/custom-data/metaobjects) to store and retrieve structured app data — see [/shared/models/faq.ts](./shared/models/faq.ts).

### App Bridge

[App Bridge](https://shopify.dev/docs/api/app-bridge) is loaded automatically in embedded apps.

### Polaris Web Components

This template uses [Polaris Web Components](https://shopify.dev/docs/api/app-home/web-components) — the native custom element version of Polaris that works in any framework (including Preact). No additional package installation is required as they are provided automatically in the Shopify Admin iframe.

## GraphQL Codegen

This template is pre-configured with [GraphQL Codegen](https://the-guild.dev/graphql/codegen) to generate TypeScript types from your GraphQL queries.

To regenerate types after updating queries:

```shell
npm run codegen
```

To watch for changes:

```shell
npm run codegen:watch
```

## Build

Build the app by running:

Using npm:

```shell
npm run build
```

Using yarn:

```shell
yarn build
```

Using pnpm:

```shell
pnpm run build
```

## Shopify Dev MCP

This template is configured with the Shopify Dev MCP. This instructs [Cursor](https://cursor.com/), [GitHub Copilot](https://github.com/features/copilot), [Claude Code](https://claude.com/product/claude-code), and [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) to use the Shopify Dev MCP.

For more information on the Shopify Dev MCP please read [the documentation](https://shopify.dev/docs/apps/build/devmcp).

## Metafields and Metaobjects

This template uses [metaobjects](https://shopify.dev/docs/apps/custom-data/metaobjects) and [metafields](https://shopify.dev/docs/apps/custom-data/metafields) to store structured app data without a custom database.

### Metaobject: FAQ

The template defines a `faq` metaobject type for storing FAQ entries. Each FAQ has a question, answer, a flag to control visibility on the FAQ page, and optional product associations.

Defined in `shopify.app.toml`:

```toml
[metaobjects.app.faq]
name = "FAQ"

[metaobjects.app.faq.fields.question]
name = "Question"
type = "single_line_text_field"
required = true

[metaobjects.app.faq.fields.answer]
name = "Answer"
type = "multi_line_text_field"
required = true

[metaobjects.app.faq.fields.show_on_faq_page]
name = "Show on FAQ page"
type = "boolean"

[metaobjects.app.faq.fields.products]
name = "Products"
type = "list.product_reference"
```

### Metafield: Product FAQ

A metafield definition links individual products to a FAQ metaobject entry, allowing merchants to associate a FAQ with specific products.

```toml
[product.metafields.app.faq]
name = "FAQ"
description = "FAQ for this product"
type = "metaobject_reference<$app:faq>"
access.admin = "merchant_read_write"
```

These definitions are automatically synced to Shopify when you run `shopify app dev` or `shopify app deploy`. See [/shared/models/faq.ts](./shared/models/faq.ts) for the client-side model that reads and writes these metaobjects via the Admin GraphQL API.

## Resources

Preact & Vite:

- [Preact docs](https://preactjs.com/guide/v10/getting-started)
- [Vite docs](https://vite.dev/)

Shopify:

- [Intro to Shopify apps](https://shopify.dev/docs/apps/getting-started)
- [Direct API access](https://shopify.dev/docs/api/app-home#direct-api-access)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [App Bridge](https://shopify.dev/docs/api/app-bridge)
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/web-components)
- [Metaobjects](https://shopify.dev/docs/apps/custom-data/metaobjects)
- [App extensions](https://shopify.dev/docs/apps/app-extensions/list)
- [Shopify Functions](https://shopify.dev/docs/api/functions)
