"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** Max rotation in degrees at the card's edge. */
  strength?: number;
}

/**
 * 3D pointer tilt.
 *
 * Uses `gsap.quickTo`, which writes through a cached setter on GSAP's ticker,
 * instead of the legacy version's `style.transform` assignment on every raw
 * mousemove (index.html:3108) — that fired dozens of layout-thrashing writes
 * per second across every visible card.
 */
export function TiltCard({ children, className = "", onClick, strength = 12 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    const opts = { duration: 0.5, ease: "power3.out" };
    const rotX = gsap.quickTo(el, "rotationX", opts);
    const rotY = gsap.quickTo(el, "rotationY", opts);
    const scale = gsap.quickTo(el, "scale", { duration: 0.4, ease: "power3.out" });

    gsap.set(el, { transformPerspective: 1000, transformStyle: "preserve-3d" });

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      rotX(-py * strength * 2);
      rotY(px * strength * 2);
      scale(1.04);
    };

    const onLeave = () => {
      rotX(0);
      rotY(0);
      scale(1);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(el);
    };
  }, [reduced, strength]);

  return (
    <div ref={ref} className={className} onClick={onClick}>
      {children}
    </div>
  );
}
