import { Platform } from "react-native";
import {
  flag,
  hiddenSides,
  highlight,
  jumpHint,
  matches,
  revealTarget,
  tabsWord,
  wheelDelta,
  type TabBox,
} from "../shared/model";

// DOM is restricted to this module. Paseo 0.12 has no plugin API for the workspace tab strip,
// so the adapter reads its accessible markers and fails open when they disappear.
declare const document: any;
declare const window: any;
declare const navigator: any;
declare const MutationObserver: any;
declare const ResizeObserver: any;
declare const requestAnimationFrame: (fn: () => void) => number;
declare const cancelAnimationFrame: (id: number) => void;
declare const Element: any;

const ROW = '[data-testid="workspace-tabs-row"]';
const SCROLL = '[data-testid="workspace-tabs-scroll"]';
const TAB = 'button[data-testid^="workspace-tab-"][aria-selected]';
const UI = "data-paseo-tabs-ui";
// The right panel (Files, Changes, plugin panels) has its own strip: desktop sidebar, native dock, explorer pane.
const EXPLORER =
  '[data-testid="workspace-explorer-sidebar"],[data-testid="native-explorer-sidebar-dock"],[data-testid="workspace-pane-explorer"]';
const EDGE = 44;

const css = `
${SCROLL}[data-paseo-tabs]{overflow-x:auto!important;scrollbar-width:none!important}
${SCROLL}[data-paseo-tabs]::-webkit-scrollbar{display:none}
[data-paseo-tabs] ${TAB}{width:auto!important;min-width:64px!important;max-width:160px!important}
.pt-edge{position:absolute;top:50%;transform:translateY(-50%);z-index:5;display:none;align-items:center;gap:3px;height:28px;padding:0 8px;border-radius:6px;border:1px solid var(--colors-border,#252b2a);background:var(--colors-surface2,#272a29);color:var(--colors-foreground,#fafafa);font-size:12.5px;font-variant-numeric:tabular-nums;cursor:pointer;user-select:none;box-shadow:0 0 0 6px var(--colors-surface0,#181b1a),0 0 16px 10px var(--colors-surface0,#181b1a)}
.pt-edge.pt-left{left:6px;padding-left:5px}.pt-edge.pt-right{right:6px;padding-right:5px}
.pt-edge.pt-show{display:inline-flex}
.pt-edge:hover{background:var(--colors-surface3,#434645)}
.pt-edge svg,.pt-all svg{width:14px;height:14px;flex:0 0 14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pt-edge svg{color:var(--colors-foreground-muted,#a1a5a4)}
.pt-flag{display:inline-block;border-radius:50%;flex:0 0 auto}
.pt-flag-needs_input{width:14px;height:14px;background:var(--colors-status-dot-warning,#db932e);color:var(--colors-surface0,#181b1a);font-weight:800;font-size:9.5px;line-height:14px;text-align:center}
.pt-flag-needs_input::after{content:"!"}
.pt-flag-failed{width:8px;height:8px;background:var(--colors-status-dot-danger,#f7796d)}
.pt-flag-attention{width:8px;height:8px;background:var(--colors-status-dot-success,#35c264)}
.pt-all{position:relative;display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;align-self:center;height:28px;margin:0 2px 0 4px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--colors-foreground-muted,#a1a5a4);font-size:13px;font-variant-numeric:tabular-nums;cursor:pointer}
.pt-all:hover,.pt-all.pt-open{background:var(--colors-surface2,#272a29);color:var(--colors-foreground,#fafafa)}
.pt-all .pt-flag{position:absolute;top:2px;left:16px;box-shadow:0 0 0 1.6px var(--colors-surface0,#181b1a)}
.pt-all .pt-flag-needs_input{width:12px;height:12px;line-height:12px;font-size:9px}
.pt-pop{position:fixed;z-index:10000;width:380px;display:flex;flex-direction:column;overflow:hidden;background:var(--colors-popover,#272a29);color:var(--colors-popover-foreground,#fafafa);border:1px solid var(--colors-border,#252b2a);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.45);font-size:14px}
.pt-search{display:flex;align-items:center;gap:8px;margin:8px;padding:0 10px;height:36px;border-radius:8px;background:var(--colors-surface1,#1e2120);border:1px solid var(--colors-border,#252b2a)}
.pt-search svg{width:15px;height:15px;flex:0 0 15px;stroke:var(--colors-foreground-extra-muted,#717574);fill:none;stroke-width:2;stroke-linecap:round}
.pt-search input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:inherit;font:inherit}
.pt-search input::placeholder{color:var(--colors-foreground-extra-muted,#717574)}
.pt-count{color:var(--colors-foreground-extra-muted,#717574);font-size:12px;white-space:nowrap}
.pt-list{overflow-y:auto;padding:0 6px 6px;scrollbar-width:thin}
.pt-row{display:flex;align-items:center;gap:10px;height:34px;padding:0 10px;border-radius:8px;cursor:pointer;white-space:nowrap}
.pt-row.pt-sel{background:var(--colors-interaction-highlight,rgba(255,255,255,.08))}
.pt-ico{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:0 0 16px}
.pt-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.pt-label mark{background:rgba(92,170,246,.22);color:inherit;border-radius:3px;font-weight:600}
.pt-row.pt-cur .pt-label{font-weight:600}
.pt-here{color:var(--colors-status-dot-running,#5caaf6);font-size:12px}
.pt-key{min-width:34px;text-align:right;color:var(--colors-foreground-extra-muted,#717574);font-size:12px;visibility:hidden}
.pt-row.pt-sel .pt-key,.pt-row:hover .pt-key{visibility:visible}
.pt-empty{padding:12px;color:var(--colors-foreground-muted,#a1a5a4);font-size:13px}
.pt-foot{display:flex;flex-wrap:wrap;gap:14px;padding:8px 12px;border-top:1px solid var(--colors-border,#252b2a);color:var(--colors-foreground-extra-muted,#717574);font-size:12px}
.pt-foot b{color:var(--colors-foreground-muted,#a1a5a4);font-weight:500}
`;
const icons = {
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
};
const svg = (name: keyof typeof icons) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;

