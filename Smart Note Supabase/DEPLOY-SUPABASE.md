# SmartNote final integration and deployment

This branch is `test/smartnote-auth-hardening`. Do not deploy from or merge into `main` until the acceptance checks pass.

## 1. Apply the new database migration

The previous five migrations are already applied. Apply only:

`supabase/migrations/202611240006_atomic_user_database.sql`

Open the Supabase project SQL Editor, paste the complete contents of that file, and run it. It creates the atomic `replace_smartnote_database` RPC used by the Edge Function. It does not import, overwrite, or delete existing Google Sheets data.

## 2. Deploy the Edge Function

From the repository's `Smart Note Supabase` folder in PowerShell:

```powershell
git checkout test/smartnote-auth-hardening
git pull origin test/smartnote-auth-hardening
supabase functions deploy smartnote-auth --project-ref cantyrqkkbqwrajghluw --no-verify-jwt
```

The function uses the existing Supabase URL and server-side secrets. Never put the service-role key or bootstrap secret in the browser.

## 3. Publish the web version

Publish the latest branch contents from the repository through the existing web-hosting pipeline. The web app now calls the Supabase Edge Function directly; it no longer calls the Google Apps Script URL.

## 4. Build the Android package on Windows

From the repository root:

```powershell
npm install
npm run prepare:android
if (!(Test-Path .\android)) { npx cap add android }
npx cap sync android
npx cap open android
```

In Android Studio, build the signed APK/AAB for release. Keep the existing application ID `com.hennawy55.smartnote`.

## 5. Acceptance checks

- Sign in as the existing administrator; change the initial password if prompted.
- Create a workspace, project, unit, note, client, and task; edit and delete a test record.
- Reload the web app and verify the records remain.
- Sign in from a second account and verify it cannot see the first account's records.
- Test task notification dismissal and verify it remains dismissed after reload.
- Test admin create, role, status, password reset, and logout/session revocation.
- Repeat the same data and notification checks in the Android build.

Do not delete or disable the old Google Sheets backend until the existing records have been exported and imported, then verified against the Supabase account data.
