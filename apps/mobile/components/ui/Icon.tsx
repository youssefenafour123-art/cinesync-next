import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ActivityIndicator } from "react-native";
import { PRIMARY } from "@/lib/theme";

/**
 * The web app's `Icon`, which renders a Material Symbols ligature in a `<span>`.
 *
 * Ligature fonts don't survive the trip: React Native would need the Material
 * Symbols TTF bundled and, more importantly, has no way to drive the font's
 * FILL axis, which is what the web uses to fill an active tab's icon.
 * `@expo/vector-icons` ships Google's Material Icons instead — the same
 * drawings, one weight — and it is bundled inside Expo Go, so it costs nothing
 * to load. Every one of the 47 names the web app uses exists there.
 *
 * Two consequences worth knowing:
 *
 * - `fill` is accepted and ignored. Material Icons has no outlined/filled pair,
 *   so an active tab is distinguished the way the web already distinguishes it
 *   as well — the primary colour and the tinted pill behind it.
 * - `progress_activity` is a spinner on the web, drawn as an icon that CSS
 *   rotates. Here it returns a real `ActivityIndicator`, which spins on the UI
 *   thread and matches the platform.
 */

/** Material Symbols names are snake_case; Material Icons uses kebab-case. */
function toGlyph(name: string): keyof typeof MaterialIcons.glyphMap {
  return name.replace(/_/g, "-") as keyof typeof MaterialIcons.glyphMap;
}

export interface IconProps {
  /** A Material Symbols name, exactly as the web app writes it. */
  name: string;
  size?: number;
  color?: string;
  /** Accepted for parity with the web component; see the note above. */
  fill?: boolean;
}

export function Icon({ name, size = 22, color = PRIMARY }: IconProps) {
  if (name === "progress_activity" || name === "progress-activity") {
    return <ActivityIndicator size={size > 28 ? "large" : "small"} color={color} />;
  }
  return <MaterialIcons name={toGlyph(name)} size={size} color={color} />;
}
