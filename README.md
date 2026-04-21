# Claude Monitor Widget

A lightweight desktop widget for **Windows** and **Linux** that opens the official Claude usage page, lets you sign in with your own account, and displays your usage details in a compact floating UI.

> Unofficial desktop widget for viewing Claude usage information.

## Overview

Claude Monitor Widget is a small Electron app designed to sit on your desktop and show the key values from your Claude usage page at a glance, including:

- Current session usage
- Weekly limit usage
- Elapsed time
- Time remaining until reset
- Reset time

The interface is intentionally compact and inspired by OLED-style system widgets.

## Features

- Frameless floating widget UI
- Cross-platform Electron app
- Works on Windows and Linux
- Opens Claude in a dedicated login window
- Persists the session between launches
- Refresh button for re-reading usage values
- Pin/unpin always-on-top toggle
- Reads values directly from the visible Claude usage page

## How It Works

This app does **not** use an official public Claude consumer usage API.

Instead, it:

1. Opens `https://claude.ai/settings/usage`
2. Lets you sign in through the normal Claude website
3. Reads the visible usage values shown on that page
4. Displays those values in the desktop widget

Because of this approach, the app depends on the current Claude web interface.

## Important Notes

This project is currently a **proof of concept**.

Please keep the following in mind:

- The widget only works if the Claude usage page is accessible and its layout remains compatible with the scraper.
- If the Claude website changes, `src/scraper.js` may need to be updated.
- You should only enter your Claude credentials on the official Claude login page, not anywhere in the widget itself.
- Use this project responsibly and ensure your usage complies with Anthropic’s terms and policies.

## Supported Values

The app is designed to display:

- **Current Session** percentage
- **Weekly Limit** percentage
- **Elapsed**
- **Resets In**
- **Resets At**

## Tech Stack

- **Electron**
- **HTML / CSS / JavaScript**
- **electron-builder** for packaging

## Project Structure

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

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npm start
```

### 3. Sign in to Claude

1. Launch the widget
2. Click the login button
3. A Claude browser window opens to the usage page
4. Sign in normally with your own account
5. Return to the widget and refresh if needed

## Build

### Build for Windows

```bash
npm run dist:win
```

### Build for Linux

```bash
npm run dist:linux
```

### Build all configured targets

```bash
npm run dist
```

Build output will be created in the `dist/` directory.

## Customisation

If Claude changes the structure of the usage page, the first file you will usually need to edit is:

```text
src/scraper.js
```

Useful places to adjust include:

- text matching rules
- label detection logic
- nearby value extraction
- fallback parsing rules

## Known Limitations

- No official Claude usage API integration
- Scraping may break if Claude updates the usage page
- Login/session handling depends on Electron web contents
- UI selectors may need maintenance over time

## Privacy and Security

- This app is intended to use the **official Claude website** for authentication.
- Credentials should only ever be entered into Claude’s own web page.
- Review the code yourself before use if you plan to distribute or rely on it.
- Do not assume long-term stability without testing after Claude UI changes.

## Suggested Improvements

Future enhancements could include:

- settings panel for refresh interval
- compact and expanded modes
- manual selector override config
- session expired notifications
- better error states and debug logging
- optional theme variations

## Disclaimer

This project is an independent third-party utility and is **not affiliated with, endorsed by, or sponsored by Anthropic**.

Claude is a trademark of Anthropic. Any references to Claude are for compatibility and descriptive purposes only.

This app relies on the Claude web interface for authentication and usage display. Because of that, functionality may break or require updates if Anthropic changes the Claude website, authentication flow, or usage page layout.

Users are responsible for ensuring their use of this software complies with Anthropic’s terms of service and any applicable laws or policies.

## License

This project is licensed under the **MIT License**.

## GitHub Setup Notes

Before publishing, you may want to review and update:

- `package.json` author field
- `package.json` repository field
- app ID / package metadata
- screenshots for the README
- release tags and version number

## Contributing

Pull requests, issues, and improvements are welcome.

If you make changes to the scraper logic, it helps to include:

- what Claude page layout changed
- what selector or pattern was updated
- a brief test result showing the widget still reads the expected values
