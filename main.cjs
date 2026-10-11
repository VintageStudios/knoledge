const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "knoledge",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const webRoot = app.isPackaged
  ? path.join(process.resourcesPath, "PWA")
  : path.resolve(__dirname, "../PWA");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
]);
const browserGuests = new Map();
let mainWindow;
let browserCommandsRegistered = false;

function parseWebUrl(value) {
  try {
    const target = new URL(value);
    return ["http:", "https:"].includes(target.protocol) ? target : null;
  } catch {
    return null;
  }
}

function sendGuestNavigation(contents) {
  if (!mainWindow || mainWindow.isDestroyed() || contents.isDestroyed()) {
    return;
  }

  const url = parseWebUrl(contents.getURL());
  if (!url) {
    return;
  }

  mainWindow.webContents.send("browser:guest-navigation", {
    webContentsId: contents.id,
    url: url.href,
    title: contents.getTitle(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
  });
}

function registerBrowserCommands() {
  if (browserCommandsRegistered) {
    return;
  }
  browserCommandsRegistered = true;

  const commandHandlers = new Map([
    ["browser:go-back", (contents) => contents.navigationHistory.goBack()],
    ["browser:go-forward", (contents) => contents.navigationHistory.goForward()],
    ["browser:reload", (contents) => contents.reload()],
  ]);

  for (const [channel, command] of commandHandlers) {
    ipcMain.on(channel, (event, webContentsId) => {
      if (event.sender !== mainWindow?.webContents || !Number.isSafeInteger(webContentsId)) {
        return;
      }

      const contents = browserGuests.get(webContentsId);
      if (!contents || contents.isDestroyed()) {
        return;
      }
      command(contents);
    });
  }
}

async function serveAppFile(request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.hostname !== "app") {
    return new Response("Not found", { status: 404 });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    return new Response("Invalid path", { status: 400 });
  }

  const filePath = path.resolve(webRoot, pathname === "/" ? "index.html" : pathname.slice(1));
  if (filePath !== webRoot && !filePath.startsWith(`${webRoot}${path.sep}`)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const file = await fs.promises.readFile(filePath);
    return new Response(request.method === "HEAD" ? null : file, {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Length": String(file.length),
        "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return new Response("Not found", { status: 404 });
    }
    console.error(`Could not read bundled Knoledge Search file "${filePath}":`, error);
    return new Response("The bundled app file could not be read.", { status: 500 });
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 360,
    minHeight: 560,
    title: "Knoledge Search",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    ...(process.platform === "win32"
      ? { icon: path.join(process.resourcesPath, "PWA", "icons", "icon-512.png") }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  mainWindow = window;
  registerBrowserCommands();

  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    if (params.src && params.src !== "about:blank" && !parseWebUrl(params.src)) {
      event.preventDefault();
      return;
    }

    params.partition = "persist:knoledge-browser";
    params.allowpopups = true;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
  });

  window.webContents.on("did-attach-webview", (_event, contents) => {
    browserGuests.set(contents.id, contents);
    contents.on("will-navigate", (event, url) => {
      if (!parseWebUrl(url)) {
        event.preventDefault();
      }
    });
    contents.on("will-redirect", (event, url) => {
      if (!parseWebUrl(url)) {
        event.preventDefault();
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      const target = parseWebUrl(url);
      if (target && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("browser:new-tab", target.href);
      }
      return { action: "deny" };
    });
    contents.on("did-navigate", () => sendGuestNavigation(contents));
    contents.on("did-navigate-in-page", () => sendGuestNavigation(contents));
    contents.on("page-title-updated", () => sendGuestNavigation(contents));
    contents.on("did-finish-load", () => sendGuestNavigation(contents));
    contents.once("destroyed", () => browserGuests.delete(contents.id));
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === "http:" || target.protocol === "https:" || target.protocol === "mailto:") {
        shell.openExternal(target.href);
      }
    } catch (error) {
      console.error("Could not open the requested external link:", error);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    if (target.protocol === "knoledge:" && target.hostname === "app") {
      return;
    }
    event.preventDefault();
    try {
      if (target.protocol === "http:" || target.protocol === "https:") {
        shell.openExternal(target.href);
      }
    } catch (error) {
      console.error("Could not open the requested website:", error);
    }
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) {
      return;
    }
    console.error(`Knoledge Search failed to load "${validatedURL}": ${errorDescription} (${errorCode})`);
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
    for (const [id, contents] of browserGuests) {
      if (contents.isDestroyed()) {
        browserGuests.delete(id);
      }
    }
  });

  loadAppPage(window);
}

async function loadAppPage(window, attempt = 1) {
  const appUrl = "knoledge://app/index.html";
  try {
    let timeout;
    try {
      await Promise.race([
        window.loadURL(appUrl),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("The app page load timed out.")), 5000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error(`Knoledge Search page load attempt ${attempt} failed:`, error);
    if (window.isDestroyed()) {
      return;
    }

    const pageLoaded = await window.webContents
      .executeJavaScript('document.readyState === "complete" && Boolean(document.querySelector("#search-form"))')
      .catch(() => false);
    if (pageLoaded) {
      return;
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      if (!window.isDestroyed()) {
        return loadAppPage(window, attempt + 1);
      }
      return;
    }

    dialog.showErrorBox(
      "Knoledge Search could not start",
      `The bundled website did not load after ${attempt} attempts.\n\n${error.message}\n\nApp files: ${webRoot}`,
    );
  }
}

app.whenReady().then(() => {
  protocol.handle("knoledge", serveAppFile);
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
