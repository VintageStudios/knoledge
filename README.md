# Knoledge Search app

This folder contains the installable web app and desktop app packaging source.

## Downloads

Prebuilt downloads are in `dist/`:

- `Knoledge-Search-PWA.zip` contains the web app files; host the extracted contents on HTTPS to install it.
- `Knoledge Search-0.1.7.dmg` and `Knoledge Search-0.1.7-mac.zip` are for Intel Macs.
- `Knoledge Search Setup 0.1.7.exe` is the 64-bit Windows installer.

The desktop builds are unsigned. macOS or Windows may show a warning the first time they are opened.
macOS auto-updates require signed builds; the current unsigned macOS builds
cannot install updates automatically.

## Install the web app

The PWA is in `PWA/`. Publish that folder to a website with HTTPS, then open it in a supported browser and choose **Install app** (or the browser's install option). On iPhone and iPad, open the HTTPS site in Safari and choose **Add to Home Screen**. PWA installation requires HTTPS; `file://` previews do not support installation or offline caching.

The app shell is cached for offline launch. Wikipedia search and website browsing still require an internet connection.

## Build the desktop app

Install Node.js 20 or later, then run these commands from this folder:

```sh
npm install
npm run build:mac
```

The macOS disk image and ZIP are written to `dist/`. This build targets the architecture of the Mac used to build it. The app is unsigned; macOS may ask you to confirm opening it.

To build the Windows installer on Windows, run:

```powershell
npm install
npm run build:win
```

The Windows installer is written to `dist/`. The desktop app loads the bundled PWA with its own secure app URL scheme and browser views for opened websites; searches and browsing use the user's internet connection. Browser versions store search history in a cookie; desktop builds use app-local storage for the same history. The hosted website and PWA use embedded frames, which some sites block; the desktop app has broader website support.

## Publish desktop updates

Desktop updates are published as GitHub Releases in
[`VintageStudios/knoledge`](https://github.com/VintageStudios/knoledge). The
packaged app checks that repository's latest release on startup. GitHub
Releases host the installers and Electron update metadata together, avoiding
the website host's per-file upload limit.

To publish from a developer machine, create a GitHub personal access token
with permission to write releases in the repository, set it as `GH_TOKEN` in
the shell, and run the platform-specific command from this folder:

```sh
npm run publish:mac
```

```powershell
npm run publish:win
```

The app version in `package.json` determines the release version. Increase it
before each release, and do not reuse a version that already has a GitHub
Release. The commands build the platform installer and publish it with the
`latest.yml` / `latest-mac.yml` metadata and blockmap assets that
`electron-updater` needs. Publish Windows builds from Windows and macOS builds
from macOS. macOS auto-updates require Developer ID signing, and each update
must use the same signing identity as the installed build.

The existing website `/versions/` feed is separate from GitHub Releases.
Installations already built to use that older feed will continue checking it;
they need one transition update through that feed before they can receive
updates from GitHub Releases. New builds use the GitHub provider.
