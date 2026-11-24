# SmartNote final branch notes

## Supabase deployment
- Deploy `Smart Note Supabase/supabase/functions/smartnote-auth/index.ts` as Edge Function `smartnote-auth`.
- Apply migration `202611240002_assignment_service_role_grants.sql` after the initial schema migration.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only in Edge Function secrets. Never put it in frontend files.
- The frontend uses the existing publishable key and sends the per-session token in `x-smartnote-session`.

## Web
Publish the root web assets over HTTPS. The full app shell and assigned follow-ups are restored in `index.html`, `app.js`, `styles.css`, `language.js`, `theme.js`, `manifest.json`, `sw.js`, and `lucide.min.js`.

## Android debug APK
A GitHub Actions workflow builds an installable debug APK on each push to this branch and supports manual runs. Open the repository Actions tab, select **Build SmartNote Android APK**, and download the `SmartNote-debug-apk` artifact after the workflow succeeds. This is a debug APK, not a Play Store-signed release.
