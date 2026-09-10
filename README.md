# Penn KDSAP website

A static Astro rebuild of Penn KDSAP's public pages, designed for GitHub Pages.

## Local development

```sh
npm install
npm run dev
```

## Full-page sitemap screenshots

Install the Chromium browser once, then capture every page in the live site's sitemap:

```sh
npx playwright install chromium
npm run screenshots
```

PNGs and a `manifest.json` report are written to `screenshots/`. The script accepts
`--sitemap`, `--output`, `--width`, `--height`, and `--timeout` options; for example:

```sh
npm run screenshots -- --output site-screenshots --width 1280
```

`site-html-archive/pages` is the source snapshot for every public page. The build copies each complete captured page response to the matching GitHub Pages route, preserving the original page markup, styling, assets, navigation, and interactive behavior.

## Editing content with Pages CMS

All published page copy, homepage sections, impact figures, map locations, events, leadership members, links, and image descriptions are managed in `content/`. Editors can use [Pages CMS](https://app.pagescms.org/) instead of editing files: sign in with GitHub, install the Pages CMS GitHub App for the [Penn KDSAP repository](https://github.com/pennkdsap/penn-kdsap), and select **Website pages**. Saving changes commits them to `main`, which automatically publishes the update through GitHub Pages.

The CMS provides dedicated **Homepage**, **Leadership team**, and **Events and calendar** editors. All remaining native pages appear under **Other website pages**. Leadership members and events are reorderable cards; editors can add items, update titles and photos, or hide a saved leadership member without deleting their information.

Images uploaded through Pages CMS are stored in `public/images`. See [CMS_EDITOR_GUIDE.md](docs/CMS_EDITOR_GUIDE.md) for the routine editing and publishing workflow.

## Analytics

The public site uses PostHog for pageviews and a small set of conversion events: screening-request clicks, Google Calendar opens and subscriptions, and successful contact-form submissions. Autocapture, session recording, exception capture, dead-click capture, heatmaps, and performance capture are disabled, and form field values are never sent to PostHog. Analytics is disabled on `localhost` and `127.0.0.1` so local development does not affect production data.
