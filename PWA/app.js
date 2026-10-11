const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const clearButton = document.querySelector("#clear-button");
const searchWorkspace = document.querySelector("#search-workspace");
const webWorkspace = document.querySelector("#web-workspace");
const tabList = document.querySelector("#app-tablist");
const webAddressForm = document.querySelector("#web-address-form");
const webAddressInput = document.querySelector("#web-address-input");
const webFrames = document.querySelector("#web-frames");
const webNavigation = document.querySelector(".web-navigation");
const webBackButton = document.querySelector("#web-back");
const webForwardButton = document.querySelector("#web-forward");
const webReloadButton = document.querySelector("#web-reload");
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
const desktopBrowser = window.knoledgeDesktop;
const isDesktopApp = desktopBrowser?.isDesktop === true;

let activeSearch;
let activeTabId = "search";
let nextTabId = 1;
const websiteTabs = [];
const historyCookieName = "knoledge_search_history";
const historyStorageKey = "knoledge_search_history";
const historyLimit = 8;
const openTabsStorageKey = "knoledge_search_open_tabs";

function normalizeWebsiteAddress(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter a website address.");
  }

  const hasProtocol =
    /^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^[a-z\d.-]+:\d+(?:\/|$)/i.test(trimmed);
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a valid website address, such as example.com.");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only public HTTP and HTTPS website addresses are supported.");
  }

  return url;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function webContentsId(tab) {
  if (!isDesktopApp || tab?.frame.tagName !== "WEBVIEW") {
    return undefined;
  }

  try {
    return tab.frame.getWebContentsId();
  } catch {
    return undefined;
  }
}

function updateWebNavigation(tab) {
  const enabled = isDesktopApp && Boolean(tab && webContentsId(tab) !== undefined);
  webBackButton.disabled = !enabled || !tab.canGoBack;
  webForwardButton.disabled = !enabled || !tab.canGoForward;
  webReloadButton.disabled = !enabled;
}

function sizeDesktopWebview(frame) {
  const guestFrame = frame.shadowRoot?.querySelector("iframe");
  if (!guestFrame) {
    console.error("Could not size the Electron website view: its internal frame is unavailable.");
    return;
  }

  // Electron's internal webview iframe otherwise keeps its default 150px height.
  guestFrame.style.height = "100%";
}

function updateGuestNavigation(state) {
  if (!state || !Number.isSafeInteger(state.webContentsId) || typeof state.url !== "string") {
    return;
  }

  const tab = websiteTabs.find((entry) => webContentsId(entry) === state.webContentsId);
  if (!tab) {
    return;
  }

  try {
    tab.url = normalizeWebsiteAddress(state.url);
  } catch (error) {
    console.error("Could not update the address of an opened website tab:", error);
    return;
  }

  if (typeof state.title === "string" && state.title.trim()) {
    tab.title = state.title.trim().slice(0, 160);
  }
  tab.canGoBack = state.canGoBack === true;
  tab.canGoForward = state.canGoForward === true;

  if (activeTabId === tab.id) {
    webAddressInput.value = tab.url.href;
    externalLink.href = tab.url.href;
    webMessage.hidden = true;
    updateWebNavigation(tab);
  }

  renderTabs();
  persistTabs();
}

