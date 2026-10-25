import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const id = process.env.IDLE;
assert.ok(id, 'IDLE must be a disposable idle root on 6793');
const host = '127.0.0.1:6793';
const inspect = () => JSON.parse(execFileSync('paseo', ['inspect', id, '--host', host, '--json'], { encoding: 'utf8' }));
assert.equal(inspect().Status, 'idle');
const b = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const p = await b.newPage({ viewport: { width: 1560, height: 975 }, locale: 'ru-RU' });
  const warnings = [];
  p.on('console', m => { if (m.text().includes('[paseo-tabs] Layout store unavailable')) warnings.push(m.text()); });
  await p.route('**/_expo/static/js/web/index-*.js', route => route.request().resourceType() === 'fetch' ? route.fulfill({ body: '// layout store shape changed', contentType: 'application/javascript' }) : route.continue());
  await p.goto(`http://${host}`);
  await p.getByTestId(`dialogs-agent-${id}`).click();
  await p.waitForTimeout(1500);
  assert.equal(await p.locator('html[data-paseo-tabs-close]').count(), 0);
  assert.equal(warnings.length, 1);
  const tab = p.getByTestId(`workspace-tab-agent_${id}`);
  await tab.hover();
  await p.getByTestId(`workspace-agent-close-${id}`).click();
  await p.waitForTimeout(500);
  assert.equal(inspect().Archived, true);
  console.log('PASS: changed module shape warns once, adds no interception, native idle close behavior remains');
} finally { await b.close(); }
