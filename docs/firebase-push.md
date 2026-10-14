# Push notifications on Android (Firebase)

Android delivers notifications to closed apps through Google's Firebase Cloud Messaging (FCM).
It's free, with no limits that matter here. The website keeps using Web Push as it does now.

This is the part to do in Firebase, GitHub and Supabase (about 15 minutes, easiest on a
computer). After that, the app side gets built: asking for permission, saving each phone's push
address, and the `send-push` function sending to Android phones too. That needs one new APK.

You'll end up with two files:

| File | What it is | Where it goes |
| --- | --- | --- |
| `google-services.json` | Tells the app which Firebase project it belongs to. Not a password. | GitHub secret `GOOGLE_SERVICES_JSON` |
| The service account key (`ember-…-firebase-adminsdk-….json`) | Lets the server send notifications. **A real secret, like a password.** | Supabase secret `FCM_SERVICE_ACCOUNT` |

Never paste either file into a chat, the app's code, Vercel, or a commit.

## 1. Make the Firebase project

1. Go to **console.firebase.google.com** and sign in with your Google account.
2. **Create a project** (or **Add project**). Name it `Ember` → **Continue**.
3. Google Analytics: switch it **off** (not needed) → **Create project** → **Continue**.

## 2. Add the Android app

1. On the project's overview page, click the **Android** icon (or **Add app → Android**).
2. **Android package name:** `app.ember.social` (exactly this, it's the app's ID).
3. **App nickname:** `Ember`. Leave **Debug signing certificate SHA-1** empty.
4. **Register app**.
5. **Download google-services.json** and keep the file. The next steps ("Add Firebase SDK")
   are code changes that get done for you: click **Next**, **Next**, **Continue to console**.

## 3. Check Cloud Messaging is on

1. Click the **⚙ gear** next to *Project Overview* → **Project settings** → **Cloud Messaging** tab.
2. Under **Firebase Cloud Messaging API (V1)** it should say **Enabled**.
   - If it says *Disabled*: click the **⋮** menu next to it → **Manage API in Google Cloud
     Console** → **Enable**, then come back.
3. Ignore the *Legacy* API. It's switched off by Google and isn't needed.

## 4. Make the server key

1. Still in **Project settings**, open the **Service accounts** tab.
2. **Generate new private key** → **Generate key**. A `.json` file downloads.
3. This file can send notifications to everyone's phones as Ember. Keep it private.

## 5. Put `google-services.json` in GitHub

The APK is built by GitHub, which adds this file during the build. The file isn't kept in the code.

1. Open the repository on github.com → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**.
3. **Name:** `GOOGLE_SERVICES_JSON`
4. **Secret:** open `google-services.json` in a text editor (Notepad, TextEdit), select all,
   copy, and paste it here.
5. **Add secret**.

## 6. Put the server key in Supabase

1. Supabase dashboard → your project → **Edge Functions** → **Secrets**
   (or **Project Settings → Edge Functions**).
2. **Add new secret**:
   - **Name:** `FCM_SERVICE_ACCOUNT`
   - **Value:** open the service account `.json` from step 4 in a text editor, select all,
     copy, and paste the whole thing (it starts with `{` and ends with `}`).
3. **Save**.
4. Then delete that `.json` file from your Downloads (or move it somewhere private). If it ever
   leaks: Firebase → Project settings → Service accounts → **Manage service account
   permissions** → delete that key, and make a new one.

## 7. Then

Once both secrets are in, the app side can be built:

- Android app: asks "Allow Ember to send notifications?" after sign-in, and saves the phone's
  push address.
- `send-push`: sends the same notifications the website gets (messages, comments, friend
  requests…) to Android phones through Firebase.
- One new APK to install. After that, changes arrive over the air again.