function createWikipediaReaderDocument(html, pageUrl) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const article = parsed.querySelector(".mw-parser-output") ?? parsed.body;
  const content = article.cloneNode(true);

  content
    .querySelectorAll("script, style, iframe, object, embed, form, input, button, svg, math, template")
    .forEach((element) => element.remove());

  for (const element of [content, ...content.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      if (
        /^on/i.test(attribute.name) ||
        ["style", "srcdoc", "formaction", "action"].includes(attribute.name.toLowerCase())
      ) {
        element.removeAttribute(attribute.name);
      }
    }

    for (const name of ["href", "xlink:href"]) {
      if (!element.hasAttribute(name)) {
        continue;
      }

      try {
        const target = new URL(element.getAttribute(name), pageUrl);
        if (!["http:", "https:"].includes(target.protocol)) {
          throw new Error("Unsupported article link protocol.");
        }
        element.setAttribute(name, target.href);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      } catch {
        element.removeAttribute(name);
      }
    }

    for (const name of ["src", "data-src"]) {
      if (!element.hasAttribute(name)) {
        continue;
      }

      try {
        const source = new URL(element.getAttribute(name), pageUrl);
        if (source.protocol !== "https:" || source.hostname !== "upload.wikimedia.org") {
          throw new Error("Unsupported article image source.");
        }
        element.setAttribute("src", source.href);
      } catch {
        element.removeAttribute("src");
      }
      element.removeAttribute("data-src");
    }

    element.removeAttribute("srcset");
  }

  const title = parsed.querySelector("title")?.textContent?.trim() || "Wikipedia article";
  const styles = `
    :root { color-scheme: light; }
    body { max-width: 850px; margin: 0 auto; padding: 32px clamp(18px, 5vw, 52px) 70px;
      color: #202124; background: white; font: 16px/1.7 Arial, Helvetica, sans-serif; }
    h1, h2, h3 { line-height: 1.3; color: #202124; }
    h1 { padding-bottom: 12px; border-bottom: 1px solid #dadce0; font-size: 32px; }
    h2 { margin-top: 30px; padding-bottom: 6px; border-bottom: 1px solid #e8eaed; font-size: 23px; }
    h3 { margin-top: 24px; font-size: 19px; }
    a { color: #1a0dab; text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; height: auto; }
    figure { margin: 16px 0; }
    figcaption, .reference, .mw-editsection, .noprint { color: #5f6368; font-size: 13px; }
    table { max-width: 100%; border-collapse: collapse; }
    th, td { padding: 7px; border: 1px solid #dadce0; }
    .infobox { float: right; width: min(38%, 320px); margin: 0 0 18px 22px; padding: 10px;
      border: 1px solid #dadce0; background: #f8f9fa; font-size: 13px; }
    .infobox img { display: block; margin: 8px auto; }
    .mw-references-wrap, .reflist { font-size: 13px; }
    @media (max-width: 600px) { body { padding: 22px 18px 48px; font-size: 15px; }
      h1 { font-size: 27px; } .infobox { float: none; width: 100%; margin: 16px 0; } }
  `;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body>${content.outerHTML}</body></html>`;
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
    favicon.textContent = tab.isWikipedia ? "W" : "●";

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title;

    const closeButton = document.createElement("button");
    closeButton.className = "tab-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", `Close ${tab.title} tab`);
    closeButton.textContent = "×";

    button.append(favicon, title);
    button.setAttribute("aria-label", tab.title);
    button.title = tab.url.href;
    button.addEventListener("click", () => {
      activateTab(tab.id);
    });
    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });
    wrapper.append(button, closeButton);
    tabList.append(wrapper);
  }
}

function activateTab(tabId) {
  activeTabId = tabId;
  const isSearch = tabId === "search";
  searchWorkspace.hidden = !isSearch;
  webWorkspace.hidden = isSearch;

  for (const tab of websiteTabs) {
    tab.frame.hidden = isSearch || tab.id !== tabId;
  }

  const tab = websiteTabs.find((entry) => entry.id === tabId);
  if (tab) {
    webAddressInput.value = tab.url.href;
    externalLink.href = tab.url.href;
    externalLink.hidden = false;
    webMessage.textContent = tab.message;
    webMessage.hidden = !tab.message;
    webMessage.removeAttribute("data-error");
    updateWebNavigation(tab);
  } else {
    updateWebNavigation(undefined);
  }

  renderTabs();
  persistTabs();
}

function closeTab(tabId) {
  const index = websiteTabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) {
    return;
  }

  const [tab] = websiteTabs.splice(index, 1);
  tab.controller.abort();
  tab.frame.remove();

  if (activeTabId === tabId) {
    const nextTab = websiteTabs[Math.min(index, websiteTabs.length - 1)];
    activateTab(nextTab?.id ?? "search");
  } else {
    renderTabs();
    persistTabs();
  }
}

async function loadTabContent(tab) {
  if (isDesktopApp) {
    tab.frame.src = tab.url.href;
    tab.frame.hidden = false;
    tab.message = "Loading website…";
    if (activeTabId === tab.id) {
      webMessage.textContent = tab.message;
      webMessage.hidden = false;
    }
    return;
  }

  const language = tab.url.hostname.match(/^([a-z-]+)\.wikipedia\.org$/)?.[1];
  let pageTitle = "";
  if (tab.url.pathname.startsWith("/wiki/")) {
    try {
      pageTitle = decodeURIComponent(tab.url.pathname.slice("/wiki/".length)).replaceAll("_", " ");
    } catch {
      pageTitle = "";
    }
  }
  const isWikipediaArticle =
    language && pageTitle && !pageTitle.startsWith("Special:") && !pageTitle.startsWith("File:");

  if (!isWikipediaArticle) {
    tab.frame.src = tab.url.href;
    tab.frame.hidden = false;
    tab.message =
      "This web version opens sites in an embedded frame. Some websites block that, so pages may be blank or incomplete. Open the site in a new browser tab, or use the desktop app for broader support. To browse websites properly, download the desktop app from the Download menu.";
    if (activeTabId === tab.id) {
      webMessage.textContent = tab.message;
      webMessage.hidden = false;
      externalLink.href = tab.url.href;
    }
    return;
  }

  try {
    const endpoint = new URL(
      `https://${language}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(pageTitle.replaceAll(" ", "_"))}`,
    );
    const response = await fetch(endpoint, { headers: { Accept: "text/html" }, signal: tab.controller.signal });
    if (!response.ok) {
      throw new Error(`Wikipedia article request failed (${response.status}).`);
    }

    tab.frame.setAttribute("sandbox", "allow-same-origin allow-popups");
    tab.frame.srcdoc = createWikipediaReaderDocument(await response.text(), tab.url.href);
    tab.frame.title = `Wikipedia article: ${pageTitle}`;
    tab.frame.hidden = false;
    tab.title = pageTitle;
    tab.isWikipedia = true;
    tab.message = "Wikipedia reader view. Links inside the article open in a new browser tab.";
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error("Could not load Wikipedia reader view:", error);
    tab.frame.setAttribute("sandbox", "allow-forms allow-scripts allow-popups");
    tab.frame.src = tab.url.href;
    tab.frame.hidden = false;
    tab.isWikipedia = false;
    tab.message =
      "The Wikipedia reader could not be loaded. Open the article in this browser tab, then use Back to return to Knoledge Search.";
  }

  if (activeTabId === tab.id) {
    webMessage.textContent = tab.message;
    webMessage.hidden = !tab.message;
    externalLink.hidden = false;
    externalLink.href = tab.url.href;
    renderTabs();
  }
}

