# Glücksrad

An ad-free wheel of fortune as a Progressive Web App. Works fully offline after the first visit,
installs to the home screen, and keeps everything on the device (no tracking, no network calls).

## Features

- Configurable number of options (2–30): `−` / `+` stepper or type the number, edit each label
- Several wheels (e.g. "Was essen wir?", "Ja oder Nein?"), switchable from the top bar; new / duplicate / delete
- Fair results: the winner is drawn with `crypto.getRandomValues` (unbiased), then the wheel animates to it
- Optional "ohne Zurücklegen" mode: a drawn option leaves the wheel until everyone had their turn
- Shuffle, tick sound, vibration (Android), confetti, dark mode
- Everything is saved in `localStorage` on the device

## Files

No build step and no dependencies: plain HTML/CSS/JS.

| File | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The app |
| `sw.js` | Service worker: caches everything for offline use |
| `manifest.webmanifest`, `icons/` | Install metadata and icons |
| `tools/make-icons.mjs` | Regenerates the icons (needs Playwright) |

## Run locally

```sh
npx http-server -c-1 .   # or: python3 -m http.server
```

Open http://localhost:8080. (Service workers need `https://` or `localhost`.)

## Put it on your phones

A PWA has to be served over HTTPS once; after that it runs offline. Any static host works because
all paths are relative. Note: this repo's GitHub Pages is already used by TreeFlow, so use one of these:

1. **Own GitHub repo + Pages** (free): create an empty repo, e.g. `gluecksrad`, then
   ```sh
   git push https://github.com/<you>/gluecksrad.git gluecksrad:main
   ```
   In the new repo: *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
   The app will be at `https://<you>.github.io/gluecksrad/`.
2. **Netlify Drop / Cloudflare Pages**: drag this folder onto https://app.netlify.com/drop.

Then install it:

- **iPhone (Safari)**: open the URL → Share button → *Zum Home-Bildschirm*.
- **Android (Chrome)**: open the URL → menu → *App installieren*.

Open the installed app once while online; from then on it works in airplane mode.

On iPhone, the home-screen app has its own storage, separate from Safari, so set up your wheels
inside the installed app, not in a Safari tab. Installed apps are also exempt from Safari's habit of
wiping data from sites that haven't been visited for a week.

## Updating

The service worker serves the cached copy first and refreshes it in the background, so a deployed
change shows up on the second launch. When you change files, also bump `CACHE` in `sw.js`
(e.g. `gluecksrad-v2`) so old caches are cleaned up.
