/**
 * Verification of the fourth round: slider motion, a background that is
 * actually visible and interactive, the rotating quote strip, and the Arabic
 * tab.
 *
 * The background checks are the reason this file exists. "The posters don't
 * appear" was diagnosed twice as a data problem and was neither time: the wall
 * was in the DOM with every image loaded, animating, at an effective opacity of
 * ~15% under the scrim. So the assertion here is not "the element exists" or
 * "the images loaded" — both were already true while the bug was live — but the
 * product of wall opacity, column opacity and scrim alpha, which is the number
 * that decides whether a human can see it.
 */
const puppeteer = require('puppeteer');
const BASE = process.env.BASE || 'http://localhost:3001';
const OUT = process.env.OUT || '.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (n, pass, detail) => {
  checks.push({ n, pass, detail });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + n + (detail ? '  -- ' + detail : ''));
};

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

async function waitFor(page, fn, { timeout = 45000, step = 500 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await page.evaluate(fn);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 180)); });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(5000);

  // ---- 1. motion flag reaches CSS ----
  const motionAttr = await page.evaluate(() => document.documentElement.dataset.motion);
  ok('data-motion stamped on <html>', motionAttr === 'full', 'value=' + motionAttr);

  // ---- 2. Background wall actually visible ----
  const bg = await page.evaluate(() => {
    const wall = document.querySelector('.bg-wall');
    const col = document.querySelector('.bg-wall-col');
    const imgs = [...document.querySelectorAll('.bg-wall img')];
    const wo = parseFloat(getComputedStyle(wall).opacity);
    const co = parseFloat(getComputedStyle(col).opacity);
    return {
      wallOpacity: wo,
      colOpacity: co,
      effective: +(wo * co * (1 - 0.34)).toFixed(3),
      loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      total: imgs.length,
    };
  });
  ok('poster wall visible (>25% effective at centre)', bg.effective > 0.25,
    'wall=' + bg.wallOpacity + ' col=' + bg.colOpacity + ' effective=' + bg.effective +
    ', ' + bg.loaded + '/' + bg.total + ' imgs loaded');

  // ---- 3. Wall animating ----
  const sample = () => page.evaluate(() => ({
    wall: getComputedStyle(document.querySelector('.bg-wall')).transform,
    track: getComputedStyle(document.querySelector('.bg-wall-track')).transform,
  }));
  const s1 = await sample();
  await sleep(1400);
  const s2 = await sample();
  ok('wall transform animates', s1.wall !== s2.wall, String(s1.wall).slice(0, 34) + ' -> ' + String(s2.wall).slice(0, 34));
  ok('marquee track animates', s1.track !== s2.track);

  // ---- 4. Wall reacts to pointer ----
  const colOps = () => page.evaluate(() => [...document.querySelectorAll('.bg-wall-col')].map((c) => +getComputedStyle(c).opacity));
  const before = await colOps();
  await page.mouse.move(200, 400);
  await sleep(300);
  await page.mouse.move(215, 420);
  await sleep(1800);
  const after = await colOps();
  const moved = before.some((v, i) => Math.abs(v - after[i]) > 0.03);
  ok('columns react to pointer proximity', moved,
    'rest=' + before[0]?.toFixed(2) + ' after=[' + after.map((v) => v.toFixed(2)).join(' ') + ']');

  // ---- 5. Discover hero slider ----
  const heroTitle = () => page.evaluate(() =>
    document.querySelector('section[aria-roledescription="carousel"] .glow-text')?.textContent?.trim());
  const t1 = await heroTitle();
  await page.evaluate(() => document.querySelector('button[aria-label="Next slide"]')?.click());
  await sleep(220);
  const midTransform = await page.evaluate(() => {
    // :not(.bg-background) skips the hero's opaque base layer, which carries
    // the same layout classes as the animated backdrop above it.
    const bd = document.querySelector('section[aria-roledescription="carousel"] .absolute.inset-0.z-0:not(.bg-background)');
    return bd ? getComputedStyle(bd).transform : null;
  });
  await sleep(1700);
  const t2 = await heroTitle();
  ok('Discover hero advances on arrow', !!t1 && !!t2 && t1 !== t2, t1 + ' -> ' + t2);
  ok('Discover hero backdrop transforms mid-transition', midTransform && midTransform !== 'none', String(midTransform).slice(0, 46));

  const dotFill = await page.evaluate(() => {
    const dots = [...document.querySelectorAll('button[aria-label^="Go to "]')];
    const active = dots.find((d) => d.getAttribute('aria-current') === 'true');
    const span = active?.querySelector('span');
    return span ? getComputedStyle(span).width : null;
  });
  ok('Discover hero active dot has progress fill', !!dotFill, 'width=' + dotFill);

  // ---- 6. Quote ticker ----
  const q1 = await page.evaluate(() => document.querySelector('blockquote p')?.textContent?.trim());
  const cite1 = await page.evaluate(() => document.querySelector('blockquote cite')?.textContent?.trim());
  ok('quote renders with citation', !!q1 && !!cite1, String(q1).slice(0, 46) + '... -- ' + cite1);
  await page.evaluate(() => document.querySelector('button[aria-label="Next quote"]')?.click());
  await sleep(1100);
  const q2 = await page.evaluate(() => document.querySelector('blockquote p')?.textContent?.trim());
  ok('quote rotates', q1 !== q2, String(q2).slice(0, 46) + '...');

  // ---- 7. Arabic tab ----
  ok('Arabic tab in nav', await nav(page, 'Arabic'));
  await sleep(1200);
  const railsReady = await waitFor(page, () => {
    const t = [...document.querySelectorAll('.carousel-title')].map((x) => x.textContent);
    return t.some((x) => /Films/i.test(x)) && document.querySelectorAll('.carousel img').length > 4;
  });
  ok('Arabic rails render', !!railsReady);

  const arab = await page.evaluate(() => ({
    titles: [...document.querySelectorAll('.carousel-title')].map((x) => x.textContent.trim().slice(0, 46)),
    cards: document.querySelectorAll('.carousel [role="button"]').length,
    chips: [...document.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent.trim()),
  }));
  ok('Arabic rails have cards', arab.cards > 8, arab.cards + ' cards; rails: ' + arab.titles.join(' | ').slice(0, 110));
  ok('country + genre chips present', arab.chips.length >= 24, arab.chips.length + ' chips');
  await page.screenshot({ path: OUT + '/after-arabic.png' });

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.includes('Morocco'));
    b?.click();
  });
  await sleep(7000);
  const ma = await page.evaluate(() => ({
    titles: [...document.querySelectorAll('.carousel-title')].map((x) => x.textContent.trim().slice(0, 34)),
    cards: document.querySelectorAll('.carousel [role="button"]').length,
  }));
  ok('country chip re-queries', ma.titles.some((t) => /Morocco/i.test(t)), ma.titles.join(' | ') + ' (' + ma.cards + ' cards)');

  // ---- 8. Upcoming hero ----
  await nav(page, 'Upcoming');
  await sleep(1200);
  ok('Upcoming hero renders', !!(await waitFor(page, () => !!document.querySelector('.hero-slide.active'))));
  const up = await page.evaluate(() => {
    const inactive = document.querySelector('.hero-slide:not(.active)');
    const vw = document.querySelector('.hero-slide.active .hero-video-wrapper');
    const dot = document.querySelector('.hero-dot.active');
    const pan = vw ? getComputedStyle(vw) : null;
    const dotCs = dot ? getComputedStyle(dot, '::after') : null;
    return {
      inactiveTransform: inactive ? getComputedStyle(inactive).transform : null,
      panAnim: pan ? pan.animationName : null,
      // Duration matters as much as the name. A blanket
      // `animation-duration: 0.01ms !important` reduced-motion reset had every
      // CSS animation in the app frozen while `animationName` still read
      // correctly — this suite passed on the name alone and missed it.
      panDuration: pan ? pan.animationDuration : null,
      dotAnim: dotCs ? dotCs.animationName : null,
      dotDuration: dotCs ? dotCs.animationDuration : null,
    };
  });
  ok('Upcoming inactive slide is offset (slides in)', up.inactiveTransform && up.inactiveTransform !== 'none', String(up.inactiveTransform).slice(0, 44));
  ok('Upcoming hero pan animation actually runs',
    up.panAnim === 'cs-hero-pan' && parseFloat(up.panDuration) > 1,
    up.panAnim + ' ' + up.panDuration);
  ok('Upcoming dot fill animation actually runs',
    up.dotAnim === 'cs-dot-fill' && parseFloat(up.dotDuration) > 1,
    up.dotAnim + ' ' + up.dotDuration);
  await page.screenshot({ path: OUT + '/after-upcoming.png' });

  // ---- 9. Background present on a tab that never feeds it ----
  await nav(page, 'Settings');
  await sleep(3000);
  const bgOnSettings = await page.evaluate(() => document.querySelectorAll('.bg-wall img').length);
  ok('poster wall present on Settings tab too', bgOnSettings > 0, bgOnSettings + ' imgs');
  await page.screenshot({ path: OUT + '/after-settings.png' });

  // ---- 10. Discover hero is opaque, not a window onto the poster wall ----
  await nav(page, 'Discover');
  await sleep(3000);
  await page.screenshot({ path: OUT + '/after-discover.png' });
  const hero = await page.evaluate(() => {
    const sec = document.querySelector('section[aria-roledescription="carousel"]');
    const base = sec.querySelector(':scope > .absolute.inset-0.z-0.bg-background');
    const img = sec.querySelector('img');
    const r = sec.getBoundingClientRect();
    return {
      baseBg: base ? getComputedStyle(base).backgroundColor : null,
      imgOpacity: img ? getComputedStyle(img).opacity : null,
      wallBehind: document
        .elementsFromPoint(r.left + r.width * 0.7, r.top + r.height * 0.25)
        .some((e) => e.closest && e.closest('.bg-wall')),
    };
  });
  ok('Discover hero sits on an opaque base', hero.baseBg === 'rgb(5, 5, 5)', 'base=' + hero.baseBg);
  ok('poster wall is not visible through the hero', !hero.wallBehind,
    'artwork opacity=' + hero.imgOpacity);

  // ---- 11. Animated glowing poster edges ----
  const ring = await page.evaluate(() => {
    const card = document.querySelector('.poster-glow');
    const cs = card ? getComputedStyle(card, '::after') : null;
    return cs && {
      count: document.querySelectorAll('.poster-glow').length,
      name: cs.animationName,
      duration: cs.animationDuration,
      masked: cs.maskImage !== 'none' || cs.webkitMaskImage !== 'none',
      clickThrough: cs.pointerEvents === 'none',
      delays: [...document.querySelectorAll('.poster-glow')]
        .slice(0, 6)
        .map((c) => getComputedStyle(c, '::after').animationDelay),
    };
  });
  ok('posters carry an edge ring that runs',
    !!ring && ring.name === 'cs-edge-spin' && parseFloat(ring.duration) > 1,
    ring ? ring.count + ' cards, ' + ring.name + ' ' + ring.duration : 'none');
  ok('ring is masked to the border and does not block clicks',
    !!ring && ring.masked && ring.clickThrough);
  ok('rings are staggered rather than pulsing in unison',
    !!ring && new Set(ring.delays).size > 1, ring ? ring.delays.join(' ') : '');

  const angleA = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.poster-glow'), '::after').getPropertyValue('--cs-edge-angle'));
  await sleep(900);
  const angleB = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.poster-glow'), '::after').getPropertyValue('--cs-edge-angle'));
  ok('edge light sweeps (@property interpolates the angle)', angleA !== angleB,
    angleA + ' -> ' + angleB);

  // ---- 12. Returning to a tab does not replay skeletons ----
  await nav(page, 'Settings');
  await sleep(1500);
  await page.evaluate(() => { window.__alive = true; });
  await page.evaluate(() => document.querySelector('button[aria-label="CineSync home"]').click());
  let skeleton = false;
  for (let i = 0; i < 14; i++) {
    if (await page.evaluate(() => !!document.querySelector('.animate-pulse.rounded-b-3xl'))) skeleton = true;
    await sleep(60);
  }
  const home = await page.evaluate(() => ({
    alive: window.__alive === true,
    hero: document.querySelector('section[aria-roledescription="carousel"] .glow-text')?.textContent?.trim() ?? null,
  }));
  ok('logo does not reload the document', home.alive);
  ok('logo returns to a populated Discover, no skeleton replay', !skeleton && !!home.hero,
    'skeleton=' + skeleton + ' hero=' + home.hero);

  console.log('\n--- page errors ---');
  console.log(errors.length ? errors.slice(0, 8).join('\n') : '(none)');

  const failed = checks.filter((c) => !c.pass);
  console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' passed');
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