function createWebsiteTab(url, { id, title } = {}) {
  const hostname = url.hostname.replace(/^www\./, "");
  const frame = document.createElement(isDesktopApp ? "webview" : "iframe");
  const tab = {
    id: id ?? `page-${nextTabId++}`,
    url,
    title: title || hostname,
    isWikipedia: false,
    message: "Loading page…",
    controller: new AbortController(),
    frame,
    canGoBack: false,
    canGoForward: false,
  };

  tab.frame.className = "web-frame";
  tab.frame.title = `Website: ${tab.title}`;
  if (isDesktopApp) {
    tab.frame.setAttribute("partition", "persist:knoledge-browser");
    tab.frame.setAttribute("allowpopups", "");
    tab.frame.addEventListener("dom-ready", () => updateWebNavigation(tab), { once: true });
  } else {
    tab.frame.setAttribute("sandbox", "allow-forms allow-scripts allow-popups");
    tab.frame.setAttribute("referrerpolicy", "no-referrer");
  }
  tab.frame.hidden = true;
  webFrames.append(tab.frame);
  if (isDesktopApp) {
    sizeDesktopWebview(tab.frame);
  }
  websiteTabs.push(tab);

  activateTab(tab.id);
  webMessage.hidden = false;
  externalLink.hidden = false;
  loadTabContent(tab);
}