interface Tab {
  node: any;
  id: string;
  label: string;
  bucket: string;
  selected: boolean;
}
interface Strip {
  scroll: any;
  parent: any;
  left: any;
  right: any;
  button: any;
  selected: string | null | undefined;
  dispose(): void;
}
interface Popup {
  strip: Strip;
  root: any;
  input: any;
  list: any;
  count: any;
  query: string;
  sel: number;
  shown: Tab[];
  signature: string;
  dispose(): void;
}

function el(tag: string, cls: string, html?: string) {
  const node = document.createElement(tag);
  node.className = cls;
  node.setAttribute(UI, "");
  if (html !== undefined) node.innerHTML = html;
  return node;
}

// Skips identical writes so a scan during chat streaming does not churn layout.
function setHtml(node: any, html: string) {
  if (node.__ptHtml === html) return;
  node.__ptHtml = html;
  node.innerHTML = html;
}

function readTab(node: any): Tab {
  return {
    node,
    id: node.getAttribute("data-testid"),
    label: node.getAttribute("aria-label") || node.textContent.trim(),
    bucket: node.querySelector("[data-status-bucket]")?.getAttribute("data-status-bucket") ?? "done",
    selected: node.getAttribute("aria-selected") === "true",
  };
}

function tabsOf(strip: Strip): Tab[] {
  return [...strip.scroll.querySelectorAll(TAB)]
    .filter((node: any) => node.getClientRects().length > 0)
    .map(readTab);
}

// React Native Web replaces scrollTo/scrollBy on ScrollView nodes with its own {x, animated} signature.
function scrollStrip(node: any, left: number, smooth: boolean, by = false) {
  const native = by ? Element.prototype.scrollBy : Element.prototype.scrollTo;
  native.call(node, { left, behavior: smooth ? "smooth" : "auto" });
}

function boxOf(strip: Strip, tab: Tab): TabBox {
  const rect = tab.node.getBoundingClientRect();
  const origin = strip.scroll.getBoundingClientRect();
  return { id: tab.id, left: rect.left - origin.left + strip.scroll.scrollLeft, width: rect.width };
}

function shared() {
  const host = window as { __paseoTabs?: { count: number; dispose: () => void } };
  return host;
}

