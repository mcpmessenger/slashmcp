## Bug Bounty Report – OAuth Login Loop & Restricted Access

### Summary
Production users cannot complete Google OAuth on `https://slashmcp.vercel.app`. After Google redirects back, the UI shows “Sign in required” indefinitely and Supabase never resolves the session handshake. Additionally, only the original developer account can log in because the Google OAuth consent screen is still in *Testing* mode with a single test user.

### Impact
- All non‑developer users are locked out; `authReady` never flips to `true`, so chat/workflows remain inaccessible.
- `supabase.auth.getSession()` hangs (`PromiseState: pending`) even though the `sb-<project>-auth-token` entry exists in `localStorage`.
- Business-critical workflows relying on user uploads can’t be validated in production.

### Root Causes
1. **Supabase session bootstrap stalls** – the SPA waits on `supabase.auth.getSession()` which depends on a network call that is either blocked (CSP/extension) or times out. There is no fallback to hydrate from the already-stored session token.
2. **Google OAuth restricted to test users** – the Google Cloud project has not been published to Production, so only listed test accounts can authenticate. Everyone else hits Google’s “app not configured” flow and ultimately loops back to the login screen.

### Proof / Reproduction
1. Open `https://slashmcp.vercel.app` in a clean browser profile.
2. Click **Sign in with Google**, complete the OAuth flow with any non-whitelisted account.
3. After redirect, the page shows “Sign in required.” DevTools console emits repeated `Auth check timeout - setting authReady to true` warnings.
4. Run:
   ```js
   window.supabase.auth.getSession()
     .then(res => console.log("session", res))
     .catch(err => console.error("session error", err));
   ```
   The promise remains `pending`, never resolving to a session or an error.
5. Compare with the original developer account – login succeeds, proving OAuth is locked to test users.

### Recommended Remediation
1. **Frontend fallback:** After OAuth redirect, attempt to hydrate the Supabase session from `localStorage` (`sb-<project>-auth-token`) and call `supabase.auth.setSession()` before waiting on `getSession()`. Keep the timeout but degrade gracefully.
2. **Publish Google OAuth consent screen:** Move the OAuth app from Testing to Production and add `slashmcp.vercel.app` as an authorized domain so any user can sign in.
3. **Monitoring:** Log Supabase auth errors and expose them in the MCP Event Log so future regressions are visible.
4. **Smoke test:** Add an automated E2E test that logs in with a non-developer account to catch regressions before deploy.

### Current Status
- The fallback hydration has been implemented in `src/hooks/useChat.ts`.
- Google OAuth still needs to be published for general access; until then only developer accounts can sign in.

