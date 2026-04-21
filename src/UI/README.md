# Bahgo Flood Detection Dashboard

A static HTML/CSS/JavaScript admin dashboard for a flood detection monitoring system.

## Overview

This website provides a login screen and a dashboard view for monitoring water levels, station status, and device activity. The login panel includes animated entrance styling and the dashboard includes summary cards, station cards, a detailed table, and a modal with chart history.

## Files

- `index.html` - Main website structure and layout.
- `style.css` - Page styling, animations, and responsive layout.
- `script.js` - Mock station data, page navigation, login behavior, chart rendering, and local storage support.
- `.vscode/launch.json` - VS Code debug configuration for opening `index.html` directly in Chrome.

## Run locally

### Option 1: Open directly in the browser

1. Open `index.html` in your browser.
2. The site runs as a static page, no server required.

### Option 2: Use VS Code Run and Debug

1. Open the workspace in VS Code.
2. Select `Run and Debug` from the sidebar.
3. Choose `Open index.html in Chrome`.

### Option 3: Start a local HTTP server

If you prefer a local server, run this from the project folder:

```bash
cd c:\BahgoWebsite
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Notes

- The site currently uses mock data in `script.js` and can be connected to a backend later.
- The login page uses a static `Remember me` behavior via `localStorage`.
- The dashboard includes a chart rendered by `Chart.js` loaded from CDN.

## Bahgo Website 

https://levietano.github.io/BAHGO-Web-App/

## Customization

- Update station data in `script.js` for new monitoring locations.
- Modify visual styles in `style.css`.
- Change the login or dashboard text in `index.html`.

