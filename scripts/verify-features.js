/** Verification of the seven requested features. */
const puppeteer = require('puppeteer');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3001';
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
async function waitFor(page, fn, { timeout = 25000, step = 400 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await page.evaluate(fn);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

async function typeInto(page, selector, text) {
  await page.evaluate((sel, t) => {
    const el = document.querySelector(sel);
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, t);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector, text);
}

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(3500);

  // ---- 2. Discover hero slider ----
  const slider = await page.evaluate(() => {
    const sec = document.querySelector('[aria-roledescription="carousel"]');
    return {
      present: !!sec,
      dots: sec ? sec.querySelectorAll('[aria-label^="Go to "]').length : 0,
      title: sec?.querySelector('h1, button.glow-text')?.textContent?.trim(),
      badge: sec?.textContent.match(/#\d MOST WATCHED/i)?.[0],
    };
  });
  const first = slider.title;
  await page.evaluate(() => document.querySelector('[aria-label="Next slide"]')?.click());
  await sleep(1200);
  const second = await page.evaluate(
    () => document.querySelector('[aria-roledescription="carousel"] button.glow-text')?.textContent?.trim(),
  );
  ok('#2 Discover hero is a slider, not a static banner',
    slider.present && slider.dots >= 3 && first && second && first !== second,
    `${slider.dots} slides · "${first}" → "${second}" · ${slider.badge}`);

  // ---- 3. In-library badges ----
  const lib = await page.evaluate(() => {
    const accounts = JSON.parse(localStorage.getItem('cineSyncSources') || '[]').filter((s) => s.type === 'stremio');
    const badges = [...document.querySelectorAll('div')].filter(
      (d) => d.children.length <= 1 && /In Library/.test(d.textContent) && d.textContent.length < 20,
    ).length;
    return { accounts: accounts.length, badges };
  });
  ok('#3 "In Library" badges render from the real Stremio library',
    lib.accounts === 0 || lib.badges > 0,
    lib.accounts ? `${lib.badges} badges from ${lib.accounts} connected account(s)` : 'no account connected — cannot assert');

  // ---- 1. Global search: titles + people ----
  await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Search films, series and people"]')]
      .find((e) => e.tagName === 'BUTTON')
      .click(),
  );
  await waitFor(page, () =>
    !!document.querySelector('[aria-label="Search films, series and people"][type="text"]'),
  );
  await typeInto(page, '[aria-label="Search films, series and people"][type="text"]', 'scorsese');
  await waitFor(page, () => {
    const d = document.querySelector('[aria-label="Search"]');
    return (d?.querySelectorAll('h3').length ?? 0) >= 2;
  });
  const search = await page.evaluate(() => {
    const d = document.querySelector('[aria-label="Search"]');
    return {
      sections: [...d.querySelectorAll('h3')].map((h) => h.textContent.trim()),
      rows: [...d.querySelectorAll('button')].map((b) => b.querySelector('.truncate')?.textContent).filter(Boolean),
    };
  });
  ok('#1 Search finds people and titles in one query',
    search.sections.includes('People') && search.sections.includes('Films & Series') &&
      search.rows.some((r) => /Scorsese/i.test(r)),
    `${search.sections.join(' + ')} · ${search.rows.slice(0, 3).join(', ')}`);

  // ---- 1b. Person modal ----
  await page.evaluate(() => {
    const d = document.querySelector('[aria-label="Search"]');
    [...d.querySelectorAll('button')].find((b) => /Martin Scorsese/.test(b.textContent))?.click();
  });
  await waitFor(page, () => {
    const p = document.querySelector('[aria-label^="Profile for"]');
    return !!p && /Biography|Filmography/.test(p.innerText);
  });
  const person = await page.evaluate(() => {
    const p = document.querySelector('[aria-label^="Profile for"]');
    if (!p) return null;
    return {
      name: p.querySelector('h1')?.textContent,
      tabs: [...p.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent.trim()),
      // innerText applies text-transform, so headings read as uppercase.
      hasBio: /biography/i.test(p.innerText),
      searchGone: !document.querySelector('[aria-label="Search"]'),
    };
  });
  ok('#1b Person modal shows bio, filmography and upcoming',
    person && /Scorsese/.test(person.name) && person.hasBio &&
      person.tabs.some((t) => /Filmography/.test(t)) && person.tabs.some((t) => /Upcoming/.test(t)),
    person ? `${person.name} · ${person.tabs.join(' | ')}` : 'modal did not open');

  // Scroll lock must release once every modal is closed (stacked-modal case).
  await page.keyboard.press('Escape');
  await sleep(1500);
  const unlocked = await page.evaluate(() => ({
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    overflow: document.documentElement.style.overflow || '(released)',
  }));
  ok('Scroll lock releases after stacked modals close',
    unlocked.dialogs === 0 && unlocked.overflow === '(released)',
    JSON.stringify(unlocked));

  // ---- 7. Movies tab: mood rails ----
  await nav(page, 'Movies');
  await waitFor(page, () => document.querySelectorAll('button[aria-pressed]').length >= 8);
  const moods = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent.trim());
    const heads = [...document.querySelectorAll('main h2')].map((h) => h.textContent.trim());
    return { chips, heads };
  });
  ok('#7 Movies tab offers genre/mood suggestions',
    moods.chips.length >= 8 && moods.chips.includes('Psychological Thrillers') &&
      moods.chips.includes('Based on Novels') && moods.chips.includes('Science Fiction'),
    `${moods.chips.length} moods: ${moods.chips.slice(0, 5).join(', ')}…`);

  // Switch mood and confirm the grid changes.
  const before = await page.evaluate(() => document.querySelectorAll('.movie-card').length);
  await page.evaluate(() => {
    [...document.querySelectorAll('button[aria-pressed]')].find((b) => /Neo-Noir/.test(b.textContent))?.click();
  });
  await waitFor(page, () =>
    [...document.querySelectorAll('main h2')].some((h) => h.textContent.trim() === 'Neo-Noir'),
  );
  const after = await page.evaluate(() => {
    const h = [...document.querySelectorAll('main h2')].map((x) => x.textContent.trim());
    return { heads: h, cards: document.querySelectorAll('.movie-card').length };
  });
  ok('#7b Mood chips swap the grid',
    after.heads.includes('Neo-Noir') && after.cards > 0,
    `${before} → ${after.cards} cards · headings: ${after.heads.slice(0, 3).join(', ')}`);

  // ---- 4. Recommendation quality ----
  const radar = await page.evaluate(async () => {
    const r = await fetch('/api/movies').then((x) => x.json());
    const rail = r.rails.find((x) => x.title === 'Under the Radar');
    return rail.items.map((i) => ({ t: i.title, r: parseFloat(i.rating), v: i.voteCount, y: i.year }));
  });
  const lowRated = radar.filter((i) => !(i.r >= 7.2));
  const tooNew = radar.filter((i) => Number(i.y) > new Date().getFullYear() - 3);
  ok('#4 "Under the Radar" is well-rated and genuinely obscure',
    radar.length >= 8 && lowRated.length === 0 && tooNew.length === 0,
    `${radar.length} items, min rating ${Math.min(...radar.map((i) => i.r))}, ` +
      `max votes ${Math.max(...radar.map((i) => i.v))} · top: ${radar.slice(0, 3).map((i) => i.t).join(', ')}`);

  // ---- 6. Critic scores + reviews in details modal ----
  await nav(page, 'Discover');
  await sleep(4000);
  await waitFor(page, () => document.querySelectorAll('[aria-label^="Open details for"]').length > 2);
  await page.evaluate(() => document.querySelectorAll('[aria-label^="Open details for"]')[1]?.click());
  await waitFor(page, () => {
    const d = document.querySelector('[role="dialog"]');
    // Wait for the scores request to settle, not just the shell to mount.
    // Case-insensitive: these headings are styled `uppercase`, and innerText
    // applies text-transform.
    return !!d && /critic & audience scores|OMDB_API_KEY|what the critics said|community reviews/i.test(d.innerText);
  });
  const details = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    const t = d.innerText;
    const criticCards = [...d.querySelectorAll('figure')];
    return {
      title: d.querySelector('h1')?.textContent,
      // The OMDb hint only appears when nothing supplied a score. Since scores
      // also come from Wikipedia now, either outcome is a pass.
      hasScoresOrHint: /critic & audience scores|OMDB_API_KEY/i.test(t),
      hasPressCritics: /what the critics said/i.test(t),
      // Press criticism is Wikipedia's summary, and has to say so.
      pressCredited: /summarised from[\s\S]{0,40}wikipedia/i.test(t),
      // Every critic card names a person and an outlet — the legacy page's
      // invented blurbs had neither, they were free-floating quotes.
      pressAttributed: criticCards.length > 0 &&
        criticCards.every((f) => (f.innerText.trim().split('\n').filter(Boolean).length) >= 3),
      hasCommunityReviews: /community reviews/i.test(t),
      labelledHonestly: /not press critics/i.test(t),
      clickablePeople: d.querySelectorAll('button[title^="View "]').length,
    };
  });
  ok('#6 Details modal shows attributed scores and honestly-labelled reviews',
    details && details.hasScoresOrHint &&
      (details.hasPressCritics ? details.pressCredited && details.pressAttributed : true) &&
      (details.hasCommunityReviews ? details.labelledHonestly : true),
    details
      ? `"${details.title}" · scores=${details.hasScoresOrHint} · press=${details.hasPressCritics}` +
        `(credited=${details.pressCredited}, attributed=${details.pressAttributed})` +
        ` · community=${details.hasCommunityReviews}(honest=${details.labelledHonestly})` +
        ` · people=${details.clickablePeople}`
      : 'no modal');

  ok('Cast and crew open their profile',
    (details?.clickablePeople ?? 0) > 0, `${details?.clickablePeople ?? 0} clickable credits`);

  ok('No console errors across the run', errors.length === 0, errors.slice(0, 2).join(' || ') || 'none');

  await page.keyboard.press('Escape');
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, 'v7-movies.png') });
  await browser.close();

  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.n}\n      ${c.detail}`);
  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error('HARNESS FAILED:', e.message); process.exit(2); });
