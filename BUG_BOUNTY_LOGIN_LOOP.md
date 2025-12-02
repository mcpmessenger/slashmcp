# Bug Bounty: Persistent OAuth Login Loop

## Summary
After authenticating with Google on `https://slashmcp.vercel.app`, the app either:

1. Shows the splash screen indefinitely with “Loading…” and the console warning `Auth check timeout – attempting local session restore`, or
2. Redirects back to the unauthenticated landing page and asks the user to “Sign in with Google” again.

The behavior repeats every time, so users cannot reach the chat UI even though OAuth succeeds and tokens are written to `localStorage`.

## Impact
- **Severity:** High – end users cannot access MCP Messenger at all.
- **Scope:** Production (Vercel) build. Repros on Windows 11 / Chrome 130 but likely any platform.
- **Business impact:** Effectively a total outage for logged‑out users; prevents adoption/testing and blocks any feature that requires authentication (chat, workflows, MCP registry, etc.).

## Reproduction Steps
1. Visit `https://slashmcp.vercel.app` in an incognito window.
2. Click **Sign in with Google**, choose a Google account, and grant consent.
3. After Google redirects back (URL includes `#access_token=…`), observe the page:
   - The loading screen never advances, _or_
   - It quickly flips back to the “Sign in with Google” prompt.
4. Open DevTools → Console and observe the warnings below.
5. Check DevTools → Application → Local Storage (`https://slashmcp.vercel.app`) and notice the Supabase key `sb-akxdroedpsvmckvqvggr-auth-token` exists even though the UI still says “Sign in required.”

## Console Output
Two distinct errors appear:

```text
@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew 1764636298 1764639898 1764636296
_getSessionFromURL @ inpage.js:404

Auth check timeout - attempting local session restore
    at index-*.js:451
```

- The first warning is emitted directly by Supabase’s GoTrue client when it tries to parse the `#access_token` hash and rejects it because the token’s `issued_at` is “in the future”.
- The second warning comes from `src/hooks/useChat.ts` when `supabaseClient.auth.getSession()` never resolves; after a 5‑second timeout we try to hydrate from storage but the UI already resets to the unauthenticated state.

Even after force‑syncing Windows Time (`w32tm /resync /force`) the warnings persist, so this is not just a one‑off client clock issue.

## Root Cause Clues
- We now disable `detectSessionInUrl` on both Supabase clients (`src/lib/supabaseClient.ts` and `src/integrations/supabase/client.ts`) and manually call `supabaseClient.auth.setSession()` with the tokens pulled from `window.location.hash`.
- Despite that, GoTrue still tries to parse the URL hash on initial page load – likely because another dependency bundles its own Supabase client with default settings (e.g., a hidden helper or legacy code path).
- When GoTrue rejects the session as “issued in the future,” our manual `setSession()` call succeeds but the SDK remains in an error state and `auth.getSession()` never resolves. We only detect this via `Auth check timeout` and fall back to the login screen.
- Because the `sb-*` localStorage entry remains populated, every refresh repeats the failure loop.

## Why This Matters
- The bug is persistent after multiple redeploys and after syncing the OS clock.
- Users must manually clear site storage _and_ hope the login succeeds before GoTrue rejects the token again; most users cannot work around it.
- This is a regression introduced around commit `da10c90` when we changed the login flow to parse the OAuth hash ourselves.

## Suggested Next Steps (for whoever picks this up)
1. Search for any remaining Supabase clients created without `detectSessionInUrl: false` (including third‑party packages or legacy files not covered by the last patch).
2. Instrument `applySessionFromUrl()` to log whether `setSession()` resolves and whether `auth.getSession()` ever fires its promise/`onAuthStateChange`.
3. Consider short‑circuiting GoTrue entirely by stripping the `#access_token` fragment from `window.location.href` before any Supabase code runs (e.g., in `index.html` or at the top of the entry bundle) so no automatic parser ever sees it.
4. Document the issue in Supabase support / forums if it turns out to be a server‑side timing skew so we can reference an upstream fix.

_This report focuses on describing and documenting the bug; no code changes are made here beyond the earlier failed fixes. A dedicated ticket/issue should be created so the platform team can implement and verify a proper solution._

