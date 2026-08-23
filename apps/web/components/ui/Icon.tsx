interface IconProps {
  name: string;
  className?: string;
  fill?: boolean;
}

/** Material Symbols glyph. The font is loaded once in app/layout.tsx. */
export function Icon({ name, className = "", fill = false }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined${fill ? " fill" : ""}${className ? ` ${className}` : ""}`}
    >
      {name}
    </span>
  );
}
