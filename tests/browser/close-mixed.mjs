import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const id = process.env.IDLE, terminal = process.env.TERMINAL;
assert.ok(id && terminal);
const host = '127.0.0.1:6793';
const b = await chromium.launch({ headless: true, channel: 'chrome' });
try {
 const p = await b.newPage({ viewport: { width: 1560, height: 975 }, locale: 'ru-RU' });
 const messages = [];
 p.on('dialog', async d => { messages.push(d.message()); await d.dismiss(); });
 await p.goto(`http://${host}`);
 await p.getByTestId(`dialogs-agent-${id}`).click();
 await p.waitForSelector('html[data-paseo-tabs-close="ready"]');
 await p.getByTestId(`workspace-tab-agent_${id}`).click({ button: 'right' });
 await p.getByRole('menuitem', { name: 'Закрыть другие вкладки', exact: true }).click();
 await p.waitForTimeout(500);
 assert.ok(messages.length, 'native terminal close must ask for confirmation');
 assert.ok(messages.every(m => !/archive|архив/i.test(m)), 'bulk close must never offer agent archive');
 const agents = JSON.parse(execFileSync('paseo', ['ls', '-a', '--host', host, '--json'], { encoding: 'utf8' }));
 assert.equal(agents.find(a => a.id === id).status, 'idle');
 assert.ok(await p.getByTestId(`workspace-tab-terminal_${terminal}`).count(), 'cancel leaves terminal open');
 console.log('PASS: mixed bulk close hides agents, asks native terminal confirmation, cancel leaves terminal open');
} finally { await b.close(); }
