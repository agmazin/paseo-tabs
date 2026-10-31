import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const host = '127.0.0.1:6793', id = process.env.RUNNING;
assert.ok(id, 'RUNNING must identify a running root fixture on 6793');
const out = resolve(process.argv[2] || 'docs/shots/0.3.0');
mkdirSync(out, { recursive: true });
const profile = mkdtempSync('/Users/agmazin/Library/Developer/paseo-tabs/close-profile-');
const inspect = agentId => JSON.parse(execFileSync('paseo', ['inspect', agentId, '--host', host, '--json'], { encoding: 'utf8' }));
const errors = [], confirmations = [];
let context;
async function launch() {
  context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chrome', viewport: { width: 1560, height: 975 }, locale: 'ru-RU', colorScheme: 'dark' });
  const page = context.pages()[0];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async dialog => { confirmations.push(dialog.message()); await dialog.dismiss(); });
  await page.goto(`http://${host}`);
  await page.waitForSelector('html[data-paseo-tabs-close="ready"]', { timeout: 30000 });
  return page;
}
const tabId = `workspace-tab-agent_${id}`;
try {
  let page = await launch();
  const row = () => page.getByTestId(`dialogs-agent-${id}`);
  const reopen = async () => { await row().click(); await page.getByTestId(tabId).waitFor(); };
  const hidden = async () => {
    await page.waitForTimeout(500);
    assert.equal(await page.getByTestId(tabId).count(), 0);
    assert.equal(await row().count(), 1);
    assert.equal(inspect(id).Archived, false);
    assert.equal(inspect(id).Status, 'running');
  };
  assert.equal(inspect(id).ParentAgentId, null);
  await reopen();
  await page.getByTestId(tabId).hover();
  await page.getByTestId(`workspace-agent-close-${id}`).click();
  await hidden();
  await page.screenshot({ path: `${out}/running-closed.png` });
  await page.reload();
  await page.waitForSelector('html[data-paseo-tabs-close="ready"]');
  await hidden();
  await context.close();
  page = await launch();
  await hidden();
  await page.screenshot({ path: `${out}/browser-restarted-hidden.png` });
  await reopen();
  assert.equal(await page.evaluate(agentId => Object.values(JSON.parse(localStorage.getItem('paseo-tabs.hidden-agents.v1') || '{}')).some(ids => ids.includes(agentId)), id), false);
  await page.keyboard.press('Meta+w');
  await hidden();
  await reopen();
  await page.getByTestId(tabId).click({ button: 'middle' });
  await hidden();
  await reopen();
  await page.getByTestId(tabId).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Закрыть', exact: true }).click();
  await hidden();
  await reopen();
  const allIds = await page.locator('button[data-testid^="workspace-tab-agent_"]').evaluateAll(nodes => nodes.map(n => n.dataset.testid.slice('workspace-tab-agent_'.length)));
  for (const label of ['Закрыть вкладки слева', 'Закрыть вкладки справа', 'Закрыть другие вкладки']) {
    for (const other of allIds) await page.getByTestId(`dialogs-agent-${other}`).click();
    await reopen();
    await page.getByTestId(tabId).click({ button: 'right' });
    const item = page.getByRole('menuitem', { name: label, exact: true });
    if (await item.getAttribute('aria-disabled') === 'true') { await page.keyboard.press('Escape'); continue; }
    await item.click();
    for (const other of allIds) assert.equal(inspect(other).Archived, false);
    assert.equal(inspect(id).Status, 'running');
  }
  assert.equal(await page.locator('button[data-testid^="workspace-tab-agent_"]').count(), 1);
  assert.deepEqual(confirmations, []);
  await page.screenshot({ path: `${out}/only-current-tab.png` });
  assert.deepEqual(errors, []);
  console.log('PASS: running root close, Cmd+W, middle click, menu close, left/right/others, reload, full browser restart, reopen; no archive or confirmation');
} finally { await context?.close(); rmSync(profile, { recursive: true, force: true }); }
