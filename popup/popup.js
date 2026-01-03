// SPDX-License-Identifier: MIT

/* global browser */

const STORAGE_KEY_ENABLED = "fjv_enabled";

function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg;
  setTimeout(() => (el.textContent = ""), 900);
}

async function getEnabled() {
  const obj = await browser.storage.local.get(STORAGE_KEY_ENABLED);
  return obj[STORAGE_KEY_ENABLED] !== undefined ? !!obj[STORAGE_KEY_ENABLED] : true;
}

async function setEnabled(val) {
  await browser.storage.local.set({ [STORAGE_KEY_ENABLED]: !!val });
}

(async () => {
  const enabledToggle = document.getElementById("enabledToggle");
  const openSettingsBtn = document.getElementById("openSettingsBtn");

  enabledToggle.checked = await getEnabled();

  enabledToggle.addEventListener("change", async () => {
    await setEnabled(enabledToggle.checked);
    setStatus(enabledToggle.checked ? "Enabled" : "Disabled");
    // optional: close popup immediately
    // window.close();
  });

  openSettingsBtn.addEventListener("click", async () => {
    // Opens the extension's options page, if options_ui is defined. :contentReference[oaicite:3]{index=3}
    await browser.runtime.openOptionsPage();
    window.close();
  });
})().catch((e) => {
  console.error(e);
  setStatus(String(e));
});
