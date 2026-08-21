"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ≈ 289

/** Circular sync progress. GSAP tweens the dash offset so jumps stay smooth. */
export function ProgressRing({ percent }: { percent: number }) {
  const barRef = useRef<SVGCircleElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const shown = useRef({ value: 0 });

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const tween = gsap.to(shown.current, {
      value: percent,
      duration: 0.5,
      ease: "power2.out",
      overwrite: true,
      onUpdate: () => {
        const v = shown.current.value;
        bar.style.strokeDashoffset = String(CIRCUMFERENCE - (CIRCUMFERENCE * v) / 100);
        if (labelRef.current) labelRef.current.textContent = String(Math.round(v));
      },
    });

    return () => {
      tween.kill();
    };
  }, [percent]);

  return (
    <div
      className="relative h-32 w-32 shrink-0"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle
          className="text-surface-container-high"
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
        />
        <circle
          ref={barRef}
          className="text-primary"
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-title-lg text-title-lg text-on-surface">
          <span ref={labelRef}>0</span>%
        </span>
      </div>
    </div>
  );
}
