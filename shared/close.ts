export interface CloseTab { tabId: string; target: { kind: string; agentId?: string } }

export function moduleCandidateIds(source: string): number[] {
  return source.split("\n").filter(line => line.includes("hideAgent:") && line.includes("unhideAgent:") && line.includes("layoutByWorkspace") && line.includes("closeTab:"))
    .flatMap(line => { const match = line.match(/\},(\d+),\[[\d,]*\]\);$/); return match ? [Number(match[1])] : []; });
}

export function closeSelection(tabs: CloseTab[], tabId: string, label: string): CloseTab[] | null {
  const index = tabs.findIndex(tab => tab.tabId === tabId);
  if (index < 0) return null;
  if (/^(Close other tabs|Закрыть другие вкладки|Закрыть остальные вкладки)$/i.test(label)) return tabs.filter(tab => tab.tabId !== tabId);
  if (/^(Close tabs to the left|Закрыть вкладки слева)$/i.test(label)) return tabs.slice(0, index);
  if (/^(Close tabs to the right|Закрыть вкладки справа)$/i.test(label)) return tabs.slice(index + 1);
  if (/^(Close|Close tab|Закрыть|Закрыть вкладку)$/i.test(label)) return [tabs[index]];
  return null;
}
