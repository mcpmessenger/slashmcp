# Complete Session Reset Guide

## After Clearing localStorage and sessionStorage

If you've already cleared localStorage and sessionStorage but still having issues, try these additional steps:

### Step 1: Verify Everything is Cleared

**Open Browser Console (F12) and run:**

```javascript
// Check localStorage
console.log('LocalStorage:', localStorage.getItem('sb-akxdroedpsvmckvqvggr-auth-token'));

// Check sessionStorage
console.log('SessionStorage oauth flag:', sessionStorage.getItem('oauth_just_completed'));
console.log('SessionStorage sign-out flag:', sessionStorage.getItem('signing-out'));

// Check all Supabase-related keys
Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('sb-')).forEach(k => {
  console.log('Found:', k, localStorage.getItem(k));
});
```

**If any of these return values (not null), delete them:**
```javascript
// Delete all Supabase keys
Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('sb-')).forEach(k => {
  localStorage.removeItem(k);
  console.log('Deleted:', k);
});
```

### Step 2: Clear Cookies

**In DevTools → Application → Cookies:**
- Click on `http://localhost:8080`
- Delete all cookies (especially any with `supabase` or `sb-` in the name)

**Or in Console:**
```javascript
// Clear all cookies for localhost
document.cookie.split(";").forEach(c => {
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});
```

### Step 3: Clear Service Workers (if any)

**In DevTools → Application → Service Workers:**
- Click "Unregister" for any service workers
- Check "Update on reload" and reload

### Step 4: Verify Clock is Correct

**In Console:**
```javascript
// Check your system time
console.log('Your system time:', new Date().toISOString());

// Compare with a time server (should be within 1-2 seconds)
fetch('https://worldtimeapi.org/api/timezone/UTC')
  .then(r => r.json())
  .then(data => {
    const serverTime = new Date(data.datetime);
    const localTime = new Date();
    const diff = Math.abs(serverTime - localTime) / 1000;
    console.log('Server time:', serverTime.toISOString());
    console.log('Time difference:', diff, 'seconds');
    if (diff > 5) {
      console.warn('⚠️ Clock is off by more than 5 seconds!');
    } else {
      console.log('✅ Clock is synchronized');
    }
  });
```

### Step 5: Hard Refresh and Clear Cache

**Option A: Hard Refresh**
- `Ctrl + Shift + R` (Windows/Linux)
- `Cmd + Shift + R` (Mac)

**Option B: Clear Browser Cache**
- `Ctrl + Shift + Delete` → Select "Cached images and files"
- Or in DevTools: Right-click refresh button → "Empty Cache and Hard Reload"

### Step 6: Try Incognito/Private Mode

This ensures no extensions or cached data interfere:
1. Open incognito/private window
2. Go to `http://localhost:8080`
3. Try signing in

### Step 7: Check for Multiple Tabs

- Close ALL tabs with `localhost:8080`
- Open ONE fresh tab
- Try signing in

### Step 8: Verify Supabase Client is Working

**In Console after page load:**
```javascript
// Check if Supabase client is initialized
console.log('Supabase URL:', window.supabase?.supabaseUrl);
console.log('Supabase Key:', window.supabase?.supabaseKey ? 'Set' : 'Missing');

// Try to get session
window.supabase.auth.getSession().then(({ data, error }) => {
  console.log('Current session:', data.session ? 'Exists' : 'None');
  if (error) console.error('Session error:', error);
});
```

### Step 9: Sign In Fresh

After all clearing:
1. Navigate to `http://localhost:8080`
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Watch console for:
   - `[OAuthCallback] OAuth hash detected`
   - `[OAuthCallback] ✅ Session establishment detected`
   - `[OAuthCallback] Session verified in both Supabase and localStorage`

### Step 10: If Still Not Working

**Check Network Tab during sign-in:**
- Look for `/auth/v1/callback` request (should be 200 OK)
- Look for `/auth/v1/user` request (should be 200 OK after sign-in, not 401)
- Check response headers for any errors

**Check Console for specific errors:**
- Clock skew warnings
- CORS errors
- Network errors
- JWT validation errors

## Common Issues After Clearing

### Issue: "No OAuth hash in URL"
**Cause:** Redirect URL mismatch
**Fix:** Verify Supabase Dashboard has `http://localhost:8080/auth/callback`

### Issue: Session not persisting
**Cause:** localStorage blocked or full
**Fix:** Check browser settings, clear space

### Issue: Still getting 401
**Cause:** Old token cached somewhere
**Fix:** Try incognito mode, check all storage locations

