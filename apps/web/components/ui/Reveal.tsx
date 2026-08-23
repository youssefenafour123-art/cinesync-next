"use client";

import { useEffect, useRef, type ElementType } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "@/lib/useReducedMotion";

gsap.registerPlugin(ScrollTrigger);

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Seconds of delay before the tween starts. */
  delay?: number;
  as?: "div" | "section" | "aside";
}

/**
 * Fade-and-rise on scroll, driven by GSAP ScrollTrigger.
 *
 * Replaces the legacy page's two competing implementations — a raw scroll
 * listener at index.html:2854 and an IntersectionObserver at :3084 — which
 * both raced to add `.active` to the same elements.
 */
export function Reveal({ children, className = "", delay = 0, as = "div" }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) return;

    const ctx = gsap.context(() => {
      // The hidden state is applied here, not in the markup, so a GSAP load
      // failure leaves the section visible instead of blank forever.
      gsap.fromTo(
        el,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          delay,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 92%", once: true },
        },
      );
    }, el);

    // Layout inside tabs settles a frame after mount; make sure the trigger
    // positions are measured against the final layout.
    const refresh = requestAnimationFrame(() => ScrollTrigger.refresh());

    return () => {
      cancelAnimationFrame(refresh);
      ctx.revert();
    };
  }, [delay, reduced]);

  const Tag = as as ElementType;
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
