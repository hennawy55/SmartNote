# SmartNote Upgrade — Reliability Deployment & Test Checklist

All upgrade code lives in this folder. The original application outside this folder is not modified.

## Before deployment

1. Keep a backup of the Google Spreadsheet. The Users schema migration also creates a Users_backup_YYYYMMDD_HHMMSS sheet before changing the live column layout.
2. Open the Apps Script project used by this upgrade deployment.
3. Replace its server code with this folder's Code.gs.
4. Save and deploy a new Web App version using the same deployment identity/access policy as the existing working deployment. Updating GitHub alone does not update Apps Script.
5. Run setupSmartNoteUpgrade once from the Apps Script editor. It creates any missing upgrade sheets, including AuditLog, and checks the user schema. It does not intentionally clear existing user databases.
6. If this is a brand-new database, run getInitialAdminCredentials once from the Apps Script editor and retrieve the generated one-time admin password from the execution log. Change it at first sign-in. Existing databases are not assigned a new password.
7. Confirm the deployed Web App URL matches API_URL in app.js. Do not paste deployment secrets into chat or commit them to GitHub.

## Reliability changes included

- Session lookup uses Script Cache with expiry and invalidation on logout, password reset, role change, and account disable.
- Failed sign-in attempts are throttled for 15 minutes after five consecutive failures.
- User directory APIs are role-scoped; assignment target lookup is scoped to the specific assignment.
- A transferred assignment owner can manage that assignment without receiving global leader privileges.
- Reassignment validates the destination before writes, serializes mutations, rolls back the assignment row if the request-state write fails, and expires stale requests when assignment ownership changes.
- Accounts cannot be disabled or deleted while they own/are assigned active follow-ups or have pending reassignment requests. Admins must reassign or archive those follow-ups first.
- Admin password reset forces a password change on the next login and revokes existing sessions.
- Authentication and account/permission changes are recorded in the admin-only AuditLog sheet and the latest audit entries can be viewed from User Management.
- User schema migration validates every row before writing and creates a recoverable sheet copy first.
- Assignment detail uses ID lookup; assignment lists use a short-lived cache invalidated on writes. Notification history is paginated and read items are retained.
- Cloud refresh is throttled to 30 seconds and skipped while the document is hidden.
- Lucide is pinned and bundled locally; the service worker caches it for offline UI rendering.
- Browser/Android reminder permissions are requested at startup; notification controls and snooze UI are removed.

## Required acceptance tests

Use separate test accounts for Admin, Leader, and User. Do not use the production admin account for destructive tests.

1. Sign in as Admin; create one Leader and two Users. Verify user names display without role suffixes.
2. Sign in as Leader; create one Task follow-up and one Client follow-up. Confirm the client phone number is visible in details.
3. Confirm the assignee can open the task, the status changes from New to Viewed, update status, and add both private and shared notes. Confirm private notes are not visible to the owner/other users.
4. As User, request reassignment with a reason. Confirm the current owner sees it and can approve/reject. Confirm a second approval attempt is rejected.
5. After approval, sign in as the new assignee (even if their global role is User). Confirm they can manage/reassign only that transferred assignment, not the global user directory or other users' assignments.
6. As the current owner, directly reassign the assignment. Confirm the old assignee cannot manage it and any older pending reassignment request becomes stale.
7. Try to disable/delete an account with active follow-ups or pending reassignment requests. Confirm the server blocks the action. Reassign/archive the work, then retry.
8. Reset a user's password as Admin. Confirm old sessions are revoked and the user must change the temporary password at next login.
9. Open notifications, read a reminder, close and reopen the panel, and use Load older notifications. Confirm read notifications remain in history and pagination does not duplicate entries.
10. Go offline, view locally cached data, make an allowed local edit, reconnect, and confirm synchronization completes without replacing newer server data.
11. Open the Admin Audit Log and confirm sign-in failures, sign-ins, user creation, role/status changes, password resets, and deletion events are recorded without storing passwords.

## Build and automated checks

The GitHub Actions workflow runs JavaScript syntax checks for the client and Apps Script backend, validates the manifest, runs tests/smoke-check.cjs, downloads the pinned icon bundle, packages the web build, and builds a debug APK. Gradle retries transient dependency-download failures.

The automated smoke checks are not a substitute for the live acceptance tests above. A successful APK build proves packaging, not live Apps Script permissions or data behavior.
