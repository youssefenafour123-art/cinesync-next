# CineSync

Discover movies and anime, then sync your IMDb watchlist into your Stremio library.

A Next.js rebuild of the original single-file `index.html` + `server.js` app that lived in
`../imdb to stremio`. Same six tabs, same OLED-black/emerald design — rebuilt so the
features actually work.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

No API key setup required. `TMDB_API_KEY` in `.env.local` is optional; without it the
app falls back to the key the original carried. Either way TMDB is only ever called from
the server, so the key never reaches the browser. `OMDB_API_KEY` is optional too — see
[Ratings and critics](#ratings-and-critics).

## Stack

| | |
|---|---|
| Next.js 16 (App Router, TypeScript) | pages + the API layer |
| Tailwind CSS v4 | design tokens live in `app/globals.css` under `@theme` |
| Framer Motion | React-lifecycle animation — modals, tab fades, staggers, counters |
| GSAP + ScrollTrigger | continuous/imperative animation — scroll reveals, card tilt, background drift, progress ring |
| Zustand | UI state (`store/useAppStore`) and persisted sources (`store/useSourcesStore`) |

## Layout

```
app/
  page.tsx                     tab shell
  layout.tsx                   fonts, <body>, metadata
  globals.css                  @theme tokens + component classes
  api/
    stremio/[...path]/route.ts POST proxy → api.strem.io (Origin spoof)
    discover|movies|anime|tracker/route.ts
    anime/search/route.ts
    meta/[type]/[id]/route.ts
components/{layout,tabs,modals,ui}/
lib/                           tmdb, cinemeta, stremio, csv, hooks
store/                         zustand stores
```

### Why the app has its own API routes

The original fetched TMDB and Cinemeta directly from the browser, one request per card
plus a rating lookup per card — roughly 160 requests to paint the Anime tab, none cached.
Those fetches now happen in route handlers with `revalidate: 3600`, so each tab is a
single cached request.

### The Stremio proxy

`api.strem.io` validates the `Origin` header server-side and silently rejects anything
that isn't the Stremio web app, so browser calls have to be relayed. Everything goes
through `/api/stremio/<method>` — `login`, `datastorePut`, `datastoreGet`,
`datastoreMeta`.

Your Stremio password is sent to Stremio through that proxy and is never stored. Only the
returned `authKey` is kept, in `localStorage`.

## Data

`localStorage` keys are unchanged from the original (`cineSyncSources`,
`cineSyncHistory`), so anything the old app saved still loads here.

| Tab | Source |
|---|---|
| Discover | Cinemeta top movies + series |
| Movies | TMDB discover — cult classics, modern masterpieces, under the radar |
| Anime | TMDB discover, genre 16 + Japanese — top rated, airing, upcoming, hidden gems |
| Upcoming | TMDB discover — upcoming and last two months, with trailers |
| My Library | your connected sources → Stremio `datastorePut` |
| Settings | `localStorage` |

### Ratings and critics

The details modal shows three tiers, each from a different place and labelled as such:

| | Source | Notes |
|---|---|---|
| Rotten Tomatoes / Metacritic / IMDb scores | OMDb, else Wikipedia | OMDb needs a free `OMDB_API_KEY`; without one the numbers come from the film's Wikipedia article, which quotes both aggregators |
| Named press critics | Wikipedia | The "Critical response" section, parsed into critic + outlet + excerpt, credited to Wikipedia (CC BY-SA) and linked back |
| Community reviews | TMDB | Written by TMDB members, never presented as press criticism |

Neither Rotten Tomatoes nor Metacritic has a public API and both forbid scraping, so
Wikipedia is the only free source that legitimately names critics. The article is
resolved through Wikidata by IMDb id (property `P345`), never by title — no film can
pick up another film's reviews. See `lib/wikipedia.ts`.

### Motion

The animated backdrop honours `prefers-reduced-motion`. Windows sets that flag for the
whole machine under **Adjust for best performance**, which is why Settings → Appearance
carries a Background Motion override (Match system / Full motion / Still).

## What was broken before

The rebuild exists because these couldn't be patched out of the old file cleanly:

- **Every card opened the same title.** `openDetails()` wrote into `#detailsTitle`,
  `#detailsPlot`, `#detailsPoster` and `#detailsMeta` — none of which existed — so the
  modal always showed its hardcoded Oppenheimer markup.
- **Sync was completely dead.** The UI posted to `/api/datastorePut` and
  `/api/datastoreMeta`; the server only routed `/api/stremio/*`. Every write 404'd.
- **CSV upload always parsed 0 items.** `text.split('\\n')` split on a literal
  backslash-n, and the field regex was escaped the same way, so the file was read as one
  line and only the header was consumed.
- **The whole app lived inside `<head>`.** `<body>` opened at line 4400 and held only two
  script tags.
- **Duplicate definitions fought each other.** `closeTrailer` and `openTrailerModal` were
  each defined twice; `playTrailer()` targeted a `#trailerIframe` that didn't exist, so
  trailers opened in a new tab.
- **Release Tracker and Settings were unreachable on desktop** — no nav links existed.
- ~2,300 lines of CSS with up to five conflicting definitions of the same class.

## Verify

```bash
npm run build     # types + lint
npm run dev
```

Then: click three different posters and confirm three different titles; upload an IMDb
CSV export and confirm a non-zero item count; connect a Stremio account and run a sync,
watching for `POST /api/stremio/datastorePut` returning 200.
