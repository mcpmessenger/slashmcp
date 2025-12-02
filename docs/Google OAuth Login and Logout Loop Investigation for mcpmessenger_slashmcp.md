# Google OAuth Login and Logout Loop Investigation for mcpmessenger/slashmcp

## 1. Overview and Diagnosis

The user reported two persistent and related issues with Google OAuth authentication in the `mcpmessenger/slashmcp` application: a **login loop** and a subsequent **logout loop**. The application is a Single Page Application (SPA) built with React/Vite and uses Supabase for authentication.

### Root Cause Analysis

The investigation points to a common set of issues when integrating Supabase Auth with SPAs, particularly concerning how the Supabase client handles the session data returned in the URL hash after an OAuth redirect.

| Issue | Symptom | Probable Cause |
| :--- | :--- | :--- |
| **Login Loop** | Cycles between the OAuth provider and the login screen. | **Race condition in session detection.** The Supabase client is configured with `detectSessionInUrl: true` in `/src/lib/supabaseClient.ts`. After Google redirects back to the application, the URL contains session tokens (e.g., `...#access_token=...`). A race condition often occurs where the application's routing or state management logic runs before the Supabase client can successfully read the tokens, establish the session, and clear the URL. Seeing no session, the application redirects to the login page, restarting the loop. |
| **Logout Loop** | After logging out, the OAuth flow immediately restarts, or the user is not fully logged out. | **Incomplete session clearance or immediate re-detection.** When `supabaseClient.auth.signOut()` is called, it clears the local session. However, if a persistent session artifact (like a stale cookie or a token in the URL from a previous failed attempt) is not fully cleared, the application's session listener immediately detects a session state and attempts to refresh or re-authenticate, causing the loop. |

## 2. ✅ WORKING SOLUTION: Dedicated Callback Route and Session Management

**Status:** ✅ RESOLVED - This solution successfully fixed the OAuth login and logout loops.

The most robust solution is to move the session handling logic to a dedicated, isolated route that is solely responsible for processing the OAuth redirect and then navigating the user to the main application. This isolates the session-setting logic from the main application's rendering and routing logic, eliminating the race condition.

### Step 1: Create a Dedicated Callback Component

A new component, for example, `OAuthCallback.tsx`, should be created to handle the redirect. This component will ensure the Supabase client has time to process the URL hash before any other application logic runs.

**File:** `/src/pages/OAuthCallback.tsx` (Implemented and Working)

The actual working implementation includes:
- **Critical:** Does NOT clear the hash immediately - Supabase needs it to process the session first
- Waits for session to be fully persisted to localStorage before navigating
- Verifies session exists in both Supabase and localStorage
- Captures OAuth tokens (Gmail, Calendar) before navigating
- Uses `window.location.href` for hard navigation to ensure clean state
- Sets a flag to prevent premature login prompt on the main page

See `src/pages/OAuthCallback.tsx` for the complete working implementation.

### Step 2: Update Application Routing

The application's router (likely in `main.tsx` or `App.tsx`) needs to be updated to include this new route.

1.  **Configure the Router:** Add a route for the callback, e.g., `/auth/callback`.

    ```typescript
    // Example Router configuration (assuming react-router-dom)
    <Routes>
      {/* Existing routes */}
      <Route path="/auth/callback" element={<OAuthCallback />} />
      {/* ... */}
    </Routes>
    ```

2.  **Update Supabase Redirect URL:** The most critical step is to configure the Google OAuth redirect URL in your Supabase project settings to point to this new route:

    **Supabase Project Settings -> Authentication -> URL Configuration**
    *   **Site URL:** `https://slashmcp.vercel.app` (production) or `http://localhost:5173` (local)
    *   **Redirect URLs:** 
        - `https://slashmcp.vercel.app/auth/callback` (production)
        - `http://localhost:5173/auth/callback` (local development)
        - `https://slashmcp.vercel.app` (base URL, optional)

### Step 3: Modify Login and Logout Functions

**Login Function (`signInWithGoogle`):**

Ensure the `redirectTo` parameter in the `signInWithOAuth` call is set to the new callback route.

```typescript
// Actual working implementation in useChat.ts and Workflows.tsx
const baseUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL || window.location.origin;
// Remove trailing slash if present, then append /auth/callback
const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/callback`;

await supabaseClient.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo, // e.g., 'https://slashmcp.vercel.app/auth/callback'
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
      scope: 'openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar',
    },
  },
});
```

**Logout Function (`signOut`):**

To address the logout loop, ensure that after signing out, the user is immediately navigated to a public, non-session-checking route (like `/login` or `/`).

```typescript
// Actual working implementation in useChat.ts
const signOut = useCallback(async () => {
  // Clear local state first
  updateSession(null);
  setGuestMode(false);
  // ... clear localStorage, etc.
  
  // Call Supabase sign-out
  const { error } = await supabaseClient.auth.signOut();
  
  if (!error) {
    // Navigate to home page after successful sign-out to prevent session re-detection
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }, 500);
  }
}, []);
```

### Summary of Changes

| File/Location | Change | Purpose |
| :--- | :--- | :--- |
| **Supabase Dashboard** | Update **Redirect URLs** to `https://your-app-domain.com/auth/callback` | Directs the OAuth provider to the dedicated handler. |
| **New File** | Create `OAuthCallback.tsx` | Isolates session processing to prevent race conditions. |
| **Router Config** | Add route for `/auth/callback` | Maps the redirect URL to the new component. |
| **Login Logic** | Set `redirectTo` option to `/auth/callback` | Ensures the flow uses the new dedicated route. |
| **Logout Logic** | Ensure immediate navigation after `signOut()` | Prevents the application from re-detecting a stale session. |

## ✅ Implementation Status

**Status:** ✅ WORKING - Successfully resolved both login and logout loops

This approach is the standard, recommended pattern for handling OAuth redirects in Supabase SPAs and has successfully resolved both the login and logout looping issues by providing a clean, isolated environment for session establishment.

### Key Implementation Details

1. **Critical Fix:** The OAuth callback component does NOT clear the URL hash immediately. Supabase needs the hash with `detectSessionInUrl: true` to process the session. The hash is only cleared AFTER the session is verified to be persisted.

2. **Session Verification:** The callback component verifies the session is persisted to localStorage before navigating, preventing race conditions.

3. **Token Capture:** OAuth tokens (for Gmail, Calendar, etc.) are captured in the callback component to ensure they're stored even if the main app's `useChat` hook isn't mounted yet.

4. **Navigation:** Uses `window.location.href` for hard navigation to ensure a clean state when arriving at the main application.

### Files Modified

- ✅ `src/pages/OAuthCallback.tsx` - Created with full session handling
- ✅ `src/App.tsx` - Added `/auth/callback` route
- ✅ `src/hooks/useChat.ts` - Updated `signInWithGoogle` to use `/auth/callback`
- ✅ `src/pages/Workflows.tsx` - Updated OAuth login to use `/auth/callback`
- ✅ `src/pages/Index.tsx` - Added flag check to prevent premature login prompt
- ✅ Supabase Dashboard - Configured redirect URLs

### Testing

Tested and confirmed working:
- ✅ Google OAuth login completes successfully
- ✅ No login loop occurs
- ✅ User is properly authenticated after OAuth
- ✅ Logout works correctly without looping
- ✅ OAuth tokens are captured for Gmail/Calendar access

**Last Updated:** January 2025  
**Resolution Date:** Successfully resolved with dedicated callback route implementation
