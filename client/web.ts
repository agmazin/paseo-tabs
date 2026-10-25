import type { PluginClientContext } from "@getpaseo/plugin/client";
import { mountClose } from "./close";
import { Platform } from "react-native";
import {
  agentIdOf,
  flag,
  hiddenSides,
  highlight,
  jumpHint,
  matches,
  parentOf,
  revealTarget,
  runningDescendants,
  tabBucket,
  tabsWord,
  wheelDelta,
  type AgentLink,
  type TabBox,
} from "../shared/model";

type Paseo = PluginClientContext["paseo"];

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
declare const performance: { now(): number };

const ROW = '[data-testid="workspace-tabs-row"]';
const SCROLL = '[data-testid="workspace-tabs-scroll"]';
const TAB = 'button[data-testid^="workspace-tab-"][aria-selected]';
const UI = "data-paseo-tabs-ui";
// The right panel (Files, Changes, plugin panels) has its own strip: desktop sidebar, native dock, explorer pane.
const EXPLORER =
  '[data-testid="workspace-explorer-sidebar"],[data-testid="native-explorer-sidebar-dock"],[data-testid="workspace-pane-explorer"]';
const EDGE = 44;
// Paseo's own "+" (new tab: agent with Claude or Codex, terminal...) is the last child of the scrolled strip.
// Native tabs shrink so it stays in view; ours keep their width and scroll, so it is pinned to the right edge.
const PLUS = '[data-testid="workspace-new-tab-button"]';

