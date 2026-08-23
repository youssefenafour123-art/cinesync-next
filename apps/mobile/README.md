# CineSync — iOS and Android

The Expo app. Same design and the same data as the web app, rebuilt in React Native.

It has no backend of its own: every screen calls the route handlers in `apps/web`, which is what keeps the TMDB key off the device.

## Running it on your phone

You need Expo Go — free, no developer account, no Xcode, no Android Studio.

**1. Tell the app where the server is.** Copy `.env.example` to `.env` and set one value:

```
EXPO_PUBLIC_API_BASE=https://your-app.onrender.com
```

Point it at the deployed Render URL, not at your laptop. That avoids four separate problems in one go — Windows Firewall prompting for `node.exe`, `next dev` not binding `0.0.0.0`, iOS blocking plain HTTP, and iOS 14+ asking for Local Network permission. Use a LAN address only when you are actually changing route handlers:

| Where the app runs | `EXPO_PUBLIC_API_BASE` |
| --- | --- |
| A real phone, over Wi-Fi | `http://<your-PC's-LAN-IP>:3000` — never `localhost`, which the phone resolves to itself |
| iOS Simulator | `http://localhost:3000` |
| Android emulator | `http://10.0.2.2:3000` |

**2. Start it**, from the repo root:

```
npm run mobile
```

**3. Open it.** iPhone: point the Camera app at the QR code. Android: scan it from inside Expo Go. The phone and the PC have to be on the same Wi-Fi — if the network isolates clients, which most guest and corporate Wi-Fi does, use `npx expo start --tunnel` instead.

Changed a config file and something looks stale? `npx expo start -c` clears the Metro cache.

## What works today

The shell, Discover, Movies, Search, Details, Person and Trailer.

Anime, Arabic, Upcoming, Calendar, My Library and Settings are in the tab bar but show a placeholder — all eight cells exist from the start so the bar doesn't shuffle under your thumb as screens land.

Adding a title to a library needs a connected Stremio account, and account management is part of My Library, so the button currently tells you to connect one on the web app rather than silently doing nothing.

## Worth knowing

- **The first load can take up to a minute.** Render's free plan spins the service down after fifteen minutes idle. The app fires a warm-up request while the fonts load, and the loading state changes its wording after four seconds so a cold start doesn't read as a hang.
- **iOS is Expo Go only from Windows.** `npx expo run:ios` needs macOS, and putting a custom dev build on an iPhone needs EAS Build and a paid Apple Developer account. This is what rules out Skia, and with it a faithful port of the animated poster edge glow.
- **Android can go further locally.** `npx expo run:android` works with Android Studio installed — but Gradle needs JDK 17, and this machine has JDK 26, so that needs a second JDK first.

## Checks

```
npm run mobile:typecheck     # from the repo root
npx expo-doctor              # from here — catches SDK version drift
npx expo export --platform android   # full Metro bundle, no device needed
```

See the root `CLAUDE.md` for how the workspace fits together, and in particular why three copies of Tailwind coexist on purpose.
