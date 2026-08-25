interface IconProps {
  name: string;
  className?: string;
  fill?: boolean;
  /**
   * Inline styles, which in practice means one thing: a size that has to hold.
   *
   * Google's Material Symbols stylesheet — the `<link>` in app/layout.tsx —
   * declares `font-size: 24px` on `.material-symbols-outlined`, unlayered. A
   * Tailwind `text-[56px]` sits in `@layer utilities`, and an unlayered rule
   * beats a layered one whatever the order or the specificity, so every size
   * class on an icon in this app is decoration: they all render at 24px.
   *
   * That is invisible at `text-[18px]` and obvious for a glyph meant to fill
   * an 80px circle. An inline style is the one thing that outranks the
   * stylesheet without adding `!important` to a hundred call sites, so it is
   * how the few icons whose size actually matters ask for it.
   */
  style?: React.CSSProperties;
}

/** Material Symbols glyph. The font is loaded once in app/layout.tsx. */
export function Icon({ name, className = "", fill = false, style }: IconProps) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`material-symbols-outlined${fill ? " fill" : ""}${className ? ` ${className}` : ""}`}
    >
      {name}
    </span>
  );
}
