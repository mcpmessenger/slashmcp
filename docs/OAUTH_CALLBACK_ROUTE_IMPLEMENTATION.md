# OAuth Callback Route Implementation - Working Solution

**Status:** ✅ WORKING - Successfully resolved OAuth login/logout loops  
**Date:** January 2025

## Overview

This document describes the working implementation of the dedicated OAuth callback route that fixed the persistent OAuth login and logout loop issues in the SlashMCP application.

## Problem Solved

Previously, users experienced infinite redirect loops when attempting to authenticate via Google OAuth:
- Login loop: User would sign in, but the app would immediately redirect back to login
- Logout loop: After logging out, the OAuth flow would restart immediately
- Session would appear in localStorage but app wouldn't recognize it

## Solution: Dedicated Callback Route

The solution implements a dedicated `/auth/callback` route that:
1. Isolates OAuth session processing from the main application
2. Properly waits for Supabase to process the URL hash
3. Verifies session persistence before navigating
4. Captures OAuth tokens before leaving the callback route
5. Uses hard navigation to ensure clean state

## Implementation

### 1. OAuth Callback Component

**File:** `src/pages/OAuthCallback.tsx`

Key features:
- **DOES NOT** clear URL hash immediately (Supabase needs it with `detectSessionInUrl: true`)
- Waits for `onAuthStateChange` event with `SIGNED_IN`
- Verifies session is persisted to localStorage (retries up to 10 times)
- Captures OAuth tokens (Gmail, Calendar) via `capture-oauth-tokens` edge function
- Clears URL hash only after session is verified
- Sets `oauth_just_completed` flag in sessionStorage
- Uses `window.location.href` for hard navigation to `/`

### 2. Routing Configuration

**File:** `src/App.tsx`

```typescript
import OAuthCallback from "./pages/OAuthCallback";

<Routes>
  <Route path="/" element={<Index />} />
  <Route path="/auth/callback" element={<OAuthCallback />} />
  {/* ... other routes ... */}
</Routes>
```

### 3. OAuth Login Functions

**Files:** `src/hooks/useChat.ts`, `src/pages/Workflows.tsx`

```typescript
const baseUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL || window.location.origin;
const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/callback`;

await supabaseClient.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo, // Points to /auth/callback
    queryParams: {
      access_type: "offline",
      prompt: "consent",
      scope: "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar",
    },
  },
});
```

### 4. Logout Function

**File:** `src/hooks/useChat.ts`

```typescript
const signOut = useCallback(async () => {
  // Clear local state
  updateSession(null);
  setGuestMode(false);
  // ... clear localStorage, sessionStorage, etc.
  
  // Call Supabase sign-out
  const { error } = await supabaseClient.auth.signOut();
  
  if (!error) {
    // Hard navigate to home after sign-out
    setTimeout(() => {
      window.location.href = "/";
    }, 500);
  }
}, []);
```

### 5. Index Page Updates

**File:** `src/pages/Index.tsx`

Prevents showing login prompt immediately after OAuth callback:

```typescript
const oauthJustCompleted = typeof window !== 'undefined' && 
  sessionStorage.getItem('oauth_just_completed') === 'true';

{/* Sign-in prompt banner */}
{authReady && !session && !guestMode && !oauthJustCompleted && (
  {/* ... login prompt ... */}
)}
```

### 6. Supabase Configuration

**Supabase Dashboard → Authentication → URL Configuration**

**Site URL:**
- Production: `https://slashmcp.vercel.app`
- Local: `http://localhost:5173`

**Redirect URLs:**
- `https://slashmcp.vercel.app/auth/callback` (production)
- `http://localhost:5173/auth/callback` (local)
- `https://slashmcp.vercel.app` (base URL, optional)

## Flow Diagram

