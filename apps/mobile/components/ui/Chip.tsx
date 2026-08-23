import { Pressable, Text } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * A filter pill — moods on Movies, country and genre on Arabic.
 *
 * Sized for a thumb rather than a cursor: the web's `px-4 py-2` is a 34px
 * target, which is under both platforms' 44pt minimum, so the padding here is
 * larger and `hitSlop` covers the rest.
 */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!selected) void Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={6}
      className={`rounded-full px-4 py-2.5 active:opacity-80 ${
        selected ? "bg-primary" : "border border-white/10 bg-surface-container/60"
      }`}
    >
      <Text
        className={`font-body-medium text-label-md ${
          selected ? "text-on-primary" : "text-on-surface-variant"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
