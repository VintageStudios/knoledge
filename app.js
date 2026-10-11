const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const clearButton = document.querySelector("#clear-button");
const searchWorkspace = document.querySelector("#search-workspace");
const webWorkspace = document.querySelector("#web-workspace");
const tabList = document.querySelector("#app-tablist");
const webAddressForm = document.querySelector("#web-address-form");
const webAddressInput = document.querySelector("#web-address-input");
const webFrames = document.querySelector("#web-frames");
const webMessage = document.querySelector("#web-message");
const externalLink = document.querySelector("#external-link");
const backToSearchButton = document.querySelector("#back-to-search");
const resultsSection = document.querySelector("#results-section");
const resultsHeading = document.querySelector("#results-heading");
const resultsTitle = document.querySelector("#results-title");
const resultSource = document.querySelector("#result-source");
const resultsContent = document.querySelector("#results-content");
const historySection = document.querySelector("#search-history");
const historyList = document.querySelector("#history-list");
const historyNotice = document.querySelector("#history-notice");
const clearHistoryButton = document.querySelector("#clear-history");
const addressForm = document.querySelector("#address-form");
const addressInput = document.querySelector("#address-input");
const addressError = document.querySelector("#address-error");
const addressStatus = document.querySelector("#address-status");

let activeTabId = "search";
let nextTabId = 1;
let activeSearchController;
let zoomLevel = 1;
const websiteTabs = [];
const historyCookieName = "knoledge_search_history";
const historyStorageKey = "knoledge_search_history";
const historyLimit = 8;
const openTabsStorageKey = "knoledge_search_open_tabs";
const browserSessionStorageKey = "browser_session";
const defaultSearchUrlTemplate = "https://en.wikipedia.org/w/api.php?action=query&list=search&prop=info&inprop=url&utf8=1&format=json&origin=*&srsearch={query}";

function createHomeButton() {
  const nav = document.querySelector(".browser-navigation");
  if (!nav || document.querySelector("#browser-home")) {
    return;
  }

  const button = document.createElement("button");
  button.id = "browser-home";
  button.type = "button";
  button.className = "browser-nav-button browser-home-button";
  button.setAttribute("aria-label", "Go home");
  button.textContent = "⌂";
  button.addEventListener("click", () => {
    createBlankTab({ title: "Home" });
  });

  nav.insertBefore(button, nav.firstChild);
}

function focusAddressBar() {
  const target = webAddressInput || document.querySelector("#web-address-input");
  if (!target) {
    return;
  }

  target.focus();
  target.select();
}

function normalizeWebsiteAddress(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter a website address.");
  }

  if (trimmed === "about:blank") {
    return new URL("about:blank");
  }

  const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a valid website address, such as example.com.");
  }

  if (!["http:", "https:", "about:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only http, https, and about: URLs are allowed.");
  }

  if (url.protocol === "about:" && url.href !== "about:blank") {
    throw new Error("Only about:blank is allowed.");
  }

  return url;
}

function buildConfiguredSearchUrl(query) {
  const template = getBrowserSettings().searchUrlTemplate.trim();
  if (!template.includes("{query}")) {
    throw new Error("Search URL template must contain {query}.");
  }

  let url;
  try {
    url = new URL(template.replaceAll("{query}", encodeURIComponent(query)));
  } catch {
    throw new Error("Enter a valid search URL template.");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Search URL template must use http or https and cannot include credentials.");
  }

  return url;
}

function shouldSearchAddress(value) {
  const trimmed = value.trim();
  if (!trimmed || /^(https?:\/\/|about:blank$)/i.test(trimmed)) {
    return false;
  }

  if (/^localhost(?::\d+)?(?:\/|$)/i.test(trimmed)) {
    return false;
  }

  return /\s/.test(trimmed) || !trimmed.includes(".");
}

function persistTabs() {
  try {
    window.sessionStorage.setItem(
      openTabsStorageKey,
      JSON.stringify({
        activeTabId,
        websiteTabs: websiteTabs.map((tab) => ({
          id: tab.id,
          url: tab.url.href,
          title: tab.title,
        })),
      }),
    );
  } catch (error) {
    console.error("Could not save open Knoledge Search tabs for this session:", error);
  }
}

function saveBrowserSession() {
  try {
    const snapshot = {
      activeTabId,
      tabs: websiteTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url.href,
        favicon: tab.favicon || "",
        pinned: Boolean(tab.pinned),
        history: Array.isArray(tab.history) ? tab.history.map((entry) => entry.href || String(entry)) : [],
        historyIndex: Number.isInteger(tab.historyIndex) ? tab.historyIndex : 0,
      })),
    };
    window.localStorage.setItem(browserSessionStorageKey, JSON.stringify(snapshot));
  } catch (error) {
    console.error("Could not save browser session:", error);
  }
}

