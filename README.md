# Claude Monitor Widget

A small Electron desktop widget for Windows and Linux that:

- opens `claude.ai/settings/usage`
- lets you sign in with your own Claude account inside a dedicated Claude window
- reads the visible usage values from the page
- displays them in a compact desktop widget inspired by the mockup

## Important notes

This is a **proof-of-concept**. It does **not** use an official public Claude consumer-usage API.
Instead, it reads the values that appear on the Claude usage page after you sign in.

That means:

- the widget is only as reliable as the current Claude web UI
- if Anthropic changes the page layout, the scraper in `src/scraper.js` may need adjustment
- you should enter credentials only on the Claude page itself, not anywhere in the widget UI
- review Anthropic's current terms before using UI scraping heavily

## What it tries to display

- Current session percent
- Weekly limit percent
- Elapsed
- Resets in
- Resets at

## How auth works

1. Launch the widget.
2. Click the login button.
3. A Claude browser window opens to `https://claude.ai/settings/usage`.
4. Sign in normally.
5. Once the usage page is visible, the widget attempts to read the values automatically.
6. The session is persisted in Electron's local profile using the partition `persist:claude-monitor`.

## Run locally

```bash
npm install
npm start
```

## Build packages

### Windows

```bash
npm run dist:win
```

### Linux

```bash
npm run dist:linux
```

### Both

```bash
npm run dist
```

Build output goes to `dist/`.

## Project structure

```text
claude-monitor-widget/
├─ package.json
├─ README.md
└─ src/
   ├─ main.js
   ├─ preload.js
   ├─ scraper.js
   └─ ui/
      ├─ app.js
      ├─ index.html
      ├─ styles.css
      └─ trayTemplate.png
```

## Adjusting the scraper

If Claude changes the usage page, update `src/scraper.js`.

The easiest things to tweak are:

- the regex patterns at the top of the file
- the `findNearbyValue(...)` label matching
- any new labels or text blocks Anthropic introduces on the page

## Suggested next improvements

- add a settings panel for refresh interval
- add compact / expanded widget modes
- support manual selector overrides from a JSON config file
- add toast feedback when the login session expires
- add export of raw scraped values for debugging
