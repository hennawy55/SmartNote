# Custom authentication setup

No email or domain is required. The smartnote-auth Edge Function authenticates usernames and passwords and issues opaque random sessions stored only as SHA-256 hashes.

Password derivation uses PBKDF2-HMAC-SHA-256 with 600,000 iterations and a unique random salt via Web Crypto. Passwords are never stored in plaintext. This implementation is PBKDF2, not Argon2id.

## Deployment
1. Run migration 202611240003_custom_auth.sql in Supabase SQL Editor.
2. Install Supabase CLI, sign in, and link this folder to your project.
3. Deploy with: supabase functions deploy smartnote-auth --no-verify-jwt
4. The function uses the platform-provided SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY server-side. Never place the service role key in browser code or commit it.

## Current scope
This is an authentication foundation only: login, session check, logout and self-service password change. It does not yet provision users, migrate old accounts, or connect the application UI. All application data access must be moved behind Edge Functions that validate the session and enforce role and ownership rules before release.