function restoreBrowserSession() {
  try {
    const raw = window.localStorage.getItem(browserSessionStorageKey);
    if (!raw) {
      createBlankTab({ title: "Home" });
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tabs)) {
      createBlankTab({ title: "Home" });
      return;
    }

    if (parsed.tabs.length === 0) {
      createBlankTab({ title: "Home" });
      return;
    }

    for (const item of parsed.tabs) {
      const match = typeof item?.id === "string" ? item.id.match(/^page-(\d+)$/) : null;
      if (match) {
        nextTabId = Math.max(nextTabId, Number(match[1]) + 1);
      }
    }

    const restoredTabIds = new Set();
    for (const item of parsed.tabs) {
      if (!item || typeof item.url !== "string") {
        continue;
      }
      const url = new URL(item.url);
      const id = typeof item.id === "string" && /^page-\d+$/.test(item.id) && !restoredTabIds.has(item.id)
        ? item.id
        : undefined;
      if (id) {
        restoredTabIds.add(id);
      }
      createWebsiteTab(url, {
        id,
        title: typeof item.title === "string" ? item.title : undefined,
        pinned: Boolean(item.pinned),
        favicon: typeof item.favicon === "string" ? item.favicon : undefined,
      });
    }

    if (typeof parsed.activeTabId === "string") {
      const found = websiteTabs.find((tab) => tab.id === parsed.activeTabId);
      if (found) {
        activateTab(found.id);
        return;
      }
    }

    activateTab(websiteTabs[0]?.id ?? "search");
  } catch (error) {
    console.error("Could not restore browser session:", error);
    createBlankTab({ title: "Home" });
  }
}

function getStoredSettings() {
  try {
    const raw = window.localStorage.getItem("knoledge_settings");
    const saved = raw ? JSON.parse(raw) : {};
    return {
      theme: typeof saved.theme === "string" ? saved.theme : "matrix",
      darkMode: Boolean(saved.darkMode) || saved.theme === "matrix" || saved.theme === "dark",
      reduceMotion: Boolean(saved.reduceMotion),
    };
  } catch {
    return {
      theme: "matrix",
      darkMode: true,
      reduceMotion: false,
    };
  }
}

function persistSettings(settings) {
  try {
    window.localStorage.setItem("knoledge_settings", JSON.stringify(settings));
  } catch (error) {
    console.error("Could not save Knoledge settings:", error);
  }
}

function applySettings(settings) {
  const nextSettings = {
    theme: ["light", "dark", "matrix"].includes(settings.theme) ? settings.theme : "matrix",
    darkMode: settings.theme === "matrix" ? true : Boolean(settings.darkMode),
    reduceMotion: Boolean(settings.reduceMotion),
  };

  document.body.dataset.theme = nextSettings.theme;
  document.body.dataset.reduceMotion = String(nextSettings.reduceMotion);
  const toggle = document.querySelector("#settings-dark-mode");
  const motionToggle = document.querySelector("#settings-reduce-motion");
  const themeSelect = document.querySelector("#settings-theme");

  if (toggle) {
    toggle.checked = nextSettings.darkMode;
  }

  if (motionToggle) {
    motionToggle.checked = nextSettings.reduceMotion;
  }

  if (themeSelect) {
    themeSelect.value = nextSettings.theme;
  }

  persistSettings(nextSettings);
}

function getBrowserSettings() {
  const defaults = {
    homepage: "",
    newTabBehavior: "new-tab",
    searchUrlTemplate: defaultSearchUrlTemplate,
    theme: "hyprland",
    reduceMotion: false,
  };

  try {
    const raw = window.localStorage.getItem("browser_settings");
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw);
    return {
      homepage: typeof parsed.homepage === "string" ? parsed.homepage : defaults.homepage,
      newTabBehavior: parsed.newTabBehavior === "homepage" ? "homepage" : defaults.newTabBehavior,
      searchUrlTemplate:
        typeof parsed.searchUrlTemplate === "string" && parsed.searchUrlTemplate.trim()
          ? parsed.searchUrlTemplate === "https://searx.be/search?q={query}"
            ? defaults.searchUrlTemplate
            : parsed.searchUrlTemplate
          : defaults.searchUrlTemplate,
      theme: parsed.theme === "light" ? "light" : defaults.theme,
      reduceMotion: Boolean(parsed.reduceMotion),
    };
  } catch {
    return defaults;
  }
}

function saveBrowserSettings(settings) {
  try {
    window.localStorage.setItem("browser_settings", JSON.stringify(settings));
  } catch (error) {
    console.error("Could not save browser settings:", error);
  }
}

function applyBrowserSettings(settings) {
  const next = {
    ...getBrowserSettings(),
    ...settings,
  };

  next.theme = next.theme === "light" ? "light" : "hyprland";
  document.body.dataset.theme = next.theme;
  document.body.dataset.reduceMotion = String(Boolean(next.reduceMotion));

  const themeSelect = document.querySelector("#settings-theme");
  const reduceMotionToggle = document.querySelector("#settings-reduce-motion");
  const homepageInput = document.querySelector("#settings-homepage");
  const newTabBehaviorSelect = document.querySelector("#settings-new-tab-behavior");
  const searchUrlTemplateInput = document.querySelector("#settings-search-url-template");

  if (themeSelect) themeSelect.value = next.theme;
  if (reduceMotionToggle) reduceMotionToggle.checked = Boolean(next.reduceMotion);
  if (homepageInput) homepageInput.value = next.homepage || "";
  if (newTabBehaviorSelect) newTabBehaviorSelect.value = next.newTabBehavior || "new-tab";
  if (searchUrlTemplateInput) searchUrlTemplateInput.value = next.searchUrlTemplate || defaultSearchUrlTemplate;

  saveBrowserSettings(next);
}