```
1. User clicks "Sign in with Google"
   ↓
2. Redirect to Google OAuth
   ↓
3. User authorizes
   ↓
4. Google → Supabase callback
   (https://akxdroedpsvmckvqvggr.supabase.co/auth/v1/callback)
   ↓
5. Supabase processes OAuth response
   ↓
6. Supabase → App callback route
   (https://slashmcp.vercel.app/auth/callback#access_token=...)
   ↓
7. OAuthCallback component:
   - Detects hash in URL
   - Waits for Supabase to process (detectSessionInUrl: true)
   - Listens for onAuthStateChange SIGNED_IN event
   - Verifies session in localStorage (retries if needed)
   - Captures OAuth tokens via edge function
   - Clears URL hash
   - Sets oauth_just_completed flag
   - Hard navigates to /
   ↓
8. Main app loads:
   - Sees oauth_just_completed flag
   - Doesn't show login prompt
   - Session is active
   - User is authenticated ✅
```

## Critical Implementation Details

### Why This Works

1. **Isolated Processing:** The callback route is isolated from the main app's routing and state management, preventing race conditions.

2. **Proper Hash Handling:** The hash is NOT cleared immediately. With `detectSessionInUrl: true`, Supabase needs the hash to process the session. We only clear it after verification.

3. **Session Verification:** We verify the session is actually persisted to localStorage before navigating, ensuring the main app will find it.

4. **Token Capture:** OAuth tokens are captured in the callback route as a safeguard, ensuring they're stored even if the main app's listener isn't active yet.

5. **Hard Navigation:** Using `window.location.href` ensures a complete page reload with clean state, preventing stale React state issues.

### Common Pitfalls to Avoid

❌ **DON'T** clear the URL hash immediately - Supabase needs it  
❌ **DON'T** use React Router's `navigate()` immediately - session might not be ready  
❌ **DON'T** rely on a single `getSession()` call - verify persistence with retries  
✅ **DO** wait for `onAuthStateChange` SIGNED_IN event  
✅ **DO** verify session is in localStorage before navigating  
✅ **DO** use hard navigation (`window.location.href`) for clean state  
✅ **DO** capture OAuth tokens in the callback as a safeguard

## Testing

To verify the implementation:

1. **Clear browser data** (localStorage, sessionStorage, cookies)
2. Visit `https://slashmcp.vercel.app`
3. Click "Sign in with Google"
4. Complete OAuth flow
5. Verify:
   - ✅ You're redirected to `/auth/callback` (briefly)
   - ✅ See "Processing Login..." message
   - ✅ Automatically redirected to `/`
   - ✅ You're logged in (no login prompt)
   - ✅ Session exists in localStorage
   - ✅ OAuth tokens captured (check console logs)

## Related Files

- `src/pages/OAuthCallback.tsx` - Main callback component
- `src/App.tsx` - Routing configuration
- `src/hooks/useChat.ts` - OAuth login/logout functions
- `src/pages/Workflows.tsx` - OAuth login for workflows
- `src/pages/Index.tsx` - Main page with login prompt guard
- `src/lib/supabaseClient.ts` - Supabase client config (`detectSessionInUrl: true`)
- `supabase/functions/capture-oauth-tokens/index.ts` - Token capture edge function

## Troubleshooting

### Issue: Still seeing login loop

**Check:**
- Supabase redirect URLs are configured correctly
- `redirectTo` in code matches Supabase configuration
- URL hash is NOT cleared before Supabase processes it
- Browser console for `[OAuthCallback]` log messages

### Issue: Session not persisting

**Check:**
- Session verification retries are working (check console logs)
- localStorage is not being cleared prematurely
- `detectSessionInUrl: true` in supabaseClient config

### Issue: OAuth tokens not captured

**Check:**
- Token capture in callback component (console logs)
- Fallback capture in `useChat` hook's `onAuthStateChange`
- Edge function logs in Supabase Dashboard

## Conclusion

This implementation successfully resolves the OAuth login and logout loops by:
- Isolating session processing in a dedicated route
- Properly handling the OAuth callback flow
- Ensuring session persistence before navigation
- Using hard navigation for clean state

The solution follows Supabase's recommended pattern for SPAs and is now stable in production.

---
**Status:** ✅ Production Ready  
**Last Updated:** January 2025

