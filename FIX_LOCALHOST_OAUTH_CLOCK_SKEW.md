# Fix: OAuth Redirect Not Logging In on Localhost (Clock Skew Issue)

## Problem
OAuth redirects to `localhost:8080/#access_token=...` but you're not logged in. Console shows:
- `"Session as retrieved from URL was issued in the future? Check the device clock for skew"`
- `[Auth] No session found in localStorage`

## Root Cause
**System clock is wrong or out of sync** - Supabase rejects JWT tokens that appear to be "from the future" due to clock skew.

## Quick Fix

### Step 1: Fix Your System Clock

**Windows:**
1. Right-click the time in the taskbar
2. Select "Adjust date/time"
3. Click "Sync now" to sync with internet time
4. Or manually set the correct time

**Mac:**
1. System Settings → General → Date & Time
2. Enable "Set time zone automatically using your location"
3. Or manually set the correct time

**Linux:**
```bash
sudo ntpdate -s time.nist.gov
# Or
sudo timedatectl set-ntp true
```

### Step 2: Verify Clock is Correct

Check your system time matches internet time:
- Visit: https://time.is
- Compare with your system clock
- Should be within 1-2 seconds

### Step 3: Clear Browser Data and Retry

After fixing the clock:
1. **Clear localStorage:**
   - Open DevTools (F12)
   - Application tab → Local Storage → `http://localhost:8080`
   - Right-click → Clear
   
2. **Clear sessionStorage:**
   - Application tab → Session Storage → `http://localhost:8080`
   - Right-click → Clear

3. **Hard refresh the page:** `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

4. **Try signing in again**

## Why This Happens

Supabase JWT tokens include a timestamp (`iat` - issued at). If your system clock is ahead of the server's clock, Supabase thinks the token is "from the future" and rejects it.

**Example:**
- Server time: `12:00:00 PM`
- Your clock: `12:05:00 PM` (5 minutes ahead)
- Token issued at: `12:00:00 PM` (server time)
- Your browser sees: "This token is from 5 minutes ago, but my clock says it's 12:05, so it must be from the future!" ❌

## Verification

After fixing the clock and signing in, check the console:
- ✅ Should see: `[OAuthCallback] ✅ Session establishment detected`
- ✅ Should see: `[OAuthCallback] Session verified in both Supabase and localStorage`
- ✅ Should see: `[getAuthHeaders] Using session token for authorization`
- ❌ Should NOT see: Clock skew warnings

## Alternative: Manual Session Set (If Clock Can't Be Fixed)

If you can't fix the system clock (e.g., corporate policy), you can manually extract the token from the URL hash:

1. **When redirected to `/auth/callback#access_token=...`:**
   - Open browser console
   - Run this code:

```javascript
// Extract token from URL hash
const hash = window.location.hash;
const params = new URLSearchParams(hash.substring(1));
const accessToken = params.get('access_token');
const refreshToken = params.get('refresh_token');

// Manually set session
const { data, error } = await window.supabase.auth.setSession({
  access_token: accessToken,
  refresh_token: refreshToken || ''
});

if (data.session) {
  console.log('✅ Session set manually!');
  window.location.href = '/';
} else {
  console.error('❌ Failed:', error);
}
```

## Prevention

To prevent this in the future:
- Enable automatic time sync on your system
- Check system time periodically
- Use NTP (Network Time Protocol) for accurate time

## Still Not Working?

If fixing the clock doesn't work:
1. Check Supabase redirect URL includes `http://localhost:8080/auth/callback`
2. Check `.env.local` has correct `VITE_SUPABASE_REDIRECT_URL`
3. Try incognito mode (rules out extension issues)
4. Check browser console for other errors