function addSettingsControl() {
  if (document.querySelector(".settings-button")) {
    return;
  }

  const topbar = document.querySelector(".topbar");
  const wrapper = document.createElement("div");
  wrapper.className = "settings-wrap";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "settings-button";
  button.setAttribute("aria-label", "Open settings");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2"></circle>
      <path d="M12 2.7v2.3M12 18.9v2.4M4.93 4.93l1.63 1.63M17.44 17.44l1.63 1.63M2.7 12h2.3M18.9 12h2.4M4.93 19.07l1.63-1.63M17.44 6.56l1.63-1.63"></path>
    </svg>
  `;

  const panel = document.createElement("aside");
  panel.className = "settings-panel";
  panel.hidden = true;

  const header = document.createElement("div");
  header.className = "settings-header";
  const title = document.createElement("h2");
  title.textContent = "Settings";
  header.append(title);

  const form = document.createElement("div");
  form.className = "settings-form";

  const homepageRow = document.createElement("label");
  homepageRow.className = "settings-row";
  homepageRow.innerHTML = '<span>Homepage</span>';
  const homepageInput = document.createElement("input");
  homepageInput.id = "settings-homepage";
  homepageInput.type = "url";
  homepageInput.placeholder = "https://example.com";
  homepageRow.append(homepageInput);

  const behaviorRow = document.createElement("label");
  behaviorRow.className = "settings-row";
  behaviorRow.innerHTML = '<span>New tab behavior</span>';
  const behaviorSelect = document.createElement("select");
  behaviorSelect.id = "settings-new-tab-behavior";
  behaviorSelect.innerHTML = '<option value="new-tab">Show new tab page</option><option value="homepage">Show homepage</option>';
  behaviorRow.append(behaviorSelect);

  const searchUrlTemplateRow = document.createElement("label");
  searchUrlTemplateRow.className = "settings-row";
  searchUrlTemplateRow.innerHTML = '<span>Search JSON URL template</span>';
  const searchUrlTemplateInput = document.createElement("input");
  searchUrlTemplateInput.id = "settings-search-url-template";
  searchUrlTemplateInput.type = "text";
  searchUrlTemplateInput.autocomplete = "off";
  searchUrlTemplateInput.spellcheck = false;
  searchUrlTemplateInput.placeholder = defaultSearchUrlTemplate;
  searchUrlTemplateRow.append(searchUrlTemplateInput);

  const themeRow = document.createElement("label");
  themeRow.className = "settings-row";
  themeRow.innerHTML = '<span>Theme</span>';
  const themeSelect = document.createElement("select");
  themeSelect.id = "settings-theme";
  themeSelect.innerHTML = '<option value="hyprland">Hyprland</option><option value="light">Light</option>';
  themeRow.append(themeSelect);

  const motionRow = document.createElement("label");
  motionRow.className = "settings-row settings-toggle";
  motionRow.innerHTML = '<span>Reduced motion</span>';
  const motionToggle = document.createElement("input");
  motionToggle.id = "settings-reduce-motion";
  motionToggle.type = "checkbox";
  motionRow.append(motionToggle);

  const clearSessionButton = document.createElement("button");
  clearSessionButton.type = "button";
  clearSessionButton.className = "settings-clear-session";
  clearSessionButton.textContent = "Clear session data";
  clearSessionButton.addEventListener("click", () => {
    window.localStorage.removeItem(browserSessionStorageKey);
    websiteTabs.splice(0, websiteTabs.length);
    document.querySelectorAll(".web-frame").forEach((frame) => frame.remove());
    document.querySelectorAll(".browser-home").forEach((node) => node.remove());
    createBlankTab({ title: "Home" });
  });

  form.append(homepageRow, behaviorRow, searchUrlTemplateRow, themeRow, motionRow, clearSessionButton);
  panel.append(header, form);
  wrapper.append(button, panel);

  button.addEventListener("click", () => {
    const nextOpen = panel.hidden;
    panel.hidden = !nextOpen;
    button.setAttribute("aria-expanded", String(nextOpen));
  });

  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target)) {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });

  homepageInput.addEventListener("change", () => {
    applyBrowserSettings({ homepage: homepageInput.value.trim() });
  });

  behaviorSelect.addEventListener("change", () => {
    applyBrowserSettings({ newTabBehavior: behaviorSelect.value });
  });

  searchUrlTemplateInput.addEventListener("change", () => {
    applyBrowserSettings({ searchUrlTemplate: searchUrlTemplateInput.value.trim() });
  });

  themeSelect.addEventListener("change", () => {
    applyBrowserSettings({ theme: themeSelect.value });
  });

  motionToggle.addEventListener("change", () => {
    applyBrowserSettings({ reduceMotion: motionToggle.checked });
  });

  if (topbar) {
    topbar.append(wrapper);
  } else {
    document.body.insertBefore(wrapper, document.body.firstChild);
  }

  applyBrowserSettings(getBrowserSettings());
}

function createHomePanel(tab) {
  const panel = document.createElement("section");
  panel.className = "browser-home";

  const form = document.createElement("form");
  form.className = "browser-home-search";
  form.setAttribute("role", "search");

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Search or type a URL";
  input.setAttribute("aria-label", "Search or type a URL");
  input.addEventListener("focus", () => input.select());
  form.append(input);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      return;
    }

    if (shouldSearchAddress(value)) {
      search(value);
      return;
    }

    try {
      openWebsite(value);
    } catch {
      search(value);
    }
  });

  const recentItems = readSearchHistory().slice(0, 4).map((query) => ({ title: query, url: "" }));
  const bookmarkItems = (() => {
    try {
      const raw = window.localStorage.getItem("browser_bookmarks");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
    } catch {
      return [];
    }
  })();

  const recentRow = document.createElement("div");
  recentRow.className = "browser-home-row";
  const recentHeading = document.createElement("div");
  recentHeading.className = "browser-home-label";
  recentHeading.textContent = "Recent";
  recentRow.append(recentHeading);
  const recentList = document.createElement("div");
  recentList.className = "browser-home-items";
  if (recentItems.length > 0) {
    for (const item of recentItems) {
      const rowButton = document.createElement("button");
      rowButton.type = "button";
      rowButton.className = "browser-home-item";
      rowButton.innerHTML = '<span class="browser-home-favicon">•</span><span class="browser-home-item-text"></span>';
      rowButton.querySelector(".browser-home-item-text").textContent = item.title;
      rowButton.addEventListener("click", () => search(item.title));
      recentList.append(rowButton);
    }
  }
  recentRow.append(recentList);

  const bookmarkRow = document.createElement("div");
  bookmarkRow.className = "browser-home-row";
  const bookmarkHeading = document.createElement("div");
  bookmarkHeading.className = "browser-home-label";
  bookmarkHeading.textContent = "Bookmarks";
  bookmarkRow.append(bookmarkHeading);
  const bookmarkList = document.createElement("div");
  bookmarkList.className = "browser-home-items";
  if (bookmarkItems.length > 0) {
    for (const item of bookmarkItems) {
      const rowButton = document.createElement("button");
      rowButton.type = "button";
      rowButton.className = "browser-home-item";
      rowButton.innerHTML = '<span class="browser-home-favicon">•</span><span class="browser-home-item-text"></span>';
      rowButton.querySelector(".browser-home-item-text").textContent = item.title || item.url;
      rowButton.addEventListener("click", () => {
        try {
          openWebsite(item.url);
        } catch {
          search(item.title || item.url);
        }
      });
      bookmarkList.append(rowButton);
    }
  } else {
    bookmarkRow.hidden = true;
  }
  bookmarkRow.append(bookmarkList);

  panel.append(form, recentRow, bookmarkRow);
  return panel;
}

function createBlankTab({ id, title = "New tab", pinned = false } = {}) {
  const tab = {
    id: id ?? `page-${nextTabId++}`,
    url: new URL("about:blank"),
    title,
    favicon: "•",
    status: "complete",
    pinned,
    justOpened: true,
    message: "New tab",
    history: [new URL("about:blank")],
    historyIndex: 0,
    controller: new AbortController(),
    frame: document.createElement("iframe"),
    homePanel: null,
  };

  tab.frame.className = "web-frame";
  tab.frame.title = `Website: ${tab.title}`;
  tab.frame.setAttribute("sandbox", "allow-forms allow-scripts allow-popups");
  tab.frame.setAttribute("referrerpolicy", "no-referrer");
  tab.frame.hidden = true;
  tab.frame.src = "about:blank";

  tab.homePanel = createHomePanel(tab);
  webFrames.append(tab.homePanel, tab.frame);
  websiteTabs.push(tab);

  activateTab(tab.id);
  webMessage.hidden = false;
  externalLink.hidden = true;
  if (activeTabId === tab.id) {
    webAddressInput.value = "about:blank";
  }
  updateBrowserNavState(tab);
  return tab;
}

function renderTabs() {
  tabList.replaceChildren();

  const searchTab = document.createElement("div");
  searchTab.className = "app-tab-wrap";
  searchTab.setAttribute("role", "presentation");
  const searchButton = document.createElement("button");
  searchButton.className = `app-tab${activeTabId === "search" ? " is-active" : ""}`;
  searchButton.id = "search-tab";
  searchButton.type = "button";
  searchButton.role = "tab";
  searchButton.setAttribute("aria-selected", String(activeTabId === "search"));
  searchButton.setAttribute("aria-controls", "search-workspace");
  searchButton.tabIndex = activeTabId === "search" ? 0 : -1;
  const searchFavicon = document.createElement("span");
  searchFavicon.className = "tab-favicon search-favicon";
  searchFavicon.setAttribute("aria-hidden", "true");
  searchFavicon.textContent = "K";
  const searchTitle = document.createElement("span");
  searchTitle.className = "tab-title";
  searchTitle.textContent = "Search";
  searchButton.append(searchFavicon, searchTitle);
  searchButton.addEventListener("click", () => activateTab("search"));
  searchTab.append(searchButton);
  tabList.append(searchTab);

  for (const tab of websiteTabs) {
    const wrapper = document.createElement("div");
    wrapper.className = "app-tab-wrap";
    if (tab.justOpened) {
      wrapper.classList.add("tab-open");
      tab.justOpened = false;
    }
    wrapper.dataset.pinned = String(Boolean(tab.pinned));
    wrapper.setAttribute("role", "presentation");

    const button = document.createElement("button");
    button.className = `app-tab${activeTabId === tab.id ? " is-active" : ""}`;
    button.id = `tab-${tab.id}`;
    button.type = "button";
    button.role = "tab";
    button.setAttribute("aria-selected", String(activeTabId === tab.id));
    button.setAttribute("aria-controls", "web-workspace");
    button.tabIndex = activeTabId === tab.id ? 0 : -1;

    const favicon = document.createElement("span");
    favicon.className = "tab-favicon";
    favicon.setAttribute("aria-hidden", "true");
    favicon.textContent = tab.favicon || "•";

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title;

    button.append(favicon, title);
    button.setAttribute("aria-label", tab.title);
    button.title = tab.url.href;
    button.addEventListener("click", () => {
      activateTab(tab.id);
    });
    button.addEventListener("auxclick", (event) => {
      if (event.button !== 1) {
        return;
      }
      event.preventDefault();
      closeTab(tab.id);
    });

    if (!tab.pinned) {
      const closeButton = document.createElement("button");
      closeButton.className = "tab-close";
      closeButton.type = "button";
      closeButton.setAttribute("aria-label", `Close ${tab.title} tab`);
      closeButton.textContent = "×";
      closeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTab(tab.id);
      });
      wrapper.append(button, closeButton);
    } else {
      wrapper.append(button);
    }
    tabList.append(wrapper);
  }

  const newTabButton = document.createElement("button");
  newTabButton.type = "button";
  newTabButton.className = "new-tab-button";
  newTabButton.setAttribute("aria-label", "Open a new tab");
  newTabButton.textContent = "+";
  newTabButton.addEventListener("click", () => createBlankTab());
  tabList.append(newTabButton);
}

function updateBrowserNavState(tab) {
  const canMoveBack = !!tab && tab.historyIndex > 0;
  const canMoveForward = !!tab && tab.historyIndex < tab.history.length - 1;

  if (browserBackButton) {
    browserBackButton.disabled = !canMoveBack;
    browserBackButton.setAttribute("aria-disabled", String(!canMoveBack));
  }

  if (browserForwardButton) {
    browserForwardButton.disabled = !canMoveForward;
    browserForwardButton.setAttribute("aria-disabled", String(!canMoveForward));
  }
}

function activateTab(tabId) {
  activeTabId = tabId;
  const isSearch = tabId === "search";
  searchWorkspace.hidden = !isSearch;
  webWorkspace.hidden = isSearch;

  for (const tab of websiteTabs) {
    const isThisTab = tab.id === tabId;
    tab.frame.hidden = isSearch || !isThisTab || tab.url.href === "about:blank";
    if (tab.homePanel) {
      tab.homePanel.hidden = isSearch || !isThisTab || tab.url.href !== "about:blank";
    }
  }

  applyZoom();

  const tab = websiteTabs.find((entry) => entry.id === tabId);
  if (tab) {
    webAddressInput.value = tab.url.href;
    externalLink.href = tab.url.href;
    externalLink.hidden = tab.url.href === "about:blank";
    webMessage.textContent = tab.message;
    webMessage.hidden = !tab.message;
    webMessage.removeAttribute("data-error");
    updateBrowserNavState(tab);
  } else {
    updateBrowserNavState(null);
  }

  renderTabs();
  persistTabs();
}

function closeTab(tabId) {
  const index = websiteTabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) {
    return;
  }

  const tabButton = tabList.querySelector(`#tab-${tabId}`);
  const wrapper = tabButton?.closest(".app-tab-wrap");
  if (wrapper && document.body.dataset.reduceMotion !== "true") {
    if (wrapper.classList.contains("tab-closing")) {
      return;
    }
    wrapper.classList.add("tab-closing");
    wrapper.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    window.setTimeout(() => removeClosedTab(tabId), 200);
    return;
  }

  removeClosedTab(tabId);
}

