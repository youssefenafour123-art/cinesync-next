import { useEffect } from "react";
import { Text } from "react-native";
import { AnimatePresence, MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppStore } from "@/store/useAppStore";

const DISMISS_MS = 4000;

/**
 * The app's one transient message.
 *
 * Rendered from the root layout rather than from a screen, so it floats above
 * the modal routes too — a toast fired from the details screen ("Added to your
 * library") has to be visible on the details screen.
 *
 * It sits above the home indicator rather than at a fixed offset. The web
 * version uses `bottom-24` on mobile to clear its own tab bar; here the inset
 * is the real measurement, so it lands correctly on a device with a notch and
 * on one without.
 */
export function Toast() {
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(clearToast, DISMISS_MS);
    return () => clearTimeout(id);
  }, [toast, clearToast]);

  return (
    <AnimatePresence>
      {toast ? (
        <MotiView
          key="toast"
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          exit={{ opacity: 0, translateY: 24 }}
          transition={{ type: "timing", duration: 220 }}
          pointerEvents="none"
          style={{ position: "absolute", left: 20, right: 20, bottom: insets.bottom + 88 }}
          className="items-center"
        >
          <Text
            accessibilityLiveRegion="polite"
            className="overflow-hidden rounded-full border border-white/10 bg-surface-container-high px-5 py-3 text-center font-body-medium text-body-md text-on-surface"
          >
            {toast}
          </Text>
        </MotiView>
      ) : null}
    </AnimatePresence>
  );
}
