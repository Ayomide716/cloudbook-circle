# Ember for Android

The Android app is Ember's own website build inside a native shell ([Capacitor](https://capacitorjs.com)).
App ID: `app.ember.social`.

## Install it on a phone

1. On the Android phone, open **github.com/ayomide716/cloudbook-circle/releases/latest**.
2. Tap the `Ember-1.x.y.apk` file.
3. When Android asks, allow your browser to install apps, then tap **Install**.

A newer APK installs over the old one, and you stay signed in. Every change merged into `main` builds a
new APK (GitHub Actions → **Android app**), but most people never need it: the app updates itself.

## Updates over the air

Every website release (Vercel) also publishes the app's files:

- `/ota/manifest.json`: which version is live, and the native level it needs
- `/ota/<version>.zip`: the whole app

When the app opens or comes back to the front, it reads the manifest. If there's a newer version, it
downloads it quietly. The switch happens the next time you leave the app, so nothing changes while you're
using it. The code is in `src/lib/native/ota.ts` and the build step in `vite.config.ts`.

Safety:

- **Rollback.** A version that can't start is rolled back to the last good one automatically.
- **Native level.** Over-the-air updates only carry the web part. If a change needs a new APK (a new
  Capacitor plugin, a new permission or a native setting), raise `NATIVE_LEVEL` in
  `src/lib/native/native-level.ts`. Phones on an older APK then keep their version until they install the
  new one, instead of getting code their app can't run.

Nothing goes to Capgo's cloud. The updater plugin is used only to download and switch, and its stats are
turned off.

## Google sign-in

Google doesn't allow sign-in inside an app's web view, so the app opens the phone's browser and comes
back through `app.ember.social://auth`. Supabase must allow that address once:

**Supabase → Authentication → URL Configuration → Redirect URLs → add `app.ember.social://auth`**

Email and password sign-in works without this.

## Working on the app

```sh
npm run android:sync   # build the website and copy it into android/
npm run android        # …and open it in Android Studio (run it on a phone or emulator from there)
```

## Play Store (later)

The APKs from GitHub are signed with a shared **test key** (`android/app/ember-test.keystore`) so they
install over each other. The Play Store needs your own private upload key instead:

1. Create one, and keep it safe and out of the repo (git ignores keystores):
   `keytool -genkeypair -v -keystore ember-upload.jks -alias ember -keyalg RSA -keysize 2048 -validity 10000`
2. Build with it by setting `EMBER_UPLOAD_KEYSTORE` (the path), `EMBER_UPLOAD_STORE_PASSWORD`,
   `EMBER_UPLOAD_KEY_ALIAS` and `EMBER_UPLOAD_KEY_PASSWORD`, then run `./gradlew bundleRelease` in
   `android/`. That gives a `.aab` file to upload to Play Console.

Phones that installed a test APK will need to uninstall it once before installing from the Play Store,
because Android only installs an update signed with the same key.

## Not in the app yet

- **Push notifications.** These need a Firebase project (`google-services.json`) and native push in the
  `send-push` function. Until then, Settings shows "Coming soon to the Android app".
- **iOS.** Building it needs a Mac and an Apple developer account.
