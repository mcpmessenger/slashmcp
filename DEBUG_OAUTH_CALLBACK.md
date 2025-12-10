# Debug OAuth Callback - Session Not Establishing

## Current Issue
- OAuth redirects to `/auth/callback#access_token=...` ✅
- But you're not logged in after redirect ❌
- Getting 401 errors on authenticated requests ❌

## Debug Steps

### Step 1: Check What's in the Console

When you're redirected to `/auth/callback#access_token=...`, open the console and look for:

**Expected messages:**
```
[OAuthCallback] OAuth hash detected in URL, waiting for Supabase to process...
[OAuthCallback] 🔍 Immediate session check...
[OAuthCallback] 🔔 Auth state change: SIGNED_IN has session
[OAuthCallback] ✅ Session establishment detected, verifying persistence...
```

**If you see:**
- `[OAuthCallback] No OAuth hash in URL` → The hash isn't making it to the callback
- `[OAuthCallback] Manual setSession failed` → Token extraction/validation issue
- `[OAuthCallback] ❌ No session found on timeout` → Session not being established

### Step 2: Check the URL Hash

**In Console, run:**
```javascript
// Check if hash is present
console.log('URL hash:', window.location.hash);

// Extract token manually
const hash = window.location.hash;
if (hash) {
  const params = new URLSearchParams(hash.substring(1));
  console.log('Access token present:', !!params.get('access_token'));
  console.log('Refresh token present:', !!params.get('refresh_token'));
  console.log('Token type:', params.get('token_type'));
}
```

### Step 3: Try Manual Session Set

**If the automatic flow isn't working, try manually:**

```javascript
// Extract tokens from URL
const hash = window.location.hash;
const params = new URLSearchParams(hash.substring(1));
const accessToken = params.get('access_token');
const refreshToken = params.get('refresh_token');

if (accessToken) {
  // Try to set session manually
  const { data, error } = await window.supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken || ''
  });
  
  if (data.session) {
    console.log('✅ Session set manually!');
    console.log('User:', data.session.user.email);
    // Navigate to home
    window.location.href = '/';
  } else {
    console.error('❌ Failed to set session:', error);
  }
} else {
  console.error('❌ No access_token in hash');
}
```

### Step 4: Check Supabase Redirect URL

**Verify in Supabase Dashboard:**
1. Go to Authentication → URL Configuration
2. Under "Redirect URLs", make sure you have:
   - `http://localhost:8080/auth/callback`
   - `http://localhost:8080` (optional)

**If missing, add it and try again.**

### Step 5: Check Network Tab

**During OAuth flow, check:**
1. `/auth/v1/callback` request (should be 200 OK)
2. `/auth/v1/user` request (should be 200 OK after sign-in, not 401)
3. Look for any CORS errors
4. Check response headers for errors

### Step 6: Check localStorage After Redirect

**After being redirected to `/auth/callback`, check:**
```javascript
// Check if session was saved
const storageKey = 'sb-akxdroedpsvmckvqvggr-auth-token';
const stored = localStorage.getItem(storageKey);
if (stored) {
  const session = JSON.parse(stored);
  console.log('Session in localStorage:', {
    hasAccessToken: !!session.access_token,
    userEmail: session.user?.email,
    expiresAt: new Date(session.expires_at * 1000)
  });
} else {
  console.log('❌ No session in localStorage');
}
```

## Common Issues

### Issue 1: Hash Cleared Too Early
**Symptom:** Hash disappears before Supabase processes it
**Fix:** The callback component should NOT clear the hash until session is verified

### Issue 2: Supabase Not Processing Hash
**Symptom:** Hash is present but `getSession()` returns null
**Fix:** Try manual `setSession()` as shown in Step 3

### Issue 3: Session Not Persisting
**Symptom:** Session exists in memory but not in localStorage
**Fix:** Check browser settings, localStorage might be blocked

### Issue 4: Redirect URL Mismatch
**Symptom:** Redirect goes to wrong URL or hash is missing
**Fix:** Verify Supabase redirect URL matches exactly

## Quick Test

Run this in console when on `/auth/callback`:

```javascript
(async () => {
  console.log('=== OAuth Callback Debug ===');
  console.log('Hash:', window.location.hash.substring(0, 50) + '...');
  
  // Check current session
  const { data: { session }, error } = await window.supabase.auth.getSession();
  console.log('Current session:', session ? 'Exists' : 'None');
  if (error) console.error('Session error:', error);
  
  // Check localStorage
  const stored = localStorage.getItem('sb-akxdroedpsvmckvqvggr-auth-token');
  console.log('Stored session:', stored ? 'Exists' : 'None');
  
  // Try manual set if hash exists
  if (window.location.hash.includes('access_token') && !session) {
    console.log('Attempting manual session set...');
    const params = new URLSearchParams(window.location.hash.substring(1));
    const { data, error: setError } = await window.supabase.auth.setSession({
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token') || ''
    });
    if (data.session) {
      console.log('✅ Manual set successful!');
      window.location.href = '/';
    } else {
      console.error('❌ Manual set failed:', setError);
    }
  }
})();
```

