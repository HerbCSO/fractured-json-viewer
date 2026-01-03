/* global browser */
import * as FJ from "../vendor/fracturedjsonjs/fracturedjson.esm.js";

// Handle different bundling/export shapes (ESM vs CJS-interop)
const Formatter = FJ.Formatter ?? FJ.default?.Formatter;

function getRecommendedOptions() {
  // Preferred: a static Recommended() helper, if present
  const Recommended =
    FJ.FracturedJsonOptions?.Recommended ??
    FJ.default?.FracturedJsonOptions?.Recommended;

  if (typeof Recommended === "function") return Recommended();

  // Fallback: instantiate an options class if exported under a different name
  const OptionsCtor =
    FJ.FracturedJsonOptions ??
    FJ.Options ??
    FJ.default?.FracturedJsonOptions ??
    FJ.default?.Options;

  if (typeof OptionsCtor === "function") return new OptionsCtor();

  // Last resort: plain object; Formatter.Options in this lib is a bag of settings
  return {};
}

const SETTINGS_KEY = "fjv_settings";
const DEFAULTS = {
  indentSpaces: 4,
  maxLineLength: 120,
  commaPadding: true,
  colonPadding: true,
  preserveBlankLines: true,
  rowHeight: 18,
  overscan: 10,
  expandMatches: true,
  pathFormat: "json_pointer"
};

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function loadSettings() {
  const obj = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULTS, ...(obj[SETTINGS_KEY] || {}) };
}

function getTargetUrl() {
  const u = new URL(location.href);
  const target = u.searchParams.get("url");
  if (!target) throw new Error("Missing ?url=");
  return target;
}

