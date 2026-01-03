/* global browser */

const STORAGE_KEY_ENABLED = "fjv_enabled";
let enabled = true;

async function loadEnabled() {
  const obj = await browser.storage.local.get(STORAGE_KEY_ENABLED);
  enabled = obj[STORAGE_KEY_ENABLED] !== undefined ? !!obj[STORAGE_KEY_ENABLED] : true;
  await updateBrowserAction();
}

async function setEnabled(val) {
  enabled = !!val;
  await browser.storage.local.set({ [STORAGE_KEY_ENABLED]: enabled });
  await updateBrowserAction();
}

async function updateBrowserAction() {
  await browser.browserAction.setBadgeText({ text: enabled ? "ON" : "OFF" });
  await browser.browserAction.setTitle({
    title: enabled
      ? "Fractured JSON Viewer: ON (click to disable)"
      : "Fractured JSON Viewer: OFF (click to enable)"
  });
}

browser.browserAction.onClicked.addListener(async () => {
  await setEnabled(!enabled);
});

function hasJsonContentType(responseHeaders) {
  if (!responseHeaders) return false;
  for (const h of responseHeaders) {
    if (!h || !h.name) continue;
    if (h.name.toLowerCase() !== "content-type") continue;
    const v = (h.value || "").toLowerCase();
    return v.includes("application/json") || v.includes("text/json") || v.includes("+json");
  }
  return false;
}

function shouldHandle(details) {
  if (!enabled) return false;
  if (details.type !== "main_frame") return false;

  const url = details.url || "";
  if (url.startsWith(browser.runtime.getURL(""))) return false;
  if (url.startsWith("about:") || url.startsWith("moz-extension:")) return false;

  return true;
}

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!shouldHandle(details)) return {};
    if (!hasJsonContentType(details.responseHeaders)) return {};

    const viewerUrl = browser.runtime.getURL(
      "viewer/viewer.html?url=" + encodeURIComponent(details.url)
    );
    return { redirectUrl: viewerUrl };
  },
  { urls: ["<all_urls>"] },
  ["blocking", "responseHeaders"]
);

loadEnabled().catch(console.error);