function openWebsite(value, { resultTitle = "" } = {}) {
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
  createWebsiteTab(url, { title: resultTitle });
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

function readSearchHistory() {
  try {
    if (window.location.protocol === "knoledge:") {
      const stored = window.localStorage.getItem(historyStorageKey);
      return parseSearchHistory(stored);
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
    .filter((query) => typeof query === "string" && query.trim().length > 0)
    .map((query) => query.trim().slice(0, 200))
    .slice(0, historyLimit);
}

function writeSearchHistory(history) {
  try {
    if (window.location.protocol === "knoledge:") {
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
  const history = readSearchHistory().filter((item) => item.toLocaleLowerCase() !== query.toLocaleLowerCase());
  history.unshift(query.slice(0, 200));
  const saved = writeSearchHistory(history.slice(0, historyLimit));
  renderSearchHistory(
    saved ? "" : "Search works, but this browser or app did not allow this search to be saved.",
  );
}

function setInputState() {
  clearButton.hidden = input.value.length === 0;
}

function showState(title, message, type = "info") {
  const card = document.createElement("div");
  card.className = "state-card";

  if (type === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    card.append(spinner);
  } else {
    const symbol = document.createElement("span");
    symbol.className = `state-symbol${type === "error" ? " error" : ""}`;
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = type === "error" ? "!" : "✳";
    card.append(symbol);
  }

  const copy = document.createElement("p");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("span");
  detail.textContent = message;
  copy.append(heading, detail);
  card.append(copy);
  resultsContent.replaceChildren(card);
}

function appendHighlightedText(element, text, query) {
  const terms = [...new Set(query.split(/\s+/).filter((term) => term.length > 1))]
    .sort((first, second) => second.length - first.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (terms.length === 0) {
    element.textContent = text;
    return;
  }

  const matcher = new RegExp(`(${terms.join("|")})`, "gi");
  let position = 0;
  for (const match of text.matchAll(matcher)) {
    const start = match.index;
    element.append(document.createTextNode(text.slice(position, start)));
    const highlight = document.createElement("mark");
    highlight.textContent = match[0];
    element.append(highlight);
    position = start + match[0].length;
  }
  element.append(document.createTextNode(text.slice(position)));
}

function createResultCard(result, query) {
  const card = document.createElement("article");
  card.className = "result-card";

  const meta = document.createElement("div");
  meta.className = "result-meta";
  const mark = document.createElement("span");
  mark.className = `wiki-mark${result.source === "Wikipedia" ? "" : " source-mark"}`;
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = result.source.slice(0, 1);
  const source = document.createElement("span");
  source.textContent = result.source;
  meta.append(mark, source);

  const title = result.source === "Wikipedia" || result.url
    ? document.createElement("a")
    : document.createElement("span");
  title.className = "result-title";
  if (title instanceof HTMLAnchorElement) {
    title.href =
      result.url ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replaceAll(" ", "_"))}`;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
  }
  appendHighlightedText(title, result.title, query);
  if (result.source === "Wikipedia" && title instanceof HTMLAnchorElement) {
    title.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      openWebsite(title.href, { resultTitle: result.title });
    });
  }

  card.append(meta, title);

  if (result.description) {
    const description = document.createElement("p");
    description.className = "result-description";
    appendHighlightedText(description, result.description, query);
    card.append(description);
  }

  if (result.excerpt) {
    const excerpt = document.createElement("p");
    excerpt.className = "result-excerpt";
    const plainExcerpt = new DOMParser().parseFromString(result.excerpt, "text/html").body.textContent;
    appendHighlightedText(excerpt, plainExcerpt, query);
    card.append(excerpt);
  }

  return card;
}

function appendResultGroup(container, label, results, query) {
  if (results.length === 0) {
    return 0;
  }

  const group = document.createElement("section");
  group.className = "source-group";
  const heading = document.createElement("h3");
  heading.className = "source-heading";
  heading.textContent = label;
  const list = document.createElement("div");
  list.className = "result-list";
  list.setAttribute("aria-label", `${label} results`);
  list.append(...results.map((result) => createResultCard(result, query)));
  group.append(heading, list);
  container.append(group);
  return results.length;
}

function flattenDuckDuckGoTopics(topics, results = []) {
  for (const topic of topics) {
    if (topic.Topics) {
      flattenDuckDuckGoTopics(topic.Topics, results);
    } else if (topic.Text && topic.FirstURL && results.length < 6) {
      let url;
      try {
        url = new URL(topic.FirstURL);
      } catch {
        continue;
      }
      if (["http:", "https:"].includes(url.protocol)) {
        results.push({
          source: "DuckDuckGo",
          title: topic.Text.split(" - ")[0],
          description: topic.Text,
          url: url.href,
        });
      }
    }
  }
  return results;
}

function safeResultUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Search request failed (${response.status}).`);
  }
  return response.json();
}

async function search(query, { updateHistory = true, scroll = true, activate = true } = {}) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    input.focus();
    return;
  }

  if (activate) {
    activateTab("search");
  }
  input.value = normalizedQuery;
  setInputState();
  resultsHeading.hidden = false;
  resultsTitle.textContent = `Results for “${normalizedQuery}”`;
  resultSource.textContent = "";
  resultsSection.setAttribute("aria-busy", "true");
  showState(
    "Looking for a good place to start…",
    "Searching Wikipedia, DuckDuckGo, and Wikidata.",
    "loading",
  );

  if (updateHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set("q", normalizedQuery);
    window.history.pushState({ query: normalizedQuery }, "", url);
  }
  rememberSearch(normalizedQuery);

  if (scroll) {
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  activeSearch?.abort();
  const controller = new AbortController();
  activeSearch = controller;

  try {
    const wikipediaUrl = new URL("https://en.wikipedia.org/w/api.php");
    wikipediaUrl.searchParams.set("action", "query");
    wikipediaUrl.searchParams.set("list", "search");
    wikipediaUrl.searchParams.set("utf8", "1");
    wikipediaUrl.searchParams.set("format", "json");
    wikipediaUrl.searchParams.set("origin", "*");
    wikipediaUrl.searchParams.set("srsearch", normalizedQuery);
    wikipediaUrl.searchParams.set("srlimit", "8");

    const duckDuckGoUrl = new URL("https://api.duckduckgo.com/");
    duckDuckGoUrl.searchParams.set("q", normalizedQuery);
    duckDuckGoUrl.searchParams.set("format", "json");
    duckDuckGoUrl.searchParams.set("no_redirect", "1");
    duckDuckGoUrl.searchParams.set("no_html", "1");
    duckDuckGoUrl.searchParams.set("skip_disambig", "1");

    const wikidataUrl = new URL("https://www.wikidata.org/w/api.php");
    wikidataUrl.searchParams.set("action", "wbsearchentities");
    wikidataUrl.searchParams.set("search", normalizedQuery);
    wikidataUrl.searchParams.set("language", "en");
    wikidataUrl.searchParams.set("uselang", "en");
    wikidataUrl.searchParams.set("type", "item");
    wikidataUrl.searchParams.set("limit", "5");
    wikidataUrl.searchParams.set("format", "json");
    wikidataUrl.searchParams.set("origin", "*");

    const sources = await Promise.allSettled([
      fetchJson(wikipediaUrl, controller.signal),
      fetchJson(duckDuckGoUrl, controller.signal),
      fetchJson(wikidataUrl, controller.signal),
    ]);
    if (controller.signal.aborted) {
      return;
    }

    const [wikipedia, duckDuckGo, wikidata] = sources;
    const sourceErrors = [];
    const pages =
      wikipedia.status === "fulfilled" && Array.isArray(wikipedia.value?.query?.search)
        ? wikipedia.value.query.search.map((page) => ({
            title: page.title,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
            excerpt: page.snippet,
            source: "Wikipedia",
          }))
        : [];
    const instantAnswer =
      duckDuckGo.status === "fulfilled"
        ? duckDuckGo.value?.AbstractText
          ? {
              source: duckDuckGo.value.AbstractSource || "DuckDuckGo",
              title: duckDuckGo.value.Heading || normalizedQuery,
              description: duckDuckGo.value.AbstractText,
              url: safeResultUrl(duckDuckGo.value.AbstractURL),
            }
          : duckDuckGo.value?.Answer
            ? {
                source: "DuckDuckGo instant answer",
                title: duckDuckGo.value.Heading || normalizedQuery,
                description: duckDuckGo.value.Answer,
                url: safeResultUrl(duckDuckGo.value.AbstractURL),
              }
            : null
        : null;
    const relatedResults =
      duckDuckGo.status === "fulfilled" && Array.isArray(duckDuckGo.value?.RelatedTopics)
        ? flattenDuckDuckGoTopics(duckDuckGo.value.RelatedTopics)
        : [];
    const entities =
      wikidata.status === "fulfilled" && Array.isArray(wikidata.value?.search)
        ? wikidata.value.search
            .filter((entity) => entity.label && entity.id)
            .map((entity) => ({
              source: "Wikidata",
              title: entity.label,
              description: entity.description || "",
              url: `https://www.wikidata.org/wiki/${encodeURIComponent(entity.id)}`,
            }))
        : [];

    for (const [name, outcome] of [
      ["Wikipedia", wikipedia],
      ["DuckDuckGo", duckDuckGo],
      ["Wikidata", wikidata],
    ]) {
      if (outcome.status === "rejected") {
        if (outcome.reason?.name !== "AbortError") {
          console.error(`Knoledge Search could not reach ${name}:`, outcome.reason);
          sourceErrors.push(name);
        }
      } else if (
        (name === "Wikipedia" && !Array.isArray(outcome.value?.query?.search)) ||
        (name === "DuckDuckGo" && !Array.isArray(outcome.value?.RelatedTopics)) ||
        (name === "Wikidata" && !Array.isArray(outcome.value?.search))
      ) {
        console.error(`Knoledge Search received an invalid response from ${name}.`);
        sourceErrors.push(name);
      }
    }

    const content = document.createElement("div");
    let resultCount = appendResultGroup(content, "Wikipedia", pages, normalizedQuery);
    if (instantAnswer) {
      const answerGroup = document.createElement("section");
      answerGroup.className = "source-group";
      const heading = document.createElement("h3");
      heading.className = "source-heading";
      heading.textContent = "Quick answer";
      answerGroup.append(heading, createResultCard(instantAnswer, normalizedQuery));
      content.append(answerGroup);
      resultCount += 1;
    }
    resultCount += appendResultGroup(content, "DuckDuckGo related results", relatedResults, normalizedQuery);
    resultCount += appendResultGroup(content, "Wikidata", entities, normalizedQuery);

    if (resultCount === 0) {
      showState(
        "Nothing turned up just yet.",
        sourceErrors.length === 3
          ? "Search sources could not be reached. Check your connection and try again."
          : "Try a different spelling or a broader search, and see what you discover.",
        sourceErrors.length === 3 ? "error" : "info",
      );
    } else {
      resultsContent.replaceChildren(content);
      resultSource.textContent = sourceErrors.length
        ? `${resultCount} results · Some sources could not be reached: ${sourceErrors.join(", ")}`
        : `${resultCount} results · Wikipedia, DuckDuckGo, and Wikidata`;
    }
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error("Knoledge Search request failed:", error);
    showState(
      "We couldn’t reach the search right now.",
      "Check your internet connection and try again in a moment.",
      "error",
    );
  } finally {
    if (activeSearch === controller) {
      resultsSection.setAttribute("aria-busy", "false");
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  search(input.value);
});

input.addEventListener("input", setInputState);

clearButton.addEventListener("click", () => {
  input.value = "";
  setInputState();
  input.focus();
});

addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  openWebsite(addressInput.value);
});

backToSearchButton.addEventListener("click", () => {
  activateTab("search");
});

webBackButton.addEventListener("click", () => {
  const tab = websiteTabs.find((entry) => entry.id === activeTabId);
  const id = webContentsId(tab);
  if (id !== undefined) {
    desktopBrowser.goBack(id);
  }
});

webForwardButton.addEventListener("click", () => {
  const tab = websiteTabs.find((entry) => entry.id === activeTabId);
  const id = webContentsId(tab);
  if (id !== undefined) {
    desktopBrowser.goForward(id);
  }
});

webReloadButton.addEventListener("click", () => {
  const tab = websiteTabs.find((entry) => entry.id === activeTabId);
  const id = webContentsId(tab);
  if (id !== undefined) {
    desktopBrowser.reload(id);
  }
});

if (isDesktopApp) {
  webNavigation.hidden = false;
  desktopBrowser.onGuestNavigation(updateGuestNavigation);
  desktopBrowser.onNewTab((url) => {
    if (typeof url === "string") {
      openWebsite(url);
    }
  });
} else {
  webNavigation.hidden = true;
}

webAddressForm.addEventListener("submit", (event) => {
  event.preventDefault();
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

  activeTab.controller.abort();
  activeTab.url = updatedUrl;
  activeTab.title = updatedUrl.hostname.replace(/^www\./, "");
  activeTab.isWikipedia = false;
  activeTab.message = "Loading website…";
  activeTab.controller = new AbortController();
  renderTabs();
  activateTab(activeTab.id);
  if (isDesktopApp) {
    activeTab.frame.src = activeTab.url.href;
    activeTab.frame.hidden = false;
    webMessage.textContent = activeTab.message;
    webMessage.hidden = false;
  } else {
    activeTab.frame.src = "about:blank";
    activeTab.frame.removeAttribute("srcdoc");
    activeTab.frame.setAttribute("sandbox", "allow-forms allow-scripts allow-popups");
    activeTab.frame.hidden = true;
    loadTabContent(activeTab);
  }
});

document.querySelectorAll(".topic-card").forEach((card) => {
  card.addEventListener("click", () => {
    search(card.dataset.query);
  });
});

clearHistoryButton.addEventListener("click", () => {
  try {
    if (window.location.protocol === "knoledge:") {
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

window.addEventListener("popstate", () => {
  const query = new URLSearchParams(window.location.search).get("q");
  if (query) {
    if (input.value.trim() === query && resultsContent.childElementCount > 0) {
      return;
    }
    search(query, { updateHistory: false, scroll: false });
  } else {
    input.value = "";
    setInputState();
    activeSearch?.abort();
    resultsContent.replaceChildren();
    resultsHeading.hidden = true;
    resultsSection.setAttribute("aria-busy", "false");
  }
});

setInputState();
renderSearchHistory();
renderTabs();
restoreOpenTabs();
const initialQuery = new URLSearchParams(window.location.search).get("q");
if (initialQuery) {
  search(initialQuery, { updateHistory: false, scroll: false, activate: activeTabId === "search" });
}
