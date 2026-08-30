import "../global.css";

import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Outfit_600SemiBold, Outfit_700Bold } from "@expo-google-fonts/outfit";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { endpoints } from "@cinesync/shared/api";
import { Toast } from "@/components/ui/Toast";
import { BACKGROUND, ON_SURFACE } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Throws if the splash screen has already gone, which is not a problem.
});

/**
 * A cold deep link into `/title/tt123` should still have somewhere to go back
 * to, rather than trapping the user on a modal with no screen underneath it.
 */
export const unstable_settings = { initialRouteName: "(tabs)" };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_600SemiBold,
    Outfit_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  /*
    Wake the server before the first screen asks it for anything.

    The route handlers are on Render's free plan, which spins down after
    fifteen minutes idle and takes most of a minute to come back. Firing this
    during font loading means the wake-up overlaps with work that was going to
    happen anyway, so by the time Discover mounts and calls the same URL the
    service is often already up — and `useFetch` will serve that response from
    its cache rather than making a second request.

    Deliberately unawaited and unhandled: nothing depends on it, and a failure
    here just means the screen pays the cost itself, as it would have anyway.
  */
  useEffect(() => {
    void fetch(endpoints.discover()).catch(() => {});
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // `fontError` still renders: a missing font is a wrong typeface, not a
  // reason to show nothing at all.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: BACKGROUND }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: BACKGROUND },
            headerStyle: { backgroundColor: BACKGROUND },
            headerTintColor: ON_SURFACE,
          }}
        >
          <Stack.Screen name="(tabs)" />

          {/*
            Every one of these is a sibling of the tabs in one stack, which is
            what makes the web app's modal stacking work here for free: a film
            opens a cast member, whose filmography opens another film, and each
            one pushes on top rather than replacing. Going back peels exactly
            one layer, which is what `useModalBehavior`'s hand-rolled z-index
            counter was built to achieve on the web.
          */}
          <Stack.Screen name="title/[key]" options={{ presentation: "modal" }} />
          <Stack.Screen name="person/[id]" options={{ presentation: "modal" }} />
          <Stack.Screen name="genre/[name]" options={{ presentation: "modal" }} />
          <Stack.Screen name="search" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="trailer/[videoId]"
            options={{ presentation: "fullScreenModal", animation: "fade" }}
          />
        </Stack>

        {/* Above the Stack, so a toast fired from a modal is visible on it. */}
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