const css = `
${SCROLL}[data-paseo-tabs]{overflow-x:auto!important;scrollbar-width:none!important}
${SCROLL}[data-paseo-tabs]::-webkit-scrollbar{display:none}
[data-paseo-tabs] ${TAB}{width:auto!important;min-width:64px!important;max-width:160px!important}
[data-paseo-tabs] div:has(> ${PLUS}){position:sticky!important;right:0;z-index:6;flex-shrink:0;background:var(--colors-surface0,#181b1a)}
[data-paseo-tabs][data-pt-overflow] div:has(> ${PLUS}){box-shadow:-8px 0 10px 2px var(--colors-surface0,#181b1a)}
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
.pt-pair,.pt-flag-subagents{display:inline-flex;gap:2px;--pt-cut:var(--colors-surface0,#181b1a)}
.pt-pair{position:absolute;left:5px;top:11px;pointer-events:none}
${TAB}[aria-selected="true"] .pt-pair{--pt-cut:var(--colors-surface2,#272a29)}
.pt-flag.pt-flag-subagents{width:12px;height:5px;border-radius:0;margin:0 2.5px;--pt-cut:var(--colors-surface2,#272a29)}
.pt-mini{position:relative;width:5px;height:5px;flex:0 0 5px}
.pt-mini::before,.pt-mini::after,.pt-mini i{content:"";position:absolute;inset:-2.5px;border-radius:50%;box-sizing:border-box}
.pt-mini::before{background:var(--pt-cut)}
.pt-mini i{inset:0;background:var(--colors-status-dot-running,#5caaf6)}
.pt-mini::after{border:1.2px solid rgba(92,170,246,.2);border-top-color:var(--colors-status-dot-running,#5caaf6);animation:pt-spin .9s linear infinite}
@keyframes pt-spin{to{transform:rotate(360deg)}}
[data-pt-busy] [data-status-bucket]>:first-child>:first-child>div,.pt-ico[data-pt-busy]>:first-child>:first-child>div{display:none}
.pt-all{position:relative;display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;align-self:center;height:28px;margin:0 2px 0 4px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--colors-foreground-muted,#a1a5a4);font-size:13px;font-variant-numeric:tabular-nums;cursor:pointer}
.pt-all:hover,.pt-all.pt-open{background:var(--colors-surface2,#272a29);color:var(--colors-foreground,#fafafa)}
.pt-all .pt-flag{position:absolute;top:2px;left:16px;box-shadow:0 0 0 1.6px var(--colors-surface0,#181b1a)}
.pt-all .pt-flag-needs_input{width:12px;height:12px;line-height:12px;font-size:9px}
.pt-all .pt-flag-subagents{top:4px;left:15px;box-shadow:none;--pt-cut:var(--colors-surface0,#181b1a)}
.pt-all:hover .pt-flag-subagents,.pt-all.pt-open .pt-flag-subagents{--pt-cut:var(--colors-surface2,#272a29)}
.pt-row .pt-pair{--pt-cut:var(--colors-popover,#272a29)}
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
  busy: number;
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

const flagHtml = (marker: string | null) =>
  !marker
    ? ""
    : marker === "subagents"
      ? `<i class="pt-flag pt-flag-subagents" aria-hidden="true">${pairHtml}</i>`
      : `<i class="pt-flag pt-flag-${marker}"></i>`;

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

// Running descendants per agent id, recomputed on every scan from the agent sources.
let busyById = new Map<string, number>();

function readTab(node: any): Tab {
  const id = node.getAttribute("data-testid");
  const agent = agentIdOf(id);
  const busy = (agent && busyById.get(agent)) || 0;
  const native = node.querySelector("[data-status-bucket]")?.getAttribute("data-status-bucket") ?? "done";
  return {
    node,
    id,
    label: node.getAttribute("aria-label") || node.textContent.trim(),
    bucket: tabBucket(native, busy),
    busy,
    selected: node.getAttribute("aria-selected") === "true",
  };
}

function tabsOf(strip: Strip): Tab[] {
  return [...strip.scroll.querySelectorAll(TAB)]
    .filter((node: any) => node.getClientRects().length > 0)
    .map(readTab);
}

const pairHtml = '<span class="pt-mini"><i></i></span><span class="pt-mini"><i></i></span>';
const busyHint = (n: number) => `Работают подагенты: ${n}`;

// Every spinner of the plugin turns in one phase: all pt-spin animations share start time 0.
function syncSpin() {
  for (const animation of document.getAnimations())
    if (animation.animationName === "pt-spin" && animation.startTime !== 0) animation.startTime = 0;
}

// The pair takes the native badge's place at the tab icon; absolute, so the tab width stays put.
function paintTab(tab: Tab) {
  const node = tab.node;
  const icon = node.querySelector("[data-status-bucket]")?.firstElementChild;
  if (tab.bucket === "subagents" && icon) {
    let pair = node.__ptPair;
    if (!pair) {
      pair = node.__ptPair = el("span", "pt-pair", pairHtml);
      pair.setAttribute("aria-hidden", "true");
    }
    if (pair.parentElement !== icon) icon.append(pair);
    if (!node.hasAttribute("data-pt-busy")) node.setAttribute("data-pt-busy", "");
    const hint = busyHint(tab.busy);
    if (node.title !== hint) node.title = hint;
    node.__ptTitle = true;
    return;
  }
  clearTab(node);
}

function clearTab(node: any) {
  node.__ptPair?.remove();
  if (node.hasAttribute("data-pt-busy")) node.removeAttribute("data-pt-busy");
  if (node.__ptTitle) node.removeAttribute("title");
  node.__ptTitle = false;
}

const keep = (a: AgentLink): AgentLink => ({
  id: a.id,
  status: a.status,
  parentAgentId: parentOf(a),
  archivedAt: a.archivedAt ?? null,
});

// Agents of one host: a full read once a minute, agent updates in between.
function watchAgents(paseo: Paseo, source: Map<string, AgentLink>, changed: () => void) {
  let alive = true;
  let release: (() => void) | undefined;
  let warned = false;
  const load = async () => {
    try {
      const all = new Map<string, AgentLink>();
      let cursor: string | undefined;
      do {
        const r = await paseo.agents.list({ page: { limit: 200, cursor } });
        for (const { agent } of r.entries) all.set(agent.id, keep(agent));
        cursor = r.pageInfo.nextCursor ?? undefined;
      } while (cursor);
      if (!alive) return;
      source.clear();
      for (const [id, a] of all) source.set(id, a);
      changed();
    } catch {
      if (!warned) console.error("Вкладки: список агентов недоступен, индикатор подагентов выключен");
      warned = true;
    }
  };
  const off = paseo.agents.subscribe((update) => {
    if (update.kind === "upsert") source.set(update.agent.id, keep(update.agent));
    else source.delete(update.agentId);
    changed();
  });
  // One owned subscription makes the daemon push agent updates to this client.
  paseo.agents
    .list({ page: { limit: 1 }, subscribe: {} })
    .then((r) => {
      if (alive) release = () => r.subscription.release();
      else r.subscription.release();
    })
    .catch(() => {});
  void load();
  const timer = setInterval(() => void load(), 60_000);
  return () => {
    alive = false;
    off();
    release?.();
    clearInterval(timer);
  };
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

interface Shared {
  count: number;
  dispose: () => void;
  // One agent source per host that loaded the plugin; tab ids carry agent ids, unique across hosts.
  sources: Set<Map<string, AgentLink>>;
  notify: () => void;
}

function shared() {
  const host = window as { __paseoTabs?: Shared };
  return host;
}

export function mountTabs(paseo: Paseo): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  // One adapter per window even when several hosts load the plugin.
  const host = shared();
  if (!host.__paseoTabs) {
    const fresh: Shared = { count: 0, dispose: () => {}, sources: new Set(), notify: () => {} };
    host.__paseoTabs = fresh;
    fresh.dispose = start(fresh);
  }
  const state = host.__paseoTabs;
  state.count++;
  const source = new Map<string, AgentLink>();
  state.sources.add(source);
  const stopWatch = watchAgents(paseo, source, () => state.notify());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    stopWatch();
    state.sources.delete(source);
    state.notify();
    if (--state.count > 0) return;
    state.dispose();
    if (host.__paseoTabs === state) delete host.__paseoTabs;
  };
}

function start(state: Shared): () => void {
  const stopClose = mountClose();
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

  // The pinned "+" covers the right end of the strip: tabs count as visible only left of it.
  function plusWidth(strip: Strip) {
    const plus = strip.scroll.querySelector(PLUS)?.parentElement;
    return plus && plus.getClientRects().length > 0 ? plus.offsetWidth : 0;
  }

  function reveal(strip: Strip, smooth: boolean) {
    const tab = tabsOf(strip).find((t) => t.selected);
    if (!tab) return;
    const target = revealTarget(
      boxOf(strip, tab),
      strip.scroll.scrollLeft,
      strip.scroll.clientWidth - plusWidth(strip),
      strip.scroll.scrollWidth,
      EDGE,
    );
    if (target !== null) scrollStrip(strip.scroll, target, smooth);
  }

  function paintEdge(node: any, side: "left" | "right", tabs: Tab[], show: boolean) {
    node.classList.toggle("pt-show", show);
    if (!show) return;
    const marker = flag(tabs.map((t) => t.bucket));
    const mark = flagHtml(marker);
    const count = `<span>${tabs.length}</span>`;
    setHtml(node, side === "left" ? svg("left") + mark + count : count + mark + svg("right"));
    const waiting = tabs.filter((t) => t.bucket === "needs_input").map((t) => t.label);
    const busy = tabs.filter((t) => t.bucket === "subagents").map((t) => t.label);
    node.title =
      `${tabs.length} ${tabsWord(tabs.length)} ${side === "left" ? "слева" : "справа"}` +
      (waiting.length ? `. Ждут ответа: ${waiting.join(", ")}` : "") +
      (busy.length ? `. Работают подагенты: ${busy.join(", ")}` : "");
  }

  function update(strip: Strip) {
    const tabs = tabsOf(strip);
    for (const tab of tabs) paintTab(tab);
    const current = tabs.find((t) => t.selected)?.id ?? null;
    if (current !== strip.selected && !dragging()) {
      const first = strip.selected === undefined;
      strip.selected = current;
      reveal(strip, !first);
    }
    const { scroll } = strip;
    const overflow = scroll.scrollWidth > scroll.clientWidth + 1;
    const plus = plusWidth(strip);
    if (overflow) scroll.setAttribute("data-pt-overflow", "");
    else scroll.removeAttribute("data-pt-overflow");
    strip.right.style.right = `${6 + plus}px`;
    const byId = new Map(tabs.map((t) => [t.id, t]));
    const sides = overflow
      ? hiddenSides(tabs.map((t) => boxOf(strip, t)), scroll.scrollLeft, scroll.clientWidth - plus, EDGE)
      : { left: [], right: [] };
    const left = sides.left.map((id) => byId.get(id)!);
    const right = sides.right.map((id) => byId.get(id)!);
    const max = scroll.scrollWidth - scroll.clientWidth;
    paintEdge(strip.left, "left", left, overflow && scroll.scrollLeft > 1 && left.length > 0);
    paintEdge(strip.right, "right", right, overflow && scroll.scrollLeft < max - 1 && right.length > 0);
    const marker = flag([...left, ...right].map((t) => t.bucket));
    setHtml(
      strip.button,
      svg("list") + `<span>${tabs.length}</span>` + flagHtml(marker),
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
      for (const node of scroll.querySelectorAll(TAB)) clearTab(node);
      scroll.removeAttribute("data-paseo-tabs");
      scroll.removeAttribute("data-pt-overflow");
    };
    return strip;
  }

  function scan() {
    if (disposed) return;
    const agents: AgentLink[] = [];
    for (const source of state.sources) agents.push(...source.values());
    busyById = runningDescendants(agents);
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
    syncSpin();
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
    queueMicrotask(syncSpin);
    p.shown.forEach((tab, i) => {
      const row = el("div", `pt-row${i === p.sel ? " pt-sel" : ""}${tab.selected ? " pt-cur" : ""}`);
      row.setAttribute("data-tab", tab.id);
      const ico = el("span", "pt-ico");
      // The status wrapper also holds the label; clone only its icon with the native badge.
      const native = tab.node.querySelector("[data-status-bucket]")?.firstElementChild;
      if (native) ico.append(native.cloneNode(true));
      if (tab.bucket === "subagents") {
        ico.setAttribute("data-pt-busy", "");
        row.title = busyHint(tab.busy);
      }
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
      .map((t) => `${t.id}:${t.label}:${t.bucket}:${t.busy}:${t.selected}`)
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
  state.notify = schedule;
  schedule();
  return () => {
    disposed = true;
    stopClose();
    state.notify = () => {};
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