function removeClosedTab(tabId) {
  const index = websiteTabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) {
    return;
  }

  const [tab] = websiteTabs.splice(index, 1);
  if (tab.homePanel) {
    tab.homePanel.remove();
  }
  tab.frame.remove();

  if (websiteTabs.length === 0) {
    createBlankTab({ title: "Home" });
    return;
  }

  if (activeTabId === tabId) {
    const nextTab = websiteTabs[Math.min(index, websiteTabs.length - 1)];
    activateTab(nextTab?.id ?? "search");
  } else {
    renderTabs();
    persistTabs();
  }
}

function loadTabContent(tab) {
  tab.frame.src = tab.url.href;
  tab.frame.title = `Website: ${tab.title}`;
  tab.frame.hidden = false;
  tab.message = "";

  if (activeTabId === tab.id) {
    webMessage.textContent = "";
    webMessage.hidden = true;
    externalLink.hidden = false;
    externalLink.href = tab.url.href;
    webAddressInput.value = tab.url.href;
    applyZoom();
  }
  updateBrowserNavState(tab);
}

function applyZoom() {
  const activeTab = websiteTabs.find((tab) => tab.id === activeTabId);
  const frame = activeTab?.frame;
  if (!frame) {
    return;
  }

  if (zoomLevel === 1) {
    frame.style.removeProperty("width");
    frame.style.removeProperty("height");
    frame.style.removeProperty("transform");
    frame.style.removeProperty("transform-origin");
    return;
  }

  frame.style.width = `${100 / zoomLevel}%`;
  frame.style.height = `${100 / zoomLevel}%`;
  frame.style.transform = `scale(${zoomLevel})`;
  frame.style.transformOrigin = "top left";
}

