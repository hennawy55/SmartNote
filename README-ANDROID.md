# SmartNote Android (Capacitor)

## What this package does
This wraps the existing web app without rewriting its screens. It adds Android runtime notification permission handling for Android 13+ and exposes a native notification bridge to the existing task reminder code.

**Important limitation:** permission does not schedule reminders after the app process is stopped. The current app checks task deadlines every 15 seconds while running and requires its live database connection. Guaranteed background reminders require a backend push service (FCM) or a local-notification scheduling implementation that persists task schedules natively. This wrapper intentionally does not pretend that requesting POST_NOTIFICATIONS alone solves background delivery.

## Build
Requirements: Node.js LTS, Android Studio, Android SDK, JDK 17.

```bash
npm install
npm run android:sync
npm run android:open
```
In Android Studio choose Build > Build Bundle(s) / APK(s) > Build APK(s).
APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.

For a release APK, create a signing key in Android Studio (Build > Generate Signed Bundle / APK) and keep the keystore private.

## Android system bars (not full-screen)
The Android wrapper explicitly keeps the status bar and bottom navigation/gesture area visible, clears immersive full-screen flags, and prevents the WebView from drawing underneath the system bars. The Capacitor StatusBar plugin is configured with a burgundy status-bar background and light icons.

## Notification permission
On Android 13/API 33+, the first tap on "تفعيل التنبيهات" calls the native permission prompt. Android 12 and lower do not show this runtime prompt. The app also creates a notification channel.

## Current application behavior
The existing app remains online-only and uses its configured Google Apps Script endpoint and Google Sheets database. Its existing 15-second reminder polling only operates while the app is alive. For reminders while closed or force-stopped, add FCM or local scheduled notifications in a separate implementation and test Doze/reboot behavior.

## Privacy / security note
The repository currently embeds an API token in client-side JavaScript. A token shipped in an APK can be extracted; do not treat it as a secret. Protect the Apps Script endpoint with appropriate authorization and validation before using sensitive customer data.
