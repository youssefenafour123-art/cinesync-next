"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/** Spring-animated integer, used for the sync Added/Skipped/Failed tallies. */
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  const source = useMotionValue(value);
  const spring = useSpring(source, { stiffness: 180, damping: 26 });
  const rounded = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    source.set(value);
  }, [value, source]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
