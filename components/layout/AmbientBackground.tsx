"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

interface AmbientBackgroundProps {
  /** Poster URLs for the parallax wall. */
  wall: string[];
}

/**
 * The two fixed background layers from the original design:
 * drifting aurora orbs, and a 3D-panned wall of posters.
 *
 * The legacy page had a `#bgPostersContainer` marked "Injected by JS" that
 * nothing ever filled, so the wall never appeared. Here it's fed by the
 * Discover catalog. Both layers are GSAP timelines rather than infinite CSS
 * keyframes, so `prefers-reduced-motion` can genuinely stop them.
 */
export function AmbientBackground({ wall }: AmbientBackgroundProps) {
  const orbsRef = useRef<HTMLDivElement>(null);
  const postersRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;

    const ctx = gsap.context(() => {
      // Aurora orbs — long, offset drifts so they never sync up.
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

      // Poster wall — the slow cinematic pan from the original stylesheet.
      if (postersRef.current) {
        gsap.fromTo(
          postersRef.current,
          {
            rotateX: 25,
            rotateY: 10,
            z: -300,
            xPercent: -5,
            transformPerspective: 1500,
          },
          {
            rotateX: 5,
            rotateY: -10,
            z: 150,
            xPercent: 5,
            duration: 150,
            ease: "none",
            repeat: -1,
            yoyo: true,
          },
        );
      }
    });

    return () => ctx.revert();
  }, [reduced]);

  return (
    <>
      <div ref={orbsRef} className="bg-orbs" aria-hidden="true">
        <div
          className="bg-orb"
          style={{ width: "60vw", height: "60vw", background: "#4facfe", top: "-20%", left: "-20%" }}
        />
        <div
          className="bg-orb"
          style={{ width: "55vw", height: "55vw", background: "#f093fb", bottom: "-10%", right: "-10%" }}
        />
        <div
          className="bg-orb"
          style={{ width: "45vw", height: "45vw", background: "#5EE7DF", top: "30%", left: "30%" }}
        />
      </div>

      {wall.length > 0 && (
        <div ref={postersRef} className="bg-posters" aria-hidden="true">
          {wall.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${src}-${i}`} src={src} alt="" loading="lazy" />
          ))}
        </div>
      )}

      {/* Must stay after .bg-posters — paint order is what keeps it on top. */}
      <div className="bg-scrim" aria-hidden="true" />
    </>
  );
}
