# SmartNote Multi-user Setup

## 1. Prepare a NEW Google spreadsheet
Create a new Google Sheet for production. The old trial database is not migrated or read.
Open Extensions > Apps Script and replace the contents of Code.gs with the repository's Code.gs.

## 2. Set the one-time administrator bootstrap key
In Apps Script: Project Settings > Script Properties > Add script property:
- Property: BOOTSTRAP_KEY
- Value: a long random one-time secret (at least 32 random characters)

Do not put this key in the HTML, JavaScript, APK, or repository.

## 3. Deploy the backend
Deploy > New deployment > Web app:
- Execute as: Me
- Who has access: Anyone
Copy the Web App URL. Update API_URL in app.js to this URL if it differs from the current URL.
Deploy, then authorize the requested spreadsheet permissions.

## 4. Create the first administrator
Open the web app URL. On the SmartNote login screen, choose "إعداد حساب المدير لأول مرة".
Enter the one-time BOOTSTRAP_KEY, choose an admin username and a password of at least 10 characters.
The key is deleted from Script Properties after successful initialization and bootstrap can only be used once.

## 5. Add users
Sign in as admin and use "إدارة المستخدمين" to create user accounts and enable/disable them.
Each account receives an independent JSON database. Users can only load/save the database associated with their authenticated session.

## Storage format
Users sheet columns:
UserID, Username, PasswordHash, Salt, Role, Status, UpdatedAt, DatabaseJSON
DatabaseJSON starts in column H and continues rightward on the same row in chunks of at most 49,900 characters. The API concatenates all chunks on read and clears stale chunks on save.
Sessions sheet stores only hashed session tokens and expiry metadata.

## Security and deployment notes
- Never share spreadsheet editor access with end users.
- The web app must execute as the spreadsheet owner; end users use the app, not the sheet.
- Passwords are salted and iteratively SHA-256 hashed. Session tokens are random and only their hashes are stored.
- Admin reset-password and delete-user API operations are implemented; the current admin screen exposes user creation and enable/disable. Add reset/delete UI only after confirming the operational workflow.
- Session tokens currently persist in sessionStorage for the active browser tab/session and expire server-side after 30 days.
- Google Apps Script and Sheets have quotas and are not a high-scale database. The design can split each user's JSON across adjacent cells, but spreadsheet row/cell limits and Apps Script execution quotas still apply.
- The current API_URL in app.js points at the previously configured Apps Script deployment. If you deploy a different script project, replace it with the new /exec URL and rebuild/redeploy the Android app.