export function mountTabs(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  // One adapter per window even when several hosts load the plugin.
  const host = shared();
  if (host.__paseoTabs) {
    host.__paseoTabs.count++;
  } else {
    host.__paseoTabs = { count: 1, dispose: start() };
  }
  let released = false;
  return () => {
    const state = host.__paseoTabs;
    if (released || !state) return;
    released = true;
    if (--state.count > 0) return;
    state.dispose();
    delete host.__paseoTabs;
  };
}

function start(): () => void {
  const style = el("style", "");
  style.textContent = css;
  document.head.append(style);
  const strips = new Map<any, Strip>();
  const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
  const desktop = !!window.paseoDesktop;
  let popup: Popup | null = null;
  let frame: number | null = null;
  let disposed = false;

  const dragging = () => !!document.querySelector(`${TAB}[aria-pressed="true"]`);

  function reveal(strip: Strip, smooth: boolean) {
    const tab = tabsOf(strip).find((t) => t.selected);
    if (!tab) return;
    const target = revealTarget(
      boxOf(strip, tab),
      strip.scroll.scrollLeft,
      strip.scroll.clientWidth,
      strip.scroll.scrollWidth,
      EDGE,
    );
    if (target !== null) scrollStrip(strip.scroll, target, smooth);
  }

  function paintEdge(node: any, side: "left" | "right", tabs: Tab[], show: boolean) {
    node.classList.toggle("pt-show", show);
    if (!show) return;
    const marker = flag(tabs.map((t) => t.bucket));
    const mark = marker ? `<i class="pt-flag pt-flag-${marker}"></i>` : "";
    const count = `<span>${tabs.length}</span>`;
    setHtml(node, side === "left" ? svg("left") + mark + count : count + mark + svg("right"));
    const waiting = tabs.filter((t) => t.bucket === "needs_input").map((t) => t.label);
    node.title =
      `${tabs.length} ${tabsWord(tabs.length)} ${side === "left" ? "слева" : "справа"}` +
      (waiting.length ? `. Ждут ответа: ${waiting.join(", ")}` : "");
  }

  function update(strip: Strip) {
    const tabs = tabsOf(strip);
    const current = tabs.find((t) => t.selected)?.id ?? null;
    if (current !== strip.selected && !dragging()) {
      const first = strip.selected === undefined;
      strip.selected = current;
      reveal(strip, !first);
    }
    const { scroll } = strip;
    const overflow = scroll.scrollWidth > scroll.clientWidth + 1;
    const byId = new Map(tabs.map((t) => [t.id, t]));
    const sides = overflow
      ? hiddenSides(tabs.map((t) => boxOf(strip, t)), scroll.scrollLeft, scroll.clientWidth, EDGE)
      : { left: [], right: [] };
    const left = sides.left.map((id) => byId.get(id)!);
    const right = sides.right.map((id) => byId.get(id)!);
    const max = scroll.scrollWidth - scroll.clientWidth;
    paintEdge(strip.left, "left", left, overflow && scroll.scrollLeft > 1 && left.length > 0);
    paintEdge(strip.right, "right", right, overflow && scroll.scrollLeft < max - 1 && right.length > 0);
    const marker = flag([...left, ...right].map((t) => t.bucket));
    setHtml(
      strip.button,
      svg("list") + `<span>${tabs.length}</span>` + (marker ? `<i class="pt-flag pt-flag-${marker}"></i>` : ""),
    );
    strip.button.title = `Все вкладки: ${tabs.length}`;
    strip.button.setAttribute("aria-label", strip.button.title);
  }

  function enhance(scroll: any): Strip | null {
    const parent = scroll.parentElement;
    const row = scroll.closest(ROW);
    // Unknown layout: keep the native strip untouched. Explorer tabs (Files, Changes) are few, leave them native.
    if (!parent || !row || parent.parentElement !== row) return null;
    if (scroll.closest(EXPLORER)) return null;
    scroll.setAttribute("data-paseo-tabs", "");
    const left = el("span", "pt-edge pt-left");
    const right = el("span", "pt-edge pt-right");
    const button = el("button", "pt-all");
    button.type = "button";
    parent.append(left, right);
    parent.after(button);
    const strip: Strip = { scroll, parent, left, right, button, selected: undefined, dispose: () => {} };
    const page = (dir: number) => () =>
      scrollStrip(scroll, dir * Math.max(120, scroll.clientWidth - 2 * EDGE - 40), true, true);
    const onLeft = page(-1);
    const onRight = page(1);
    const onWheel = (event: any) => {
      if (scroll.scrollWidth <= scroll.clientWidth + 1) return;
      const delta = wheelDelta(event.deltaX, event.deltaY, event.deltaMode);
      if (!delta) return;
      event.preventDefault();
      scroll.scrollLeft += delta;
    };
    const onButton = (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      if (popup?.strip === strip) closePopup();
      else openPopup(strip);
    };
    left.addEventListener("click", onLeft);
    right.addEventListener("click", onRight);
    scroll.addEventListener("wheel", onWheel, { passive: false });
    scroll.addEventListener("scroll", schedule, { passive: true });
    button.addEventListener("click", onButton);
    resize.observe(scroll);
    strip.dispose = () => {
      left.removeEventListener("click", onLeft);
      right.removeEventListener("click", onRight);
      scroll.removeEventListener("wheel", onWheel);
      scroll.removeEventListener("scroll", schedule);
      button.removeEventListener("click", onButton);
      resize.unobserve(scroll);
      left.remove();
      right.remove();
      button.remove();
      scroll.removeAttribute("data-paseo-tabs");
    };
    return strip;
  }

  function scan() {
    if (disposed) return;
    const found = new Set<any>(
      [...document.querySelectorAll(SCROLL)].filter((n: any) => n.getClientRects().length > 0),
    );
    for (const [scroll, strip] of strips)
      if (!found.has(scroll) || !scroll.isConnected) {
        if (popup?.strip === strip) closePopup();
        strip.dispose();
        strips.delete(scroll);
      }
    for (const scroll of found) {
      let strip = strips.get(scroll);
      if (!strip) {
        strip = enhance(scroll) ?? undefined;
        if (!strip) continue;
        strips.set(scroll, strip);
      }
      // React may reorder its own children around our nodes; put them back.
      if (strip.parent.nextElementSibling !== strip.button) strip.parent.after(strip.button);
      if (strip.left.parentElement !== strip.parent) strip.parent.append(strip.left, strip.right);
      update(strip);
    }
    if (popup) refreshPopup(false);
  }

  function schedule() {
    if (disposed || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      scan();
    });
  }

  function renderRows(p: Popup) {
    const all = tabsOf(p.strip);
    p.shown = all.filter((t) => matches(t.label, p.query));
    p.sel = Math.max(0, Math.min(p.sel, p.shown.length - 1));
    p.count.textContent = `${p.shown.length} из ${all.length}`;
    p.list.textContent = "";
    if (!p.shown.length) {
      p.list.append(el("div", "pt-empty", "Ничего не нашлось"));
      return;
    }
    p.shown.forEach((tab, i) => {
      const row = el("div", `pt-row${i === p.sel ? " pt-sel" : ""}${tab.selected ? " pt-cur" : ""}`);
      row.setAttribute("data-tab", tab.id);
      const ico = el("span", "pt-ico");
      // The status wrapper also holds the label; clone only its icon with the native badge.
      const native = tab.node.querySelector("[data-status-bucket]")?.firstElementChild;
      if (native) ico.append(native.cloneNode(true));
      const label = el("span", "pt-label");
      const [a, b, c] = highlight(tab.label, p.query);
      label.append(document.createTextNode(a));
      if (b) {
        const mark = document.createElement("mark");
        mark.textContent = b;
        label.append(mark);
      }
      label.append(document.createTextNode(c));
      row.append(ico, label);
      if (tab.selected) row.append(el("span", "pt-here", "открыта"));
      const key = el("span", "pt-key");
      key.textContent = jumpHint(all.indexOf(tab), mac, desktop);
      row.append(key);
      p.list.append(row);
    });
  }

  function refreshPopup(scrollToSel: boolean) {
    if (!popup) return;
    const signature = tabsOf(popup.strip)
      .map((t) => `${t.id}:${t.label}:${t.bucket}:${t.selected}`)
      .join("|");
    if (signature !== popup.signature || scrollToSel) {
      popup.signature = signature;
      renderRows(popup);
    }
    placePopup(popup);
    if (scrollToSel) popup.list.querySelector(".pt-sel")?.scrollIntoView({ block: "nearest" });
  }

  function placePopup(p: Popup) {
    const rect = p.strip.button.getBoundingClientRect();
    const width = 380;
    const top = rect.bottom + 6;
    p.root.style.top = `${top}px`;
    p.root.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    p.list.style.maxHeight = `${Math.max(160, window.innerHeight - top - 110)}px`;
  }

  function activate(p: Popup, tab: Tab | undefined) {
    if (!tab) return;
    closePopup();
    const node = [...p.strip.scroll.querySelectorAll(TAB)].find(
      (n: any) => n.getAttribute("data-testid") === tab.id,
    );
    node?.click();
  }

  function openPopup(strip: Strip) {
    closePopup();
    const root = el("div", "pt-pop");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Все вкладки");
    const font = strip.scroll.querySelector(`${TAB} [dir="auto"]`);
    if (font) root.style.fontFamily = window.getComputedStyle(font).fontFamily;
    const search = el("div", "pt-search", svg("search"));
    const input = document.createElement("input");
    input.placeholder = "Найти вкладку";
    input.setAttribute("aria-label", "Найти вкладку");
    const count = el("span", "pt-count");
    search.append(input, count);
    const list = el("div", "pt-list");
    const foot = el("div", "pt-foot");
    const jump = desktop ? (mac ? "⌘⌥1-9" : "Alt+1-9") : mac ? "⌥⇧1-9" : "Alt+Shift+1-9";
    const near = mac ? "⌥⇧[ ]" : "Alt+Shift+[ ]";
    foot.innerHTML = `<span><b>↑↓ Enter</b> перейти</span><span><b>${jump}</b> по номеру</span><span><b>${near}</b> соседняя</span>`;
    root.append(search, list, foot);
    document.body.append(root);
    const tabs = tabsOf(strip);
    const p: Popup = {
      strip,
      root,
      input,
      list,
      count,
      query: "",
      sel: Math.max(0, tabs.findIndex((t) => t.selected)),
      shown: [],
      signature: "",
      dispose: () => {},
    };
    const onInput = () => {
      p.query = input.value;
      p.sel = 0;
      renderRows(p);
      list.scrollTop = 0;
    };
    const onKey = (event: any) => {
      event.stopPropagation();
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        p.sel = Math.max(0, Math.min(p.shown.length - 1, p.sel + step));
        renderRows(p);
        list.querySelector(".pt-sel")?.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter") {
        event.preventDefault();
        activate(p, p.shown[p.sel]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closePopup();
      }
    };
    const onClick = (event: any) => {
      const row = event.target.closest?.(".pt-row");
      if (row) activate(p, p.shown.find((t) => t.id === row.getAttribute("data-tab")));
    };
    const onOutside = (event: any) => {
      if (root.contains(event.target) || strip.button.contains(event.target)) return;
      closePopup();
    };
    const onWindow = () => placePopup(p);
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKey);
    root.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("resize", onWindow);
    p.dispose = () => {
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKey);
      root.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onOutside, true);
      window.removeEventListener("resize", onWindow);
      root.remove();
      strip.button.classList.remove("pt-open");
    };
    popup = p;
    strip.button.classList.add("pt-open");
    refreshPopup(true);
    input.focus();
  }

  function closePopup() {
    const p = popup;
    popup = null;
    p?.dispose();
  }

  const resize = new ResizeObserver(schedule);
  // Chat streaming mutates the page constantly; only strip changes and new strips matter.
  const relevant = (record: any) => {
    const target = record.target;
    if (target.closest?.(`[${UI}]`) || target.hasAttribute?.(UI)) return false;
    if (record.type === "attributes" || target.closest?.(ROW)) return true;
    for (const node of [...record.addedNodes, ...record.removedNodes])
      if (node.nodeType === 1 && (node.matches(SCROLL) || node.querySelector(SCROLL))) return true;
    return false;
  };
  const observer = new MutationObserver((records: any[]) => {
    if (records.some(relevant)) schedule();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-selected", "aria-label", "data-status-bucket", "data-testid"],
  });
  window.addEventListener("resize", schedule);
  schedule();
  return () => {
    disposed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    observer.disconnect();
    resize.disconnect();
    window.removeEventListener("resize", schedule);
    closePopup();
    for (const strip of strips.values()) strip.dispose();
    strips.clear();
    style.remove();
  };
}