function navigateTabTo(tab, url) {
  tab.controller.abort();
  tab.controller = new AbortController();
  tab.url = url;
  tab.title = url.hostname.replace(/^www\./, "") || "New tab";
  tab.message = "";
  pushTabHistory(tab, url);
  tab.frame.src = "about:blank";
  tab.frame.removeAttribute("srcdoc");
  tab.frame.setAttribute("sandbox", "allow-forms allow-scripts allow-popups");
  tab.frame.hidden = true;
  renderTabs();
  activateTab(tab.id);
  loadTabContent(tab);
}

function createWebsiteTab(url, { id, title, pinned = false, favicon } = {}) {
  const hostname = url.hostname.replace(/^www\./, "");
  const tab = {
    id: id ?? `page-${nextTabId++}`,
    url,
    title: title || hostname,
    favicon: favicon || (hostname.charAt(0) || "•").toUpperCase(),
    status: "loading",
    pinned,
    justOpened: true,
    message: "Loading page…",
    history: [new URL(url.href)],
    historyIndex: 0,
    controller: new AbortController(),
    frame: document.createElement("iframe"),
    homePanel: null,
  };

  tab.frame.className = "web-frame";
  tab.frame.title = `Website: ${tab.title}`;
  tab.frame.setAttribute("sandbox", "allow-forms allow-scripts allow-popups");
  tab.frame.setAttribute("referrerpolicy", "no-referrer");
  tab.frame.hidden = true;
  webFrames.append(tab.frame);
  websiteTabs.push(tab);

  activateTab(tab.id);
  webMessage.hidden = false;
  externalLink.hidden = false;
  updateBrowserNavState(tab);
  loadTabContent(tab);
}

