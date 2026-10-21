// Pure tab-strip logic shared by the web adapter and the tests.

export type Bucket = "needs_input" | "failed" | "running" | "attention" | "done";

export interface TabBox {
  id: string;
  left: number;
  width: number;
}

// Statuses worth flagging when the tab is out of sight, most important first.
const FLAG_ORDER: Bucket[] = ["needs_input", "failed", "attention"];

export function flag(buckets: readonly string[]): Bucket | null {
  for (const bucket of FLAG_ORDER) if (buckets.includes(bucket)) return bucket;
  return null;
}

// A tab counts as hidden on a side when its centre is under that edge's counter.
export function hiddenSides(
  tabs: readonly TabBox[],
  scrollLeft: number,
  viewport: number,
  edge: number,
) {
  const left: string[] = [];
  const right: string[] = [];
  for (const tab of tabs) {
    const centre = tab.left + tab.width / 2;
    if (centre < scrollLeft + edge) left.push(tab.id);
    else if (centre > scrollLeft + viewport - edge) right.push(tab.id);
  }
  return { left, right };
}

// Scroll position that brings the tab fully into view clear of the edge counters; null when already visible.
export function revealTarget(
  tab: TabBox,
  scrollLeft: number,
  viewport: number,
  content: number,
  edge: number,
) {
  if (content <= viewport) return null;
  const max = content - viewport;
  let target: number | null = null;
  if (tab.left < scrollLeft + edge) target = tab.left - edge;
  else if (tab.left + tab.width > scrollLeft + viewport - edge)
    target = tab.left + tab.width - viewport + edge;
  if (target === null) return null;
  return Math.min(max, Math.max(0, Math.round(target)));
}

export function wheelDelta(deltaX: number, deltaY: number, deltaMode: number) {
  if (Math.abs(deltaY) <= Math.abs(deltaX)) return 0;
  return deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
}

const fold = (text: string) => text.toLowerCase().replace(/ё/g, "е");

export function matches(label: string, query: string) {
  const q = fold(query.trim());
  return !q || fold(label).includes(q);
}

// Splits a label into [before, match, after] for highlighting; match is empty when nothing matched.
export function highlight(label: string, query: string): [string, string, string] {
  const q = fold(query.trim());
  const i = q ? fold(label).indexOf(q) : -1;
  if (i < 0) return [label, "", ""];
  return [label.slice(0, i), label.slice(i, i + q.length), label.slice(i + q.length)];
}

export function tabsWord(n: number) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return "вкладка";
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return "вкладки";
  return "вкладок";
}

// Paseo's own "jump to tab" chords per platform, shown as hints only.
export function jumpHint(index: number, mac: boolean, desktop: boolean) {
  if (index > 8) return "";
  const n = index + 1;
  if (desktop) return mac ? `⌘⌥${n}` : `Alt+${n}`;
  return mac ? `⌥⇧${n}` : `Alt+Shift+${n}`;
}
