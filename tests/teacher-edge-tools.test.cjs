const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('/workspace/cloud-web-absensi/browser-tools/node_modules/playwright-core');
const BASE = process.env.WA_TEST_URL || 'http://127.0.0.1:8012/';
if (!['127.0.0.1', 'localhost'].includes(new URL(BASE).hostname)) throw Error('Local UI checks only');
const query = new URLSearchParams({ prodi: 'Pendidikan Teknologi Informasi', semester: '1', kelas: 'A', matkul: 'Edge tools UI' });
const ready = p => p.waitForFunction(() => document.documentElement.dataset.teacherPageState === 'ready' || (location.pathname.endsWith('music_player.php') && window.PresenTeacherGuide));
async function drag(p, selector, x, y, touch = false) {
  const r = await p.locator(selector).boundingBox(), sx = r.x + r.width / 2, sy = r.y + r.height / 2;
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (x - sx) * i / 8, y: sy + (y - sy) * i / 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(x, y, { steps: 8 }); await p.mouse.up();
  }
}
test('minimal guide and inspector open in one tap, drag with mouse/touch, persist across pages, and stay reachable after resize and print', { timeout: 75000 }, async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const c = await b.newContext({ viewport: { width: 393, height: 780 }, hasTouch: true });
    await c.route('**/*', r => new URL(r.request().url()).origin === new URL(BASE).origin ? r.continue() : r.abort());
    const p = await c.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE); await p.waitForFunction(() => window.WA);
    await p.evaluate(password => WA.login('teacher', { username: 'M.Fadillah', password }), fs.readFileSync('index.php', 'utf8').match(/\$pass === '([^']+)'/)[1]);
    const guide = '.wa-guide-open', inspector = '#inspectorToggleBtn';
    for (const name of ['index', 'data_siswa', 'absen', 'ujian', 'music_player']) {
      await p.goto(BASE + name + '.php?' + query); await ready(p); await p.waitForFunction(() => window.PresenEdgeTools && window.PresenTeacherGuide);
      assert.equal(await p.locator('.wa-guide-grip,.wa-guide-hide').count(), 0, 'no separate grip/hide buttons consume screen space');
      const r = await p.locator(guide).boundingBox(); assert.equal(r.width, 24); assert.equal(r.height, 48);
      await p.locator(guide).tap(); assert(await p.locator('.wa-guide-panel').isVisible(), name + ' guide opens in one tap');
      await p.locator('.wa-guide-close').tap();
    }
    await p.goto(BASE + 'absen.php?' + query); await ready(p);
    await p.evaluate(() => { if (!document.querySelector('#inspectorPanel').classList.contains('minimized')) toggleInspectorPanel(); });
    await drag(p, guide, 90, 210, true);
    assert.equal(await p.locator('.wa-guide-panel').isVisible(), false, 'touch drag does not open guide');
    assert.equal(await p.locator(guide).getAttribute('data-docked'), 'free');
    const savedGuide = await p.locator(guide).boundingBox();
    assert(Math.abs(savedGuide.x + 18 - 90) < 2 && Math.abs(savedGuide.y + 18 - 210) < 2);
    await drag(p, inspector, 190, 430);
    assert(await p.locator('#inspectorPanel').evaluate(e => e.classList.contains('minimized')), 'mouse drag does not open inspector');
    const savedInspector = await p.locator(inspector).boundingBox();
    await p.locator(inspector).tap();
    assert.equal(await p.locator('#inspectorPanel').evaluate(e => e.classList.contains('minimized')), false, 'next tap opens inspector');
    await p.evaluate(() => toggleInspectorPanel());
    await p.goto(BASE + 'ujian.php?' + query); await ready(p);
    await p.evaluate(() => { if (!document.querySelector('#inspectorPanel').classList.contains('minimized')) toggleInspectorPanel(); });
    assert.deepEqual(await p.locator(guide).boundingBox(), savedGuide);
    assert.deepEqual(await p.locator(inspector).boundingBox(), savedInspector);
    await p.locator(guide).tap(); assert(await p.locator('.wa-guide-panel').isVisible()); await p.keyboard.press('Escape');
    await p.locator(inspector).tap(); assert.equal(await p.locator('#inspectorPanel').evaluate(e => e.classList.contains('minimized')), false); await p.evaluate(() => toggleInspectorPanel());
    await drag(p, guide, 5, 270, true); assert.equal(await p.locator(guide).getAttribute('data-docked'), 'left');
    await p.reload(); await ready(p); assert.equal(await p.locator(guide).getAttribute('data-docked'), 'left');
    await p.evaluate(() => { if (!document.querySelector('#inspectorPanel').classList.contains('minimized')) toggleInspectorPanel(); });
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1366, height: 900 }]) {
      await p.setViewportSize(viewport);
      for (const selector of [guide, inspector]) {
        const r = await p.locator(selector).boundingBox();
        assert(r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width + 1 && r.y + r.height <= viewport.height + 1, selector + ' remains inside viewport');
      }
    }
    await p.locator(inspector).focus(); await p.keyboard.press('Home');
    assert.equal(await p.locator(inspector).getAttribute('data-docked'), 'right');
    await p.keyboard.press('ArrowLeft'); assert.equal(await p.locator(inspector).getAttribute('data-docked'), 'free');
    await p.setViewportSize({ width: 393, height: 780 });
    await p.screenshot({ path: 'tests/results/edge-tools-mobile.png' });
    await p.emulateMedia({ media: 'print' });
    assert.equal(await p.locator(guide).isVisible(), false); assert.equal(await p.locator(inspector).isVisible(), false);
    assert.deepEqual(errors, []);
  } finally { await b.close(); }
});
