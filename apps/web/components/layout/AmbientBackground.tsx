"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { fetchShared } from "@/lib/useFetch";
import { backdropPoster } from "@/lib/rotation";

interface AmbientBackgroundProps {
  /** Poster URLs for the parallax wall, once the Discover tab has loaded them. */
  wall: string[];
}

/**
 * Columns rendered. Enough that the row is wider than the stage on a desktop
 * viewport — the wall should run off both edges rather than float in the middle
 * of the screen with the scrim showing through beside it. The last seven are
 * hidden below `sm`, where five already overflow.
 */
const COLUMNS = 12;
/**
 * Posters per column before the seamless duplicate. One column's worth has to
 * be taller than the stage, or the marquee shows a gap at the wrap point.
 */
const PER_COLUMN = 8;
/** Columns kept on small screens. */
const MOBILE_COLUMNS = 5;

/** How far from a column the pointer still lifts it, as a share of the viewport. */
const PROXIMITY_REACH = 0.34;
/** Column opacity with the pointer nowhere near it. */
const COLUMN_REST_OPACITY = 0.52;

/**
 * The living backdrop: drifting aurora orbs and a wall of posters that
 * scrolls, tilts toward the pointer, lights up under it, and rotates its own
 * content.
 *
 * The legacy page had a `#bgPostersContainer` marked "Injected by JS" that
 * nothing ever filled, so the wall never appeared. The first rebuild filled it
 * but left it inert. The second made it move — and it still read as "no
 * background at all", because the wall sat at 34% opacity under a scrim that
 * ran from 55% to 97% black. The posters were loaded and animating the whole
 * time, at roughly 15% visibility in the middle of the screen and less at the
 * edges. That balance is fixed in `globals.css`; what this file adds is the
 * behaviour:
 *
 * - every column is an independent marquee, alternating direction and speed,
 *   duplicated once so the loop is seamless;
 * - a single `gsap.ticker` pass eases the whole wall toward the pointer, adds a
 *   slow autonomous drift and a scroll-linked shift, so it keeps moving with no
 *   cursor at all;
 * - each column brightens and lifts as the pointer approaches it, which is what
 *   makes the wall feel like a surface rather than a texture;
 * - a screen-blended spotlight follows the pointer;
 * - posters cross-fade to titles the wall isn't showing yet, so the backdrop
 *   changes content and not just position.
 *
 * Everything the pointer drives is written with `quickSetter` onto transforms
 * and opacity, never onto a filter or a gradient — those repaint their whole
 * subtree, and a full-screen repaint every frame is the one version of this
 * effect that actually costs something.
 *
 * The wall no longer depends on the Discover tab having been visited: if no
 * posters arrive by prop it fetches its own. Landing on Settings used to mean
 * an empty backdrop until you went to Discover and came back.
 */