function pushTabHistory(tab, url) {
  const nextUrl = new URL(url.href || url);
  const previous = tab.history[tab.historyIndex];
  if (previous && previous.href === nextUrl.href) {
    return;
  }

  tab.history = tab.history.slice(0, tab.historyIndex + 1);
  tab.history.push(nextUrl);
  tab.historyIndex = tab.history.length - 1;
}

function navigateTab(tab, direction) {
  if (!tab || !Array.isArray(tab.history) || tab.history.length <= 1) {
    return;
  }

  const nextIndex = tab.historyIndex + direction;
  if (nextIndex < 0 || nextIndex >= tab.history.length) {
    return;
  }

  tab.historyIndex = nextIndex;
  const nextUrl = tab.history[nextIndex];
  tab.url = nextUrl;
  tab.controller.abort();
  tab.controller = new AbortController();
  tab.frame.src = "about:blank";
  tab.frame.removeAttribute("srcdoc");
  tab.frame.setAttribute("sandbox", "allow-forms allow-scripts allow-popups");
  tab.frame.hidden = true;
  tab.message = "Loading page…";
  if (activeTabId === tab.id) {
    webMessage.textContent = tab.message;
    webMessage.hidden = false;
    webAddressInput.value = nextUrl.href;
  }
  updateBrowserNavState(tab);
  loadTabContent(tab);
}

function openWebsite(value) {
  let url;
  try {
    url = normalizeWebsiteAddress(value);
  } catch (error) {
    addressError.textContent = error.message;
    addressError.hidden = false;
    addressInput.setAttribute("aria-invalid", "true");
    addressInput.focus();
    return;
  }

  addressError.hidden = true;
  addressInput.removeAttribute("aria-invalid");
  addressInput.value = url.href;
  addressStatus.hidden = true;
  createWebsiteTab(url);
}

function restoreOpenTabs() {
  try {
    const saved = window.sessionStorage.getItem(openTabsStorageKey);
    if (!saved) {
      return;
    }

    const state = JSON.parse(saved);
    if (!Array.isArray(state.websiteTabs)) {
      throw new Error("Saved tab state is not a list.");
    }

    for (const savedTab of state.websiteTabs) {
      if (
        !savedTab ||
        typeof savedTab.url !== "string" ||
        typeof savedTab.id !== "string" ||
        !/^page-\d+$/.test(savedTab.id)
      ) {
        continue;
      }

      try {
        const url = normalizeWebsiteAddress(savedTab.url);
        const idNumber = Number(savedTab.id.slice("page-".length));
        nextTabId = Math.max(nextTabId, idNumber + 1);
        createWebsiteTab(url, {
          id: savedTab.id,
          title: typeof savedTab.title === "string" ? savedTab.title : undefined,
        });
      } catch (error) {
        console.error("Could not restore an open Knoledge Search tab:", error);
      }
    }

    if (typeof state.activeTabId === "string" && state.activeTabId !== "search") {
      if (websiteTabs.some((tab) => tab.id === state.activeTabId)) {
        activateTab(state.activeTabId);
      }
    } else {
      activateTab("search");
    }
  } catch (error) {
    console.error("Could not restore open Knoledge Search tabs:", error);
  }
}

