/** Full end-to-end verification of the rebuilt CineSync app. */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3001';
const OUT = process.env.OUT || __dirname;
const CSV = process.env.CSV;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, pass, detail) => checks.push({ name, pass, detail });

async function clickNav(page, label) {
  return page.evaluate((l) => {
    const navs = [
      document.querySelector('[aria-label="Primary"]'),
      document.querySelector('[aria-label="Primary mobile"]'),
    ].filter((n) => n && getComputedStyle(n).display !== 'none');
    for (const nav of navs) {
      const btn = [...nav.querySelectorAll('button')].find((b) => {
        const spans = [...b.querySelectorAll('span')].map((s) => s.textContent.trim());
        return b.textContent.trim() === l || spans.includes(l);
      });
      if (btn) { btn.click(); return true; }
    }
    return false;
  }, label);
}

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(3000);

  // 1. Markup lives in <body>, not <head>.
  const structure = await page.evaluate(() => ({
    headChildTags: [...document.head.children].map((e) => e.tagName),
    bodyDivs: document.body.querySelectorAll('div').length,
  }));
  ok('App markup is in <body>, <head> holds only metadata',
    structure.bodyDivs > 20 && !structure.headChildTags.includes('SECTION') &&
      !structure.headChildTags.includes('HEADER'),
    `body divs=${structure.bodyDivs}, head tags=${[...new Set(structure.headChildTags)].join(',')}`);

  // 2. Details modal shows the clicked item (the headline bug).
  const titles = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const res = [];
    for (const i of [0, 4, 9, 14]) {
      const cards = [...document.querySelectorAll('[aria-label^="Open details for"]')];
      if (!cards[i]) continue;
      const expected = cards[i].getAttribute('aria-label').replace('Open details for ', '');
      cards[i].click();
      await s(1200);
      const shown = document.querySelector('[role="dialog"] h1')?.textContent?.trim();
      res.push({ expected, shown });
      document.querySelector('[aria-label="Close"]')?.click();
      await s(1000);
    }
    return res;
  });
  ok('Details modal shows the clicked title',
    titles.length >= 3 && titles.every((t) => t.expected === t.shown) &&
      new Set(titles.map((t) => t.shown)).size === titles.length,
    titles.map((t) => t.shown).join(' | '));

  // 3. Trailer plays inside the modal, and closing destroys the iframe.
  await clickNav(page, 'Discover');
  await sleep(2500);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Watch Trailer'))?.click();
  });
  await sleep(4000);
  const trailer = await page.evaluate(() => {
    const dlg = document.querySelector('[aria-label="Trailer"]');
    const f = dlg?.querySelector('iframe');
    return { open: !!dlg, inModal: !!f, host: f ? new URL(f.src).host : null,
             locked: document.documentElement.style.overflow === 'hidden' };
  });
  await page.keyboard.press('Escape');
  await sleep(1500);
  const afterTrailer = await page.evaluate(() => ({
    closed: !document.querySelector('[aria-label="Trailer"]'),
    iframes: document.querySelectorAll('iframe').length,
    unlocked: document.documentElement.style.overflow === '',
  }));
  ok('Trailer opens in-modal on YouTube, Escape closes it and kills the iframe',
    trailer.open && trailer.inModal && trailer.host === 'www.youtube.com' && trailer.locked &&
      afterTrailer.closed && afterTrailer.iframes === 0 && afterTrailer.unlocked,
    JSON.stringify({ ...trailer, ...afterTrailer }));

  // 4. Every tab reachable and renders content.
  const tabs = {};
  for (const label of ['Movies', 'Anime', 'Arabic', 'Upcoming', 'Calendar', 'My Library', 'Settings', 'Discover']) {
    await clickNav(page, label);
    await sleep(3500);
    tabs[label] = await page.evaluate(() => {
      const main = document.querySelector('main');
      return {
        opacity: getComputedStyle(main.firstElementChild).opacity,
        len: main.innerText.length,
        heading: main.querySelector('h1')?.textContent?.trim() ?? '(hero)',
        errored: /Try again|Failed to load/.test(main.innerText),
      };
    });
  }
  ok('All eight tabs render visible content',
    Object.values(tabs).every((t) => t.len > 200 && t.opacity === '1' && !t.errored),
    Object.entries(tabs).map(([k, v]) => `${k}:${v.len}c/op${v.opacity}`).join(' '));

  // 5. Stremio proxy reaches api.strem.io for all three methods.
  const proxy = await page.evaluate(async () => {
    const call = async (m, b) => {
      const r = await fetch('/api/stremio/' + m, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
      });
      return { m, status: r.status, body: (await r.text()).slice(0, 90) };
    };
    return [
      await call('login', { email: 'nobody@example.invalid', password: 'x' }),
      await call('datastoreMeta', { authKey: 'bad', collection: 'libraryItem' }),
      await call('datastorePut', { authKey: 'bad', collection: 'libraryItem', changes: [] }),
    ];
  });
  ok('Stremio proxy reaches api.strem.io (login/datastoreMeta/datastorePut) — no 404s',
    proxy.every((p) => p.status === 200 && p.body.includes('error')),
    proxy.map((p) => `${p.m}=${p.status}`).join(' '));

  // 6. CSV parsing through the real UI.
  if (CSV && fs.existsSync(CSV)) {
    const csvText = fs.readFileSync(CSV, 'utf8');
    await clickNav(page, 'My Library');
    await sleep(2000);
    await page.evaluate(() => {
      localStorage.removeItem('cineSyncSources');
      // The top-nav account icon now opens sign-in, which is what an account
      // icon should do. Sources are reached from the Library tab's own button.
      [...document.querySelectorAll('button')]
        .find((b) => /add source/i.test(b.textContent))
        ?.click();
    });
    await sleep(1200);
    // CSV upload sits behind a disclosure — URL import is the primary path.
    await page.evaluate(() => {
      [...document.querySelectorAll('button')]
        .find((b) => /upload a CSV export/i.test(b.textContent))
        ?.click();
    });
    await sleep(400);
    const input = await page.$('#csv-upload');
    const tmp = path.join(OUT, '_upload.csv');
    fs.writeFileSync(tmp, csvText);
    await input.uploadFile(tmp);
    await sleep(2000);
    const csvResult = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('cineSyncSources') || '[]').find((x) => x.type === 'imdb_csv');
      return s ? { count: s.count, series: s.items.filter((i) => i.type === 'series').length,
                   allValid: s.items.every((i) => /^tt\d+$/.test(i.id) && i.title) } : null;
    });
    fs.unlinkSync(tmp);
    const expected = csvText.split(/\r?\n/).filter((l) => /^\d+,tt\d+/.test(l)).length;
    ok('IMDb CSV parses every data row (legacy always parsed 0)',
      csvResult && csvResult.count === expected && csvResult.allValid,
      `parsed ${csvResult?.count} / expected ${expected}, ${csvResult?.series} series, ids valid=${csvResult?.allValid}`);
  }

  // 7. Sync refuses to run without a Stremio account instead of silently "completing".
  await page.keyboard.press('Escape');
  await sleep(1200);
  await clickNav(page, 'My Library');
  await sleep(2000);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start Sync'))?.click();
  });
  await sleep(1500);
  const syncText = await page.evaluate(() => document.querySelector('main').innerText);
  /*
     Either wording passes. `useSync` tailors the reason three ways and which
     one appears depends on whether the CSV step above ran: with a list
     imported it is "Connect at least one Stremio account first"; on a
     genuinely empty profile it is "Connect a Stremio account and add an IMDb
     list first". Asserting only the former meant this failed whenever the
     suite ran without `CSV` set — testing the fixture rather than the app.
     What matters is that sync refuses, and says why.
  */
  const BLOCKED_REASON = /Connect (a|at least one) Stremio account/;
  ok('Sync blocks with a reason when no Stremio account is connected',
    /Nothing to sync/.test(syncText) && BLOCKED_REASON.test(syncText),
    syncText.split('\n').find((l) => BLOCKED_REASON.test(l)) ?? 'not found');

  ok('No console errors or page exceptions during the run', errors.length === 0,
    errors.slice(0, 3).join(' || ') || 'none');

  await page.screenshot({ path: path.join(OUT, 'final-desktop.png') });
  await browser.close();

  const failed = checks.filter((c) => !c.pass);
  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.detail}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => { console.error('HARNESS FAILED:', e.message); process.exit(2); });