export function AmbientBackground({ wall }: AmbientBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // Own copy of the poster pool, for when this mounts on a tab that never
  // calls `onWall`. The prop wins the moment it arrives — it's the same
  // payload, and preferring it avoids swapping the whole wall out underneath a
  // running marquee.
  const [fetched, setFetched] = useState<string[]>([]);

  useEffect(() => {
    if (wall.length) return;
    let cancelled = false;

    /*
       Through the shared loader, not a bare `fetch`.

       This used to assume the browser cache would absorb it because Discover
       requests the same URL. It did not: landing on Discover was measured
       downloading `/api/discover` twice over, 40KB each, racing the tab's own
       request. `fetchShared` collapses both into one and hands this the very
       payload the tab is already rendering.
    */
    void fetchShared<{ wall?: string[] }>("/api/discover")
      .then((data) => {
        if (!cancelled && data?.wall?.length) setFetched(data.wall);
      })
      .catch(() => {
        // A missing backdrop is not worth surfacing to the user.
      });

    return () => {
      cancelled = true;
    };
  }, [wall.length]);

  const posters = wall.length ? wall : fetched;

  /*
     How many columns to build, decided in JavaScript rather than CSS.

     The extra columns used to be rendered and then hidden with `hidden
     sm:block`, which puts their `<img>` tags in the document either way — 192
     of them on the landing page, of which 179 were measured loading. A phone
     showing five columns has no use for the other seven, and the cheapest
     image is the one never requested.

     `matchMedia` rather than `innerWidth` so a rotation or a resized window
     re-decides, and read in an effect so the first render matches what the
     server produced.
  */
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const columnCount = narrow ? MOBILE_COLUMNS : COLUMNS;

  // Fixed-size grid, so the layout never depends on how many posters arrived.
  const columns = useMemo(() => {
    if (!posters.length) return [];
    return Array.from({ length: columnCount }, (_, c) =>
      Array.from({ length: PER_COLUMN }, (_, r) => posters[(c * PER_COLUMN + r) % posters.length]),
    );
  }, [posters, columnCount]);

  // Whatever the grid didn't use is the queue the cross-fade draws from.
  const spare = useMemo(
    () => posters.slice(columnCount * PER_COLUMN),
    [posters, columnCount],
  );

  /**
   * Aurora orbs, set up once and left alone for the component's whole life.
   *
   * Kept out of the wall's effect on purpose. They don't depend on poster data,
   * and holding three infinite tweens open means GSAP's global timeline is
   * never empty — which matters more than it looks: see `ticker.wake()` below.
   */
  useEffect(() => {
    if (reduced) return;

    // GSAP parks its rAF loop after `autoSleep` (120) frames with an empty
    // global timeline, and creating a tween is not by itself enough to restart
    // it. That matters when motion is switched on from Settings minutes into a
    // session: by then the ticker has long since slept, and every tween below
    // would render one frame and freeze.
    gsap.ticker.wake();

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".bg-orb").forEach((orb, i) => {
        gsap.to(orb, {
          x: () => gsap.utils.random(-140, 140),
          y: () => gsap.utils.random(-90, 120),
          scale: () => gsap.utils.random(0.9, 1.15),
          duration: 25,
          delay: i * -6,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          repeatRefresh: true,
        });
      });
    }, rootRef);

    return () => ctx.revert();
  }, [reduced]);

  useEffect(() => {
    if (!columns.length) return;

    // Held still, the wall is a plain grid — but it still has to be *visible*,
    // so the columns are opened to full opacity rather than left at the resting
    // value the pointer pass would otherwise lift them from.
    if (reduced) {
      const cols = rootRef.current?.querySelectorAll<HTMLElement>(".bg-wall-col");
      cols?.forEach((col) => {
        col.style.opacity = "1";
      });
      return;
    }

    gsap.ticker.wake();

    const ctx = gsap.context(() => {
      const wallEl = wallRef.current;
      const spotEl = spotRef.current;
      if (!wallEl || !spotEl) return;

      // ---- Marquee columns ----------------------------------------------
      // Each track holds its posters twice, so travelling exactly -50% lands
      // on an identical frame and the loop has no seam.
      gsap.utils.toArray<HTMLElement>(".bg-wall-track").forEach((track, i) => {
        const up = i % 2 === 0;
        gsap.fromTo(
          track,
          { yPercent: up ? 0 : -50 },
          {
            yPercent: up ? -50 : 0,
            duration: 70 + (i % 4) * 22,
            ease: "none",
            repeat: -1,
          },
        );
      });

      // ---- Pointer parallax + autonomous drift ---------------------------
      const setRotY = gsap.quickSetter(wallEl, "rotateY", "deg");
      const setRotX = gsap.quickSetter(wallEl, "rotateX", "deg");
      const setX = gsap.quickSetter(wallEl, "x", "px");
      const setY = gsap.quickSetter(wallEl, "y", "px");
      const setZ = gsap.quickSetter(wallEl, "z", "px");
      const setSpotX = gsap.quickSetter(spotEl, "x", "px");
      const setSpotY = gsap.quickSetter(spotEl, "y", "px");

      // ---- Per-column pointer proximity ----------------------------------
      // The columns are what the cursor actually interacts with. Each one gets
      // its own setters, so the frame loop never touches the DOM by selector.
      const colEls = gsap.utils.toArray<HTMLElement>(".bg-wall-col");
      const cols = colEls.map((el) => ({
        el,
        setScale: gsap.quickSetter(el, "scale") as (v: number) => void,
        setColZ: gsap.quickSetter(el, "z", "px") as (v: number) => void,
        setOpacity: gsap.quickSetter(el, "opacity") as (v: number) => void,
        // Eased per column, so a column brightens and dims rather than tracking
        // the cursor's exact position frame for frame.
        lift: 0,
        centre: 0,
      }));

      // The wall's layout box spans `inset: -50% -12%` of a full-viewport
      // stage, so a column's untransformed centre in viewport coordinates is
      // its offset within the wall shifted left by 12% of the viewport. The 3D
      // tilt is deliberately ignored — this is a soft falloff, not a hit test.
      const measure = () => {
        const originX = -0.12 * window.innerWidth;
        for (const c of cols) c.centre = originX + c.el.offsetLeft + c.el.offsetWidth / 2;
      };
      measure();
      window.addEventListener("resize", measure, { passive: true });

      // Targets in 0..1 viewport space; `cur` chases them, so the wall glides
      // rather than snapping to every pointermove.
      const target = { x: 0.5, y: 0.4 };
      const cur = { x: 0.5, y: 0.4 };
      let pointerSeen = false;

      const onMove = (e: PointerEvent) => {
        target.x = e.clientX / window.innerWidth;
        target.y = e.clientY / window.innerHeight;
        if (!pointerSeen) {
          pointerSeen = true;
          // Touch devices never get here, so they never get a parked blob of
          // light sitting in the middle of the screen.
          gsap.to(spotEl, { opacity: 1, duration: 1.2, ease: "power2.out" });
        }
      };
      window.addEventListener("pointermove", onMove, { passive: true });

      // Scroll shifts the wall too, so the backdrop responds to the one input
      // every visitor gives it, even on a touch screen. Sampled in the listener
      // rather than read in the tick, so the frame loop never reads layout.
      let scrollY = window.scrollY;
      const onScroll = () => {
        scrollY = window.scrollY;
      };
      window.addEventListener("scroll", onScroll, { passive: true });

      const tick = () => {
        /*
           Nothing to ease toward while the tab is in the background.

           This component is mounted outside the tab shell, so it never
           unmounts, and the ticker was explicitly woken and then left running
           for the life of the session — writing ~43 styles a frame behind an
           inactive tab, a modal, or a scrolled-away viewport. `document.hidden`
           is the cheap half of that: the browser throttles rAF for a hidden
           tab but does not stop it, and every one of those frames was doing
           the full pointer-proximity pass over twelve columns for nobody.
        */
        if (document.hidden) return;

        cur.x += (target.x - cur.x) * 0.045;
        cur.y += (target.y - cur.y) * 0.045;

        const t = gsap.ticker.time;
        const dx = cur.x - 0.5;
        const dy = cur.y - 0.5;

        setRotY(dx * 16 + Math.sin(t * 0.07) * 7);
        setRotX(-dy * 11 + Math.cos(t * 0.053) * 4);
        setX(-dx * 70 + Math.sin(t * 0.031) * 40);
        // Scrolling drags the wall a fraction of the distance the page moves,
        // which reads as depth behind the content rather than a second scroll.
        setY(-dy * 50 - scrollY * 0.06);
        setZ(Math.sin(t * 0.041) * 120 - 60);

        setSpotX(cur.x * window.innerWidth);
        setSpotY(cur.y * window.innerHeight);

        const pointerX = cur.x * window.innerWidth;
        const reach = window.innerWidth * PROXIMITY_REACH;
        for (const c of cols) {
          // 1 directly under the cursor, 0 beyond `reach`, squared so the
          // falloff is a pool of light rather than a linear ramp.
          const d = Math.min(1, Math.abs(pointerX - c.centre) / reach);
          const want = pointerSeen ? (1 - d) * (1 - d) : 0;
          c.lift += (want - c.lift) * 0.08;

          c.setScale(1 + c.lift * 0.06);
          c.setColZ(c.lift * 90);
          c.setOpacity(COLUMN_REST_OPACITY + c.lift * (1 - COLUMN_REST_OPACITY));
        }
      };
      gsap.ticker.add(tick);

      // ---- Content rotation -----------------------------------------------
      // One poster at a time cross-fades to a title the wall isn't showing, so
      // new art keeps arriving without a visible reshuffle.
      const queue = [...spare];

      /*
         Looked up once. This ran a document-wide `querySelectorAll` returning
         192 nodes every 2.5-5 seconds, for the whole session.
      */
      const wallImages = gsap.utils.toArray<HTMLImageElement>(".bg-wall-track img");

      const rotate = () => {
        const imgs = wallImages;
        // A hidden tab is still downloading and decoding a fresh poster every
        // few seconds for a layer nobody is looking at. Skip the swap, keep
        // the loop alive so it resumes on return.
        const next = document.hidden ? undefined : queue.shift();
        if (next && imgs.length) {
          const el = imgs[Math.floor(Math.random() * imgs.length)];
          const previous = el.src;
          gsap.to(el, {
            opacity: 0,
            scale: 0.86,
            duration: 0.7,
            ease: "power2.in",
            onComplete: () => {
              el.src = backdropPoster(next);
              queue.push(previous);
              gsap.to(el, { opacity: 1, scale: 1, duration: 0.9, ease: "power2.out" });
            },
          });
        }
        // Slower than it was (2.5-5s). Each pass is a fresh image download and
        // decode; at the old cadence that is a continuous background transfer
        // for a decorative layer sitting under a scrim.
        gsap.delayedCall(gsap.utils.random(6, 11), rotate);
      };
      gsap.delayedCall(3, rotate);

      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("resize", measure);
        window.removeEventListener("scroll", onScroll);
        gsap.ticker.remove(tick);
      };
    }, rootRef);

    return () => ctx.revert();
  }, [reduced, columns, spare]);

  return (
    <div ref={rootRef} className="bg-root" aria-hidden="true">
      <div className="bg-orbs">
        <div
          className="bg-orb"
          style={{ width: "60vw", height: "60vw", background: "#4facfe", top: "-20%", left: "-20%" }}
        />
        <div
          className="bg-orb"
          style={{
            width: "55vw",
            height: "55vw",
            background: "#f093fb",
            bottom: "-10%",
            right: "-10%",
          }}
        />
        <div
          className="bg-orb"
          style={{ width: "45vw", height: "45vw", background: "#5EE7DF", top: "30%", left: "30%" }}
        />
      </div>

      <div className="bg-stage">
        {columns.length > 0 && (
          <div ref={wallRef} className="bg-wall">
            {columns.map((col, c) => (
              <div
                key={c}
                className="bg-wall-col"
                style={{ marginTop: `${(c % 4) * -80}px` }}
              >
                <div className="bg-wall-track">
                  {[...col, ...col].map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${c}-${i}`}
                      // Sized for a 156px column, not for a rail card. See
                      // `backdropPoster` — this is the difference between about
                      // one megabyte of backdrop and four.
                      src={backdropPoster(src)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paint order carries the layering: scrim over the wall, light over both. */}
      <div className="bg-scrim" />
      <div ref={spotRef} className="bg-spotlight" />
    </div>
  );
}
