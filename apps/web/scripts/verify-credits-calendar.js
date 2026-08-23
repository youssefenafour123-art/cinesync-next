/**
 * Verification of the two features added on top of the release calendar:
 *
 *   1. Details modal shows a writing credit alongside the directing one, and
 *      an episode total for a series.
 *   2. Any day in the calendar grid opens a full-size modal listing what airs
 *      that date — including days with nothing on them.
 */
const puppeteer = require('puppeteer');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.OUT || __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (n, pass, detail) => checks.push({ n, pass, detail });

async function nav(page, label) {
  return page.evaluate((l) => {
    const navs = [
      document.querySelector('[aria-label="Primary"]'),
      document.querySelector('[aria-label="Primary mobile"]'),
    ].filter((n) => n && getComputedStyle(n).display !== 'none');
    for (const nv of navs) {
      const b = [...nv.querySelectorAll('button')].find((x) => {
        const spans = [...x.querySelectorAll('span')].map((s) => s.textContent.trim());
        return x.textContent.trim() === l || spans.includes(l);
      });
      if (b) { b.click(); return true; }
    }
    return false;
  }, label);
}

/** Poll a page predicate until it's truthy — replaces guessed sleeps. */
async function waitFor(page, fn, arg, { timeout = 30000, step = 400 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await page.evaluate(fn, arg);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

/** The labelled fields in the details modal's credit row, as {label: value}. */
function readCredits() {
  const dlg = [...document.querySelectorAll('[role="dialog"]')]
    .filter((d) => (d.getAttribute('aria-label') || '').startsWith('Details for'))
    .pop();
  if (!dlg) return null;
  const row = [...dlg.querySelectorAll('div')].find(
    (d) => d.className.includes('border-b') && d.className.includes('flex-wrap'),
  );
  if (!row) return { title: dlg.querySelector('h1')?.textContent?.trim(), fields: {} };
  const fields = {};
  for (const cell of row.children) {
    const label = cell.querySelector('span')?.textContent?.trim();
    const value = cell.textContent.trim().slice(label ? label.length : 0).trim();
    // The headings are uppercased by CSS, not in the text — key on the
    // uppercase form so the assertions don't depend on the styling.
    if (label) fields[label.toUpperCase()] = value;
  }
  return { title: dlg.querySelector('h1')?.textContent?.trim(), fields };
}

/** Opens a title from the search modal and waits for the details to fill in. */
async function openTitle(page, query, expectField) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.getAttribute('aria-label') || '').toLowerCase().includes('search'),
    );
    if (btn) btn.click();
  });
  await sleep(600);

  await page.evaluate((q) => {
    const el = document.querySelector('[role="dialog"] input');
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el), 'value',
    ).set;
    setter.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);

  // Wait for a result whose title matches, then click it.
  const clicked = await waitFor(page, (q) => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')].pop();
    if (!dlg) return false;
    const hit = [...dlg.querySelectorAll('button')].find((b) =>
      b.textContent.trim().toLowerCase().startsWith(q.toLowerCase()),
    );
    if (!hit) return false;
    hit.click();
    return true;
  }, query);
  if (!clicked) return null;

  // The modal opens with list data and fills in from /api/enrich a beat later.
  await waitFor(page, (f) => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')]
      .filter((d) => (d.getAttribute('aria-label') || '').startsWith('Details for'))
      .pop();
    return dlg ? dlg.textContent.includes(f) : false;
  }, expectField);

  const credits = await page.evaluate(readCredits);

  await page.keyboard.press('Escape');
  await sleep(400);
  await page.keyboard.press('Escape');
  await sleep(400);
  return credits;
}

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(3000);

  /* ---- 1. Writing credit on a film ---------------------------------- */

  const film = await openTitle(page, 'Interstellar', 'Jonathan Nolan');
  const filmFields = (film && film.fields) || {};
  ok(
    'film shows a directing credit',
    filmFields.DIRECTOR === 'Christopher Nolan',
    JSON.stringify(filmFields.DIRECTOR),
  );
  ok(
    'film shows a writing credit, separate from the director',
    /Jonathan Nolan/.test(filmFields.WRITERS || filmFields.SCREENPLAY || ''),
    JSON.stringify(filmFields.WRITERS || filmFields.SCREENPLAY),
  );
  ok('film shows no episode count', !('EPISODES' in filmFields), Object.keys(filmFields).join('|'));

  /* ---- 2. Episode total on a series --------------------------------- */

  const series = await openTitle(page, 'Breaking Bad', 'Episodes');
  const seriesFields = (series && series.fields) || {};
  ok(
    'series shows its creator, not a director',
    seriesFields.CREATOR === 'Vince Gilligan',
    JSON.stringify(seriesFields.CREATOR),
  );
  ok(
    'series shows the episode total across seasons',
    /62/.test(seriesFields.EPISODES || '') && /5 seasons/.test(seriesFields.EPISODES || ''),
    JSON.stringify(seriesFields.EPISODES),
  );
  ok(
    'series does not print the creator twice under a Writer heading',
    !('WRITER' in seriesFields) && !('WRITERS' in seriesFields),
    Object.keys(seriesFields).join('|'),
  );

  /* ---- 3. Calendar: a busy day opens the full-size modal ------------ */

  await nav(page, 'Calendar');
  await sleep(1000);

  const gridReady = await waitFor(page, () =>
    document.querySelectorAll('button[aria-label*="releases"]').length > 0);
  ok('calendar grid rendered with busy days', !!gridReady);

  const busyDay = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('button[aria-label*="releases"]')]
      .filter((b) => !/, 0 releases/.test(b.getAttribute('aria-label')))[0];
    if (!cell) return null;
    const label = cell.getAttribute('aria-label');
    cell.click();
    return label;
  });
  await sleep(900);

  const dayModal = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')]
      .filter((d) => (d.getAttribute('aria-label') || '').startsWith('Releases on'))
      .pop();
    if (!dlg) return null;
    const box = dlg.querySelector('div.relative.flex').getBoundingClientRect();
    return {
      label: dlg.getAttribute('aria-label'),
      heading: dlg.querySelector('h2')?.textContent?.trim(),
      articles: dlg.querySelectorAll('article').length,
      // Every episode line in the modal, to prove they are no longer truncated.
      episodeLines: dlg.querySelectorAll('article ul li').length,
      width: Math.round(box.width),
      height: Math.round(box.height),
      hasFullDetails: /Full details/.test(dlg.textContent),
    };
  });

  ok('clicking a day opens a modal', !!dayModal, busyDay);
  ok(
    'the modal is materially bigger than the 116px grid cell',
    dayModal && dayModal.width > 700 && dayModal.height > 400,
    dayModal && `${dayModal.width}x${dayModal.height}`,
  );
  ok(
    'the modal lists the releases for that day',
    dayModal && dayModal.articles > 0,
    dayModal && `${dayModal.articles} entries, ${dayModal.episodeLines} episode lines`,
  );
  ok('each release links through to full details', dayModal && dayModal.hasFullDetails);

  await page.screenshot({ path: path.join(OUT, 'calendar-day-modal.png') });

  /* ---- 4. Day stepping, and opening details from inside it ---------- */

  const stepped = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')]
      .filter((d) => (d.getAttribute('aria-label') || '').startsWith('Releases on'))
      .pop();
    const before = dlg.getAttribute('aria-label');
    const next = dlg.querySelector('button[aria-label="Next day"]');
    if (!next || next.disabled) return { before, moved: false };
    next.click();
    return { before, moved: true };
  });
  await sleep(700);
  const afterStep = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')]
      .filter((d) => (d.getAttribute('aria-label') || '').startsWith('Releases on'))
      .pop();
    return dlg ? dlg.getAttribute('aria-label') : null;
  });
  ok(
    'the next-day arrow moves the modal to another date',
    !stepped.moved || (afterStep && afterStep !== stepped.before),
    `${stepped.before} → ${afterStep}`,
  );

  const stacked = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')]
      .filter((d) => (d.getAttribute('aria-label') || '').startsWith('Releases on'))
      .pop();
    const btn = [...dlg.querySelectorAll('button')].find((b) =>
      /Full details/.test(b.textContent),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  await sleep(1200);

  const stackOrder = await page.evaluate(() => {
    const z = (prefix) => {
      const d = [...document.querySelectorAll('[role="dialog"]')]
        .filter((x) => (x.getAttribute('aria-label') || '').startsWith(prefix))
        .pop();
      return d ? Number(getComputedStyle(d).zIndex) : null;
    };
    return { details: z('Details for'), day: z('Releases on') };
  });
  ok(
    'details opened from the day modal paint on top of it',
    !stacked || (stackOrder.details && stackOrder.day && stackOrder.details > stackOrder.day),
    JSON.stringify(stackOrder),
  );

  // Escape peels one layer: details closes, the day modal is still there.
  await page.keyboard.press('Escape');
  await sleep(600);
  const backToDay = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"]')].some((d) =>
      (d.getAttribute('aria-label') || '').startsWith('Releases on'),
    ));
  ok('closing details returns to the day you came from', backToDay);

  await page.keyboard.press('Escape');
  await sleep(600);

  /* ---- 5. An empty day is clickable and says so --------------------- */

  const emptyDay = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('button[aria-label*="nothing scheduled"]')][0];
    if (!cell) return null;
    if (cell.disabled) return 'disabled';
    cell.click();
    return cell.getAttribute('aria-label');
  });
  await sleep(800);

  const emptyModal = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')]
      .filter((d) => (d.getAttribute('aria-label') || '').startsWith('Releases on'))
      .pop();
    return dlg ? dlg.textContent : null;
  });
  ok('empty days are still clickable', emptyDay && emptyDay !== 'disabled', emptyDay);
  ok(
    'an empty day says nothing releases, rather than showing an empty box',
    emptyModal && /Nothing releases on this day/.test(emptyModal),
  );

  // The page behind must scroll again once every modal is gone.
  await page.keyboard.press('Escape');
  await sleep(600);
  const unlocked = await page.evaluate(
    () => document.documentElement.style.overflow !== 'hidden',
  );
  ok('the page scroll lock is released after closing', unlocked);

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();

  let failed = 0;
  for (const c of checks) {
    if (!c.pass) failed++;
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.n}${c.detail ? `  — ${c.detail}` : ''}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
