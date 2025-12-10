# Debugging OAuth Login Loop

## Current Issue
- Google OAuth approval succeeds (200 OK in Network tab)
- User is redirected back to login page instead of main app
- Session token exists in localStorage but app doesn't recognize it

## Step-by-Step Debugging

### 1. Check Browser Console
Open DevTools (F12) → Console tab and look for these messages:

**Expected flow:**
```
[OAuthCallback] OAuth hash detected in URL, waiting for Supabase to process...
[OAuthCallback] 🔍 Immediate session check...
[OAuthCallback] 🔔 Auth state change: SIGNED_IN has session
[OAuthCallback] ✅ Session establishment detected, verifying persistence...
[OAuthCallback] Session verified in both Supabase and localStorage
[OAuthCallback] ✅ Final session check passed (both Supabase and localStorage), redirecting...
[OAuthCallback] 🔄 Redirecting to home page...
[Auth] ✅ Found session in localStorage, restoring immediately...
```

**If you see errors:**
- `[OAuthCallback] No OAuth hash in URL` → Callback route not receiving the hash
- `[OAuthCallback] ❌ No session found on timeout` → Session not being established
- `[Auth] No session found in localStorage` → Session not persisting

### 2. Check Network Tab
Look for these requests:

1. **Google OAuth approval** (should be 200 OK) ✅
2. **Supabase callback** → Should redirect to `/auth/callback#access_token=...`
3. **Page navigation** → Should show redirect from `/auth/callback` to `/`

**If callback route isn't hit:**
- Check Supabase redirect URL configuration
- Should be: `https://slashmcp.vercel.app/auth/callback`

### 3. Check localStorage
In DevTools → Application → Local Storage → `https://slashmcp.vercel.app`:

Look for key: `sb-akxdroedpsvmckvqvggr-auth-token`

**If it exists:**
- Click on it to see the value
- Should contain `access_token`, `user`, `expires_at`
- Check if `expires_at` is in the future

**If it doesn't exist:**
- Session isn't being saved
- Check console for errors about localStorage

### 4. Check sessionStorage
In DevTools → Application → Session Storage:

Look for:
- `oauth_just_completed` = `"true"`
- `oauth_completed_at` = timestamp

**If missing:**
- Callback isn't setting the flag
- Main page might show login prompt too early

### 5. Manual Session Check
Run this in the browser console:

```javascript
// Check if session exists
const sessionKey = 'sb-akxdroedpsvmckvqvggr-auth-token';
const raw = localStorage.getItem(sessionKey);
if (raw) {
  const parsed = JSON.parse(raw);
  console.log('Session structure:', Object.keys(parsed));
  console.log('Has access_token:', !!parsed.access_token);
  console.log('Has user:', !!parsed.user);
  console.log('Expires at:', new Date(parsed.expires_at * 1000));
  console.log('Is expired:', parsed.expires_at < Math.floor(Date.now() / 1000));
} else {
  console.log('No session found in localStorage');
}
```

### 6. Check URL After OAuth
After clicking "Sign in with Google", check the URL:

**Expected:**
- `https://slashmcp.vercel.app/auth/callback#access_token=...`

**If you see:**
- `https://slashmcp.vercel.app/` (no hash) → Hash was cleared too early
- `https://slashmcp.vercel.app/auth/callback` (no hash) → Hash was cleared before processing

### 7. Force Session Restoration
If session exists in localStorage but app doesn't recognize it:

```javascript
// Force reload to trigger session restoration
window.location.reload();
```

Or manually trigger session check:

```javascript
// Get session from localStorage
const sessionKey = 'sb-akxdroedpsvmckvqvggr-auth-token';
const raw = localStorage.getItem(sessionKey);
if (raw) {
  const parsed = JSON.parse(raw);
  const session = parsed.currentSession || parsed.session || parsed;
  
  // Set session manually
  window.supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  }).then(() => {
    console.log('Session manually set, reloading...');
    window.location.href = '/';
  });
}
```

## Common Issues & Fixes

### Issue: Callback route not being hit
**Symptom:** No `[OAuthCallback]` logs in console
**Fix:** Check Supabase Dashboard → Authentication → URL Configuration
- Add: `https://slashmcp.vercel.app/auth/callback`

### Issue: Hash cleared too early
**Symptom:** URL has no hash when callback loads
**Fix:** Already handled - hash is only cleared after session verification

### Issue: Session not persisting
**Symptom:** Session exists but disappears
**Fix:** Check localStorage quota, browser privacy settings

### Issue: Session expired immediately
**Symptom:** `expires_at` is in the past
**Fix:** Check system clock, Supabase token expiration settings

### Issue: Session format mismatch
**Symptom:** Session exists but `getStoredSupabaseSession()` returns null
**Fix:** Check console for parsing errors, verify session structure

## Next Steps

1. **Check console logs** - Look for `[OAuthCallback]` and `[Auth]` messages
2. **Check Network tab** - Verify callback route is hit
3. **Check localStorage** - Verify session is saved
4. **Share findings** - Provide console logs and any errors

## Quick Test

After making changes, test the flow:

1. Clear browser cache and localStorage
2. Go to `https://slashmcp.vercel.app`
3. Click "Sign in with Google"
4. Complete OAuth flow
5. Watch console for logs
6. Check if you're redirected to main app (not login page)




