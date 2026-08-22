"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

interface AmbientBackgroundProps {
  /** Poster URLs for the parallax wall. */
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

/**
 * The living backdrop: drifting aurora orbs and a wall of posters that
 * scrolls, tilts toward the pointer, and rotates its own content.
 *
 * The legacy page had a `#bgPostersContainer` marked "Injected by JS" that
 * nothing ever filled, so the wall never appeared. The first rebuild filled it
 * but left it inert — one 150-second pan over a fixed grid, which reads as a
 * still image. This version is genuinely live:
 *
 * - every column is an independent marquee, alternating direction and speed,
 *   duplicated once so the loop is seamless;
 * - a single `gsap.ticker` pass eases the whole wall toward the pointer and
 *   adds a slow autonomous drift, so it keeps moving with no cursor at all;
 * - a screen-blended spotlight follows the pointer, lifting the posters it
 *   passes over out of the scrim;
 * - posters cross-fade to titles the wall isn't showing yet, so the backdrop
 *   changes content and not just position.
 *
 * Everything the pointer drives is written with `quickSetter` onto transforms,
 * never onto a gradient — a full-screen gradient repainted every frame is the
 * one version of this effect that actually costs something.
 *
 * `prefers-reduced-motion` skips every timeline and ticker; the wall renders as
 * a plain static grid. Settings → Appearance can override that per-device,
 * because Windows sets the flag machine-wide under "Adjust for best
 * performance".
 */
export function AmbientBackground({ wall }: AmbientBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // Fixed-size grid, so the layout never depends on how many posters arrived.
  const columns = useMemo(() => {
    if (!wall.length) return [];
    return Array.from({ length: COLUMNS }, (_, c) =>
      Array.from({ length: PER_COLUMN }, (_, r) => wall[(c * PER_COLUMN + r) % wall.length]),
    );
  }, [wall]);

  // Whatever the grid didn't use is the queue the cross-fade draws from.
  const spare = useMemo(() => wall.slice(COLUMNS * PER_COLUMN), [wall]);

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
    if (reduced || !columns.length) return;

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

      const tick = () => {
        cur.x += (target.x - cur.x) * 0.045;
        cur.y += (target.y - cur.y) * 0.045;

        const t = gsap.ticker.time;
        const dx = cur.x - 0.5;
        const dy = cur.y - 0.5;

        setRotY(dx * 16 + Math.sin(t * 0.07) * 7);
        setRotX(-dy * 11 + Math.cos(t * 0.053) * 4);
        setX(-dx * 70 + Math.sin(t * 0.031) * 40);
        setY(-dy * 50);
        setZ(Math.sin(t * 0.041) * 120 - 60);

        setSpotX(cur.x * window.innerWidth);
        setSpotY(cur.y * window.innerHeight);
      };
      gsap.ticker.add(tick);

      // ---- Content rotation -----------------------------------------------
      // One poster at a time cross-fades to a title the wall isn't showing, so
      // new art keeps arriving without a visible reshuffle.
      const queue = [...spare];

      const rotate = () => {
        const imgs = gsap.utils.toArray<HTMLImageElement>(".bg-wall-track img");
        const next = queue.shift();
        if (next && imgs.length) {
          const el = imgs[Math.floor(Math.random() * imgs.length)];
          const previous = el.src;
          gsap.to(el, {
            opacity: 0,
            scale: 0.86,
            duration: 0.7,
            ease: "power2.in",
            onComplete: () => {
              el.src = next;
              queue.push(previous);
              gsap.to(el, { opacity: 1, scale: 1, duration: 0.9, ease: "power2.out" });
            },
          });
        }
        gsap.delayedCall(gsap.utils.random(2.5, 5), rotate);
      };
      gsap.delayedCall(3, rotate);

      return () => {
        window.removeEventListener("pointermove", onMove);
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
                className={`bg-wall-col${c >= MOBILE_COLUMNS ? " hidden sm:block" : ""}`}
                style={{ marginTop: `${(c % 4) * -80}px` }}
              >
                <div className="bg-wall-track">
                  {[...col, ...col].map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${c}-${i}`} src={src} alt="" loading="lazy" decoding="async" />
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