function normalizeSearchQuery(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isSameSearchQuery(first, second) {
  return normalizeSearchQuery(first).toLocaleLowerCase() === normalizeSearchQuery(second).toLocaleLowerCase();
}

function usesLocalSearchHistoryStorage() {
  return ["file:", "knoledge:"].includes(window.location.protocol);
}

function readSearchHistory() {
  try {
    if (usesLocalSearchHistoryStorage()) {
      return parseSearchHistory(window.localStorage.getItem(historyStorageKey));
    }

    const cookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${historyCookieName}=`));

    if (!cookie) {
      return [];
    }

    const value = decodeURIComponent(cookie.slice(historyCookieName.length + 1));
    return parseSearchHistory(value);
  } catch (error) {
    console.error("Could not read Knoledge Search history:", error);
    return [];
  }
}

function parseSearchHistory(value) {
  if (!value) {
    return [];
  }

  const history = JSON.parse(value);
  if (!Array.isArray(history)) {
    throw new Error("Search history is not a list.");
  }

  return history
    .filter((query) => typeof query === "string")
    .map((query) => normalizeSearchQuery(query).slice(0, 200))
    .filter((query) => query.length > 0)
    .filter((query, index, all) => all.findIndex((candidate) => isSameSearchQuery(candidate, query)) === index)
    .slice(0, historyLimit);
}

function writeSearchHistory(history) {
  try {
    if (usesLocalSearchHistoryStorage()) {
      window.localStorage.setItem(historyStorageKey, JSON.stringify(history));
      return readSearchHistory().join("\n") === history.join("\n");
    }

    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    const cookieValue = encodeURIComponent(JSON.stringify(history));
    document.cookie =
      `${historyCookieName}=${cookieValue}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`;
    return readSearchHistory().join("\n") === history.join("\n");
  } catch (error) {
    console.error("Could not save Knoledge Search history:", error);
    return false;
  }
}

function renderSearchHistory(message = "") {
  const history = readSearchHistory();
  historyList.replaceChildren();

  for (const query of history) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "history-query";
    button.type = "button";
    button.textContent = query;
    button.addEventListener("click", () => search(query));
    item.append(button);
    historyList.append(item);
  }

  historySection.hidden = history.length === 0 && !message;
  clearHistoryButton.hidden = history.length === 0;
  historyNotice.textContent = message;
  historyNotice.hidden = !message;
}

function rememberSearch(query) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return;
  }

  const history = readSearchHistory().filter((item) => !isSameSearchQuery(item, normalizedQuery));
  history.unshift(normalizedQuery.slice(0, 200));
  const saved = writeSearchHistory(history.slice(0, historyLimit));
  renderSearchHistory(
    saved ? "" : "Search works, but this browser or app did not allow this search to be saved.",
  );
}

function setInputState() {
  clearButton.hidden = input.value.length === 0;
}

function safeSearchResultUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSearchPayload(payload) {
  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  const wikipediaResults = Array.isArray(payload?.query?.search) ? payload.query.search : [];
  return wikipediaResults.map((entry) => {
    const title = typeof entry?.title === "string" ? entry.title.trim() : "";
    const articleUrl = title
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`
      : undefined;

    return {
      title,
      url: typeof entry?.fullurl === "string" && entry.fullurl ? entry.fullurl : articleUrl,
      content: stripHtml(entry?.snippet || ""),
      engine: "Wikipedia",
    };
  });
}

function createSearchResultCard(result) {
  const url = safeSearchResultUrl(result?.url);
  if (!url || typeof result.title !== "string" || !result.title.trim()) {
    return null;
  }

  const card = document.createElement("article");
  card.className = "result-card";

  const title = document.createElement("a");
  title.className = "result-title";
  title.href = url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  title.textContent = result.title;
  card.append(title);

  const descriptionText = typeof result.content === "string" ? result.content.trim() : "";
  if (descriptionText) {
    const description = document.createElement("p");
    description.className = "result-description";
    description.textContent = descriptionText;
    card.append(description);
  }

  if (typeof result.engine === "string" && result.engine.trim()) {
    const source = document.createElement("p");
    source.className = "result-meta";
    source.textContent = result.engine;
    card.append(source);
  }

  return card;
}

function showSearchState(message, type = "info") {
  const state = document.createElement("p");
  state.className = `search-state${type === "error" ? " is-error" : ""}`;
  state.textContent = message;
  resultsContent.replaceChildren(state);
}

async function search(query, { updateHistory = true } = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    input.focus();
    return;
  }

  input.value = normalizedQuery;
  setInputState();
  addressError.hidden = true;

  let searchUrl;
  try {
    searchUrl = buildConfiguredSearchUrl(normalizedQuery);
  } catch (error) {
    addressError.textContent = error.message;
    addressError.hidden = false;
    return;
  }

  activeSearchController?.abort();
  const controller = new AbortController();
  activeSearchController = controller;

  if (updateHistory) {
    const currentQuery = new URLSearchParams(window.location.search).get("q");
    if (currentQuery !== normalizedQuery) {
      const url = new URL(window.location.href);
      url.searchParams.set("q", normalizedQuery);
      window.history.pushState({ query: normalizedQuery }, "", url);
    }
  }
  rememberSearch(normalizedQuery);

  activateTab("search");
  resultsSection.hidden = false;
  resultsHeading.hidden = false;
  resultsSection.setAttribute("aria-busy", "true");
  resultsTitle.textContent = `Results for “${normalizedQuery}”`;
  resultSource.textContent = searchUrl.host;
  showSearchState("Searching configured JSON endpoint…");

  try {
    const response = await fetch(searchUrl.href, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Search endpoint returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const normalizedResults = normalizeSearchPayload(payload);
    if (!Array.isArray(normalizedResults) || normalizedResults.length === 0) {
      throw new Error("Search endpoint did not return any results.");
    }

    if (controller.signal.aborted) {
      return;
    }

    const cards = normalizedResults
      .map(createSearchResultCard)
      .filter(Boolean)
      .slice(0, 30);
    if (cards.length === 0) {
      showSearchState("No results found.");
      resultSource.textContent = "";
      return;
    }

    resultsContent.replaceChildren(...cards);
    resultSource.textContent = `${cards.length} results · ${searchUrl.host}`;
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    const message = error instanceof TypeError
      ? "Could not reach the JSON endpoint. Check its URL and CORS settings."
      : error instanceof SyntaxError
        ? "Search endpoint did not return JSON. Enable JSON output in its settings."
        : error.message;
    showSearchState(message, "error");
    resultSource.textContent = searchUrl.host;
  } finally {
    if (activeSearchController === controller) {
      resultsSection.setAttribute("aria-busy", "false");
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) {
    input.focus();
  } else if (shouldSearchAddress(value)) {
    search(value);
  } else {
    openWebsite(value);
  }
});

