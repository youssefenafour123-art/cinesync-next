import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import YoutubePlayer from "react-native-youtube-iframe";
import { Icon } from "@/components/ui/Icon";
import { PRIMARY } from "@/lib/theme";

/**
 * The trailer player.
 *
 * A YouTube iframe on the web and, for the same reason, a YouTube iframe here:
 * `expo-video` cannot play a YouTube URL, and YouTube's terms require playback
 * through their player rather than an extracted stream.
 * `react-native-youtube-iframe` wraps `react-native-webview`, which is bundled
 * in Expo Go — so this works without a custom dev build.
 *
 * Landscape is unlocked on this route only and restored on the way out. A video
 * is the one screen in the app worth rotating for, and leaving the whole app
 * rotatable would let the poster rails reflow into something nobody designed.
 */
export default function TrailerScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void ScreenOrientation.unlockAsync();
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-black">
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close trailer"
        hitSlop={12}
        className="absolute right-5 top-14 z-10 rounded-full bg-black/70 p-3 active:opacity-75"
      >
        <Icon name="close" size={24} color="#ffffff" />
      </Pressable>

      {!ready ? (
        <View className="absolute items-center gap-3">
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text className="font-body text-body-md text-on-surface-variant">Loading trailer…</Text>
        </View>
      ) : null}

      <YoutubePlayer
        height={Math.round(width * (9 / 16))}
        width={width}
        videoId={videoId}
        play
        onReady={() => setReady(true)}
        // Leaving the route unmounts the player, which is what actually stops
        // the audio — the same reason the web modal destroys its iframe.
        onChangeState={(state: string) => {
          if (state === "ended") router.back();
        }}
        initialPlayerParams={{ modestbranding: true, rel: false, controls: true }}
        webViewProps={{ allowsInlineMediaPlayback: true }}
      />
    </View>
  );
}
