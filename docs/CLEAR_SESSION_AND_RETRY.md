# Clear Session and Retry After Clock Fix

## Steps to Fix After Resetting Clock

### Step 1: Clear All Browser Storage

**In Browser DevTools (F12):**

1. **Application Tab** → **Local Storage**
   - Click on `http://localhost:8080`
   - Right-click → **Clear**
   - Or manually delete the key: `sb-akxdroedpsvmckvqvggr-auth-token`

2. **Application Tab** → **Session Storage**
   - Click on `http://localhost:8080`
   - Right-click → **Clear**
   - Or manually delete: `oauth_just_completed` and `oauth_completed_at`

3. **Application Tab** → **Cookies**
   - Click on `http://localhost:8080`
   - Delete any Supabase-related cookies

### Step 2: Hard Refresh

- **Windows/Linux:** `Ctrl + Shift + R`
- **Mac:** `Cmd + Shift + R`

Or close and reopen the browser tab.

### Step 3: Sign In Again

1. Click **"Sign in with Google"**
2. Complete the OAuth flow
3. You should be redirected to `/auth/callback#access_token=...`
4. Wait for it to process and redirect to `/`

### Step 4: Verify Session

**Check Browser Console:**
- ✅ Should see: `[OAuthCallback] ✅ Session establishment detected`
- ✅ Should see: `[getAuthHeaders] Using session token for authorization`
- ✅ Should NOT see: 401 errors

**Check Network Tab:**
- `/auth/v1/user` request should return **200 OK** (not 401)
- Should see your user data in the response

## If Still Getting 401

### Option 1: Try Incognito/Private Mode
- Rules out browser extension issues
- Fresh session state

### Option 2: Manual Session Check
Open browser console and run:
```javascript
// Check if session exists
const { data: { session } } = await window.supabase.auth.getSession();
console.log('Session:', session);

// If no session, check localStorage
const storageKey = 'sb-akxdroedpsvmckvqvggr-auth-token';
const stored = localStorage.getItem(storageKey);
console.log('Stored session:', stored ? JSON.parse(stored) : 'None');
```

### Option 3: Verify Clock is Correct
```javascript
// Check system time vs server time
console.log('System time:', new Date().toISOString());
// Compare with server time from network response headers
```

## Expected Flow After Clock Fix

1. ✅ Clock is correct (matches internet time)
2. ✅ Clear browser storage
3. ✅ Sign in with Google
4. ✅ OAuth callback processes successfully
5. ✅ Session saved to localStorage
6. ✅ Redirected to main app
7. ✅ `/auth/v1/user` returns 200 OK
8. ✅ Documents sidebar shows your user ID
9. ✅ File uploads work (no 401 errors)