async function fetchText(url) {
  const resp = await fetch(url, { credentials: "include" });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}\n\n${text.slice(0, 2000)}`);
  return text;
}

function formatJsonText(jsonText, s) {
  if (!Formatter) {
    throw new Error(
      "fracturedjsonjs Formatter export not found. Check vendor/fracturedjsonjs/dist contents."
    );
  }

  const options = getRecommendedOptions();

  // Apply your settings (works whether options is a class instance or plain object)
  options.MaxTotalLineLength = s.maxLineLength;
  options.IndentSpaces = s.indentSpaces;
  options.CommaPadding = s.commaPadding;
  options.ColonPadding = s.colonPadding;
  options.PreserveBlankLines = s.preserveBlankLines;

  const formatter = new Formatter();
  formatter.Options = options;

  return formatter.Reformat(jsonText);
}

/** ---------- Tree model (virtualized) ---------- **/

let nextId = 1;
function mkId() { return nextId++; }

function classify(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  switch (typeof v) {
    case "object": return "object";
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "bool";
    default: return "unknown";
  }
}

function previewOf(v) {
  const t = classify(v);
  if (t === "string") return JSON.stringify(v.length > 200 ? v.slice(0, 200) + "…" : v);
  if (t === "number" || t === "bool") return String(v);
  if (t === "null") return "null";
  if (t === "array") return `[${v.length}]`;
  if (t === "object") return `{${Object.keys(v).length}}`;
  return String(v);
}

function escapeJsonPointerToken(token) {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

function toJsonPointer(pathTokens) {
  // tokens are already strings
  return "/" + pathTokens.map(escapeJsonPointerToken).join("/");
}

function toJsonPath(pathTokens) {
  // naive JSONPath-ish: $.a[0].b
  let s = "$";
  for (const tok of pathTokens) {
    if (/^\d+$/.test(tok)) s += `[${tok}]`;
    else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tok)) s += `.${tok}`;
    else s += `[${JSON.stringify(tok)}]`;
  }
  return s;
}

/**
 * Node:
 * { id, parentId, key, depth, type, value, children: [childId], expanded, pathTokens }
 */
function buildTree(rootValue) {
  nextId = 1;
  const nodes = new Map();

  const rootId = mkId();
  nodes.set(rootId, {
    id: rootId,
    parentId: null,
    key: null,
    depth: 0,
    type: classify(rootValue),
    value: rootValue,
    children: [],
    expanded: true,
    pathTokens: []
  });

  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    const n = nodes.get(id);
    const t = n.type;

    if (t !== "array" && t !== "object") continue;

    const v = n.value;
    if (t === "array") {
      n.children = v.map((item, idx) => {
        const cid = mkId();
        nodes.set(cid, {
          id: cid,
          parentId: id,
          key: String(idx),
          depth: n.depth + 1,
          type: classify(item),
          value: item,
          children: [],
          expanded: false,
          pathTokens: [...n.pathTokens, String(idx)]
        });
        return cid;
      });
      // push in reverse so render order is natural
      for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
    } else {
      const entries = Object.entries(v);
      n.children = entries.map(([k, item]) => {
        const cid = mkId();
        nodes.set(cid, {
          id: cid,
          parentId: id,
          key: k,
          depth: n.depth + 1,
          type: classify(item),
          value: item,
          children: [],
          expanded: false,
          pathTokens: [...n.pathTokens, k]
        });
        return cid;
      });
      for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
    }
  }

  return { nodes, rootId };
}

/** ---------- Filtering ---------- **/

function normalize(s) { return (s || "").toLowerCase(); }

function computeMatchMap(model, query) {
  const q = normalize(query).trim();
  const match = new Map();      // nodeId -> boolean matches self
  const keep = new Map();       // nodeId -> boolean should be shown (self or descendant match)
  const expand = new Map();     // nodeId -> boolean should be expanded due to match context

  // pass 1: self match
  for (const [id, n] of model.nodes.entries()) {
    if (!q) {
      match.set(id, false);
      keep.set(id, true);
      expand.set(id, false);
      continue;
    }

    const keyStr = n.key == null ? "" : String(n.key);
    const valStr = (n.type === "array" || n.type === "object") ? "" : String(n.value);
    const hay = normalize(keyStr + " " + valStr);
    const ok = hay.includes(q);
    match.set(id, ok);
    keep.set(id, ok); // provisional
    expand.set(id, false);
  }

  if (!q) return { match, keep, expand };

  // pass 2: bubble up keep/expand via parent links
  // We iterate nodes in descending depth by sorting once.
  const idsByDepth = Array.from(model.nodes.values())
    .sort((a, b) => b.depth - a.depth)
    .map((n) => n.id);

  for (const id of idsByDepth) {
    const n = model.nodes.get(id);
    if (!n.parentId) continue;

    if (keep.get(id)) {
      keep.set(n.parentId, true);
      expand.set(n.parentId, true); // parent should open to show matching descendant
    }
  }

  return { match, keep, expand };
}

/** ---------- Visible list (depends on expanded + filter) ---------- **/

function computeVisibleIds(model, keepMap) {
  const out = [];
  const root = model.nodes.get(model.rootId);

  function walk(id) {
    const n = model.nodes.get(id);
    if (!keepMap.get(id)) return;

    out.push(id);

    if (n.type !== "array" && n.type !== "object") return;
    if (!n.expanded) return;

    for (const cid of n.children) walk(cid);
  }

  walk(root.id);
  return out;
}

/** ---------- Virtualized renderer ---------- **/

function makeRowEl() {
  const row = document.createElement("div");
  row.className = "row";

  const twisty = document.createElement("span");
  twisty.className = "twisty";

  const node = document.createElement("span");
  node.className = "node";

  row.appendChild(twisty);
  row.appendChild(node);
  return row;
}

function appendHighlightedText(parent, text, query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) {
    parent.appendChild(document.createTextNode(text));
    return;
  }

  const low = text.toLowerCase();
  let i = 0;
  while (true) {
    const hit = low.indexOf(q, i);
    if (hit === -1) {
      parent.appendChild(document.createTextNode(text.slice(i)));
      return;
    }
    if (hit > i) parent.appendChild(document.createTextNode(text.slice(i, hit)));

    const mark = document.createElement("span");
    mark.className = "match";
    mark.textContent = text.slice(hit, hit + q.length);
    parent.appendChild(mark);

    i = hit + q.length;
  }
}

function setRowContent(rowEl, n, { query, pathFormat }) {
  const twisty = rowEl.querySelector(".twisty");
  const node = rowEl.querySelector(".node");

  const hasKids = (n.type === "array" || n.type === "object") && n.children.length > 0;
  twisty.textContent = hasKids ? (n.expanded ? "▾" : "▸") : " ";

  rowEl.style.paddingLeft = `${n.depth * 14}px`;

  // path metadata for context menu
  const pointer = toJsonPointer(n.pathTokens);
  const jpath = toJsonPath(n.pathTokens);
  rowEl.dataset.pointer = pointer;
  rowEl.dataset.jsonpath = jpath;
  rowEl.dataset.path = pathFormat === "jsonpath" ? jpath : pointer;

  // Clear existing content (no innerHTML)
  while (node.firstChild) node.removeChild(node.firstChild);

  // key part
  if (n.key != null) {
    const keySpan = document.createElement("span");
    keySpan.className = "key";
    appendHighlightedText(keySpan, `${JSON.stringify(n.key)}: `, query);
    node.appendChild(keySpan);
  }

  // container punctuation for arrays/objects
  const typePunc =
    n.type === "object" ? "{…}" :
    n.type === "array" ? "[…]" : "";

  if (typePunc) {
    const p = document.createElement("span");
    p.className = "punc";
    p.textContent = typePunc + " ";
    node.appendChild(p);
  }

  // preview/value
  const prev = previewOf(n.value);
  const v = document.createElement("span");
  v.className =
    n.type === "string" ? "val-string" :
    n.type === "number" ? "val-number" :
    n.type === "bool" ? "val-bool" :
    n.type === "null" ? "val-null" : "preview";

  appendHighlightedText(v, prev, query);
  node.appendChild(v);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** ---------- UI helpers ---------- **/

function showToast(msg) {
  const toast = $("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 1100);
}

function setActiveView(which) {
  const isTree = which === "tree";
  $("treeView").classList.toggle("hidden", !isTree);
  $("textView").classList.toggle("hidden", isTree);
  $("viewTreeBtn").classList.toggle("active", isTree);
  $("viewTextBtn").classList.toggle("active", !isTree);
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

/** ---------- Main ---------- **/

(async () => {
  const s = await loadSettings();
  $("expandMatchesChk").checked = s.expandMatches;

  const targetUrl = getTargetUrl();
  $("sourceUrl").textContent = targetUrl;

  $("rawBtn").addEventListener("click", () => (window.location.href = targetUrl));
  $("viewTreeBtn").addEventListener("click", () => setActiveView("tree"));
  $("viewTextBtn").addEventListener("click", () => setActiveView("text"));

  // Fetch & parse
  const rawText = await fetchText(targetUrl);
  const parsed = JSON.parse(rawText);

  // Text view: FracturedJson + Prism
  const formatted = formatJsonText(rawText, s);
  $("code").textContent = formatted;
  if (window.Prism) window.Prism.highlightElement($("code"));

  $("copyBtn").addEventListener("click", async () => {
    await copyToClipboard(formatted);
    showToast("Copied formatted JSON");
  });

  // Build tree model
  const model = buildTree(parsed);

  // Expand/collapse all
  $("expandAllBtn").addEventListener("click", () => {
    for (const n of model.nodes.values()) {
      if (n.type === "array" || n.type === "object") n.expanded = true;
    }
    rerender();
  });
  $("collapseAllBtn").addEventListener("click", () => {
    for (const n of model.nodes.values()) {
      if (n.type === "array" || n.type === "object") n.expanded = false;
    }
    model.nodes.get(model.rootId).expanded = true;
    rerender();
  });

  // Virtualization state
  const scrollEl = $("treeScroll");
  const spacerEl = $("treeSpacer");
  const rowsEl = $("treeRows");

  let filter = "";
  let maps = computeMatchMap(model, filter);
  let visibleIds = computeVisibleIds(model, maps.keep);

  function applyExpandMatchesIfNeeded() {
    if (!filter.trim()) return;
    if (!$("expandMatchesChk").checked) return;
    for (const [id, n] of model.nodes.entries()) {
      if (maps.expand.get(id) && (n.type === "array" || n.type === "object")) {
        n.expanded = true;
      }
    }
  }

  // Recompute lists/maps
  function recompute() {
    maps = computeMatchMap(model, filter);
    applyExpandMatchesIfNeeded();
    visibleIds = computeVisibleIds(model, maps.keep);
    spacerEl.style.height = `${visibleIds.length * s.rowHeight}px`;
  }

  // Row pool for virtualization
  let pool = [];
  function ensurePool(size) {
    while (pool.length < size) {
      const el = makeRowEl();

      // Click to toggle expand for containers
      el.addEventListener("click", () => {
        const id = Number(el.dataset.id);
        const n = model.nodes.get(id);
        if (!n) return;
        if (n.type === "array" || n.type === "object") {
          n.expanded = !n.expanded;
          rerender();
        }
      });

      // Right-click: copy path
      el.addEventListener("contextmenu", async (ev) => {
        ev.preventDefault();
        const path = el.dataset.path || "";
        if (path) {
          await copyToClipboard(path);
          showToast(`Copied path: ${path}`);
        }
      });

      rowsEl.appendChild(el);
      pool.push(el);
    }
  }

  function renderViewport() {
    const viewportH = scrollEl.clientHeight;
    const scrollTop = scrollEl.scrollTop;

    const start = Math.max(0, Math.floor(scrollTop / s.rowHeight) - s.overscan);
    const end = Math.min(
      visibleIds.length,
      Math.ceil((scrollTop + viewportH) / s.rowHeight) + s.overscan
    );
    const need = Math.max(0, end - start);
    ensurePool(need);

    // Position rows container at top=0; each row is absolutely positioned in that.
    for (let i = 0; i < pool.length; i++) {
      const el = pool[i];
      const idx = start + i;

      if (idx >= end) {
        el.style.display = "none";
        continue;
      }

      const id = visibleIds[idx];
      const n = model.nodes.get(id);
      el.style.display = "flex";
      el.style.top = `${idx * s.rowHeight}px`;
      el.style.height = `${s.rowHeight}px`;
      el.dataset.id = String(id);

      setRowContent(el, n, {
        isMatch: maps.match.get(id),
        query: filter,
        pathFormat: s.pathFormat
      });
    }
  }

  function rerender() {
    recompute();
    renderViewport();
  }

  scrollEl.addEventListener("scroll", () => renderViewport());

  // Filter input
  const onFilter = debounce((val) => {
    filter = val || "";
    rerender();
  }, 80);

  $("filterInput").addEventListener("input", (e) => onFilter(e.target.value));
  $("clearFilterBtn").addEventListener("click", () => {
    $("filterInput").value = "";
    filter = "";
    rerender();
  });
  $("expandMatchesChk").addEventListener("change", () => rerender());

  // Initialize virtualization spacer and initial render
  spacerEl.style.height = `${visibleIds.length * s.rowHeight}px`;
  setActiveView("tree");
  renderViewport();
})().catch((e) => {
  console.error(e);
  $("treeView").textContent = String(e && e.stack ? e.stack : e);
  $("textView").classList.remove("hidden");
  $("code").textContent = String(e && e.stack ? e.stack : e);
  if (window.Prism) window.Prism.highlightElement($("code"));
});