input.addEventListener("input", setInputState);

clearButton.addEventListener("click", () => {
  input.value = "";
  setInputState();
  input.focus();
});

addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (shouldSearchAddress(addressInput.value)) {
    search(addressInput.value);
  } else {
    openWebsite(addressInput.value);
  }
});

backToSearchButton.addEventListener("click", () => {
  activateTab("search");
});

webAddressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (shouldSearchAddress(webAddressInput.value)) {
    search(webAddressInput.value);
    return;
  }

  const activeTab = websiteTabs.find((tab) => tab.id === activeTabId);
  if (!activeTab) {
    activateTab("search");
    return;
  }

  let updatedUrl;
  try {
    updatedUrl = normalizeWebsiteAddress(webAddressInput.value);
  } catch (error) {
    webMessage.textContent = error.message;
    webMessage.dataset.error = "true";
    return;
  }

  navigateTabTo(activeTab, updatedUrl);
});

const browserBackButton = document.querySelector("#browser-back");
const browserForwardButton = document.querySelector("#browser-forward");
const browserRefreshButton = document.querySelector("#browser-refresh");

browserBackButton.addEventListener("click", () => {
  const activeTab = websiteTabs.find((tab) => tab.id === activeTabId);
  if (activeTab) {
    navigateTab(activeTab, -1);
  }
});

browserForwardButton.addEventListener("click", () => {
  const activeTab = websiteTabs.find((tab) => tab.id === activeTabId);
  if (activeTab) {
    navigateTab(activeTab, 1);
  }
});

browserRefreshButton.addEventListener("click", () => {
  const activeTab = websiteTabs.find((tab) => tab.id === activeTabId);
  if (!activeTab) {
    return;
  }

  activeTab.controller.abort();
  activeTab.controller = new AbortController();
  activeTab.frame.src = "about:blank";
  activeTab.frame.removeAttribute("srcdoc");
  activeTab.frame.hidden = true;
  updateBrowserNavState(activeTab);
  loadTabContent(activeTab);
});

clearHistoryButton.addEventListener("click", () => {
  try {
    if (usesLocalSearchHistoryStorage()) {
      window.localStorage.removeItem(historyStorageKey);
    } else {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${historyCookieName}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    }
    const cleared = readSearchHistory().length === 0;
    renderSearchHistory(
      cleared ? "" : "Your browser did not allow the saved search history to be cleared.",
    );
  } catch (error) {
    console.error("Could not clear Knoledge Search history:", error);
    renderSearchHistory("Could not clear search history from this browser.");
  }
});

document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey)) {
    return;
  }

  const key = event.key.toLowerCase();
  const isTypingTarget = event.target instanceof HTMLElement && (event.target.matches("input, textarea") || event.target.isContentEditable);

  if (key === "=" || key === "+") {
    event.preventDefault();
    zoomLevel = Math.min(Math.round((zoomLevel + 0.1) * 10) / 10, 3);
    applyZoom();
    return;
  }

  if (key === "-") {
    event.preventDefault();
    zoomLevel = Math.max(Math.round((zoomLevel - 0.1) * 10) / 10, 0.5);
    applyZoom();
    return;
  }

  if (key === "0") {
    event.preventDefault();
    zoomLevel = 1;
    applyZoom();
    return;
  }

  if (key === "t") {
    event.preventDefault();
    createBlankTab();
    return;
  }

  if (key === "l" || key === "d") {
    event.preventDefault();
    focusAddressBar();
    return;
  }

  if (key === "w" && !isTypingTarget) {
    event.preventDefault();
    if (activeTabId !== "search") {
      closeTab(activeTabId);
    }
    return;
  }

  if (key === "tab") {
    event.preventDefault();
    if (websiteTabs.length === 0) {
      return;
    }

    const currentIndex = websiteTabs.findIndex((tab) => tab.id === activeTabId);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? websiteTabs.length - 1 : currentIndex - 1)
      : (currentIndex === -1 || currentIndex === websiteTabs.length - 1 ? 0 : currentIndex + 1);
    activateTab(websiteTabs[nextIndex]?.id ?? "search");
  }
});

window.addEventListener("popstate", () => {
  const query = new URLSearchParams(window.location.search).get("q");
  if (query) {
    search(query, { updateHistory: false });
  } else {
    input.value = "";
    setInputState();
    activeSearchController?.abort();
    resultsSection.hidden = true;
    resultsContent.replaceChildren();
  }
});

window.addEventListener("beforeunload", saveBrowserSession);

setInputState();
createHomeButton();
addSettingsControl();
renderSearchHistory();
renderTabs();
restoreBrowserSession();
if (websiteTabs.length === 0) {
  createBlankTab({ title: "Home" });
}
const initialQuery = new URLSearchParams(window.location.search).get("q");
if (initialQuery) {
  search(initialQuery, { updateHistory: false });
}
