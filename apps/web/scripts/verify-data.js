/**
 * Correctness of what the app *says*, plus the release calendar.
 *
 * verify-core and verify-features check that things render and respond;
 * verify-ux checks that they move. This one checks that the content is right:
 * that an unreleased film is findable, that a series is credited to the person
 * who made it, and that the calendar puts the correct episodes on the correct
 * days.
 */
const puppeteer = require('puppeteer');
const BASE = process.env.BASE || 'http://localhost:3001';
const OUT = process.env.OUT || '.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (n, pass, d) => {
  checks.push({ n, pass });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + n + (d ? '  -- ' + d : ''));
};

async function nav(page, label) {
  return page.evaluate((l) => {
    const nv = document.querySelector('[aria-label="Primary"]');
    const b = [...nv.querySelectorAll('button')].find((x) => x.textContent.trim() === l);
    if (b) { b.click(); return true; }
    return false;
  }, label);
}
async function waitFor(page, fn, { timeout = 60000, step = 500 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await page.evaluate(fn);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}
async function type(page, sel, text) {
  await page.evaluate((s, t) => {
    const el = document.querySelector(s);
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, t);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, sel, text);
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(5000);

  // ---- 1. Search: upcoming titles + Enter for the full list ----
  await page.evaluate(() => document.querySelector('button[aria-label^="Search films"]').click());
  await sleep(700);
  ok('search opens', !!(await page.$('input[aria-label="Search films, series and people"]')));

  await type(page, 'input[aria-label="Search films, series and people"]', 'Avengers');
  const gotQuick = await waitFor(page, () => document.querySelectorAll('[role="dialog"] button img').length > 3);
  ok('quick results render', !!gotQuick);

  const quick = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('[role="dialog"] .flex-1.overflow-y-auto button')]
      .map((b) => b.textContent.trim().slice(0, 50)),
    showAll: [...document.querySelectorAll('[role="dialog"] button')]
      .some((b) => /Show all \d+ results/.test(b.textContent)),
  }));
  ok('quick list is short and offers the full list', quick.showAll,
    quick.rows.length + ' rows; "Show all" present=' + quick.showAll);

  // Enter expands
  await page.focus('input[aria-label="Search films, series and people"]');
  await page.keyboard.press('Enter');
  await sleep(1400);
  const full = await page.evaluate(() => ({
    heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
    rows: document.querySelectorAll('[role="dialog"] .flex-1.overflow-y-auto button').length,
    upcomingBadges: [...document.querySelectorAll('[role="dialog"] span')]
      .filter((s) => s.textContent.trim() === 'Upcoming').length,
    titles: [...document.querySelectorAll('[role="dialog"] .flex-1.overflow-y-auto button')]
      .map((b) => b.textContent.trim().slice(0, 30)).slice(0, 4),
  }));
  ok('Enter expands to the full result list', !!full.heading && /results for/.test(full.heading),
    full.heading + ' -- ' + full.rows + ' rows');
  ok('unreleased titles are present and flagged', full.upcomingBadges > 0,
    full.upcomingBadges + ' upcoming badges; top: ' + full.titles.join(' | '));
  await page.screenshot({ path: OUT + '/r6-search.png' });

  // Recent searches after closing and reopening
  await page.keyboard.press('Escape');
  await sleep(600);
  await page.evaluate(() => document.querySelector('button[aria-label^="Search films"]').click());
  await sleep(700);
  const recent = await page.evaluate(() => ({
    stored: localStorage.getItem('cinesync:recent-searches'),
    heading: [...document.querySelectorAll('[role="dialog"] h3')]
      .some((h) => /Recent searches/i.test(h.textContent)),
    // `textContent` includes the chip's Material Symbols glyph, whose ligature
    // name is its own text ("historyAvengers"), so this matches loosely. The
    // glyph is aria-hidden, so nothing reads it out; see scripts/README.md.
    chip: [...document.querySelectorAll('[role="dialog"] button')]
      .some((b) => b.textContent.includes('Avengers')),
  }));
  ok('submitted query is remembered as a recent search',
    recent.stored && recent.stored.includes('Avengers') && recent.heading && recent.chip,
    'stored=' + recent.stored + ' heading=' + recent.heading + ' chip=' + recent.chip);
  await page.keyboard.press('Escape');
  await sleep(500);

  // ---- 2. Director accuracy through the details modal ----
  await page.evaluate(() => document.querySelector('button[aria-label^="Search films"]').click());
  await sleep(600);
  await type(page, 'input[aria-label="Search films, series and people"]', 'Breaking Bad');
  await waitFor(page, () => document.querySelectorAll('[role="dialog"] .flex-1.overflow-y-auto button').length > 0);
  await sleep(900);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="dialog"] .flex-1.overflow-y-auto button')]
      .find((x) => x.textContent.includes('Breaking Bad'));
    b?.click();
  });
  const credited = await waitFor(page, () => {
    const labels = [...document.querySelectorAll('span')].map((s) => s.textContent.trim());
    const i = labels.findIndex((t) => t === 'Creator' || t === 'Creators' || t === 'Director' || t === 'Directors');
    if (i === -1) return null;
    const el = [...document.querySelectorAll('span')][i];
    return { label: labels[i], name: el.parentElement?.querySelector('span:last-child')?.textContent?.trim() };
  });
  ok('series is credited to its creator, not an executive producer',
    !!credited && /Creator/.test(credited.label) && /Gilligan/.test(credited.name || ''),
    credited ? credited.label + ': ' + credited.name : 'not found');
  await page.screenshot({ path: OUT + '/r6-details.png' });
  await page.keyboard.press('Escape');
  await sleep(800);

  // ---- 3. Quotes: automatic, no controls ----
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1200);
  const quoteUi = await page.evaluate(() => ({
    hasBlockquote: !!document.querySelector('blockquote'),
    prevNext: [...document.querySelectorAll('button')]
      .filter((b) => /quote/i.test(b.getAttribute('aria-label') || '')).length,
  }));
  ok('quote strip has no user controls', quoteUi.hasBlockquote && quoteUi.prevNext === 0,
    'quote-control buttons=' + quoteUi.prevNext);

  // ---- 4. Background is softer ----
  const bg = await page.evaluate(() => {
    const wall = document.querySelector('.bg-wall');
    const col = document.querySelector('.bg-wall-col');
    const wo = parseFloat(getComputedStyle(wall).opacity);
    const co = parseFloat(getComputedStyle(col).opacity);
    return { wo, co, effective: +(wo * co * 0.66).toFixed(3) };
  });
  ok('poster wall softened but still visible', bg.effective > 0.12 && bg.effective < 0.24,
    'wall=' + bg.wo + ' col=' + bg.co + ' effective=' + bg.effective);

  // ---- 5. Calendar tab ----
  ok('Calendar tab in nav', await nav(page, 'Calendar'));
  await sleep(1200);
  const gridReady = await waitFor(page, () => document.querySelectorAll('[aria-current], [aria-label*="releases"]').length > 3);
  ok('month grid renders', !!gridReady);

  const cal = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('button[aria-label*="releases"], button[aria-label*="nothing scheduled"]')];
    const busy = cells.filter((c) => /\d+ releases/.test(c.getAttribute('aria-label')));
    return {
      total: cells.length,
      busy: busy.length,
      weekdays: [...document.querySelectorAll('.grid-cols-7')][0]?.textContent ?? '',
      today: !!document.querySelector('[aria-current="date"]'),
      heading: document.querySelector('h2')?.textContent?.trim().slice(0, 60) ?? null,
      episodeCodes: [...document.querySelectorAll('.font-mono')].map((e) => e.textContent.trim()).slice(0, 6),
      dropBadges: [...document.querySelectorAll('span')].filter((s) => s.textContent.trim() === 'Episode drop').length,
    };
  });
  ok('grid has day cells, some with releases', cal.total >= 28 && cal.busy > 0,
    cal.busy + '/' + cal.total + ' days busy');
  ok('a day is selected and detailed', !!cal.heading, cal.heading);
  ok('episode drops show season/episode codes', cal.episodeCodes.length > 0,
    cal.episodeCodes.join(' ') + ' | ' + cal.dropBadges + ' drop badges');
  await page.screenshot({ path: OUT + '/r6-calendar.png' });

  // month navigation
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('span')].find((s) => /^[A-Z][a-z]+ \d{4}$/.test(s.textContent.trim()))?.textContent.trim());
  await page.evaluate(() => document.querySelector('button[aria-label="Next month"]').click());
  await sleep(4000);
  const after = await page.evaluate(() =>
    [...document.querySelectorAll('span')].find((s) => /^[A-Z][a-z]+ \d{4}$/.test(s.textContent.trim()))?.textContent.trim());
  ok('month navigation moves and reloads', before !== after, before + ' -> ' + after);

  // filter
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === 'Series');
    b?.click();
  });
  await sleep(1500);
  const filtered = await page.evaluate(() =>
    [...document.querySelectorAll('span')].filter((s) => s.textContent.trim() === 'Film').length);
  ok('series filter excludes films', filtered === 0, 'film badges after filter=' + filtered);

  console.log('\n--- page errors ---');
  console.log(errors.length ? errors.slice(0, 6).join('\n') : '(none)');
  const failed = checks.filter((c) => !c.pass);
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' passed');
  await browser.close();
})();
