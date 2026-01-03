/* global browser */

const KEY = "fjv_settings";

const DEFAULTS = {
  // formatting
  indentSpaces: 4,
  maxLineLength: 120,
  commaPadding: true,
  colonPadding: true,
  preserveBlankLines: true,

  // viewer
  rowHeight: 18,
  overscan: 10,
  expandMatches: true,
  pathFormat: "json_pointer"
};

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

async function load() {
  const obj = await browser.storage.local.get(KEY);
  return { ...DEFAULTS, ...(obj[KEY] || {}) };
}

async function save(settings) {
  await browser.storage.local.set({ [KEY]: settings });
}

function setStatus(msg) {
  $("status").textContent = msg;
  setTimeout(() => ($("status").textContent = ""), 1200);
}

function applyToForm(s) {
  $("indentSpaces").value = s.indentSpaces;
  $("maxLineLength").value = s.maxLineLength;
  $("commaPadding").checked = s.commaPadding;
  $("colonPadding").checked = s.colonPadding;
  $("preserveBlankLines").checked = s.preserveBlankLines;

  $("rowHeight").value = s.rowHeight;
  $("overscan").value = s.overscan;
  $("expandMatches").checked = s.expandMatches;
  $("pathFormat").value = s.pathFormat;
}

function readFromForm() {
  return {
    indentSpaces: Number($("indentSpaces").value),
    maxLineLength: Number($("maxLineLength").value),
    commaPadding: $("commaPadding").checked,
    colonPadding: $("colonPadding").checked,
    preserveBlankLines: $("preserveBlankLines").checked,

    rowHeight: Number($("rowHeight").value),
    overscan: Number($("overscan").value),
    expandMatches: $("expandMatches").checked,
    pathFormat: $("pathFormat").value
  };
}

(async () => {
  const s = await load();
  applyToForm(s);

  $("saveBtn").addEventListener("click", async () => {
    const next = readFromForm();
    await save(next);
    setStatus("Saved");
  });

  $("resetBtn").addEventListener("click", async () => {
    applyToForm(DEFAULTS);
    await save(DEFAULTS);
    setStatus("Reset");
  });
})().catch((e) => {
  console.error(e);
  setStatus(String(e));
});
