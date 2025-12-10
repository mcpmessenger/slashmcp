# Quick Fix: 401 "Invalid JWT" on Localhost

## Problem
Getting `401 "Invalid JWT"` errors when trying to upload files on localhost. This means you're not signed in.

## Quick Fix (3 Steps)

### Step 1: Sign In on Localhost

1. **Open the app:** `http://localhost:8080`
2. **Click "Sign in with Google"** (or the sign-in button in the header)
3. **Complete the OAuth flow**
4. **You should be redirected back to:** `http://localhost:8080/auth/callback`

### Step 2: Verify Supabase Redirect URL

Make sure Supabase allows localhost redirects:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (`akxdroedpsvmckvqvggr`)
3. Navigate to **Authentication** → **URL Configuration**
4. Under **Redirect URLs**, make sure you have:
   - `http://localhost:8080/auth/callback`
   - `http://localhost:8080` (optional but helpful)

### Step 3: Check .env.local

Make sure your `.env.local` file has:

```bash
VITE_SUPABASE_URL=https://akxdroedpsvmckvqvggr.supabase.co
VITE_SUPABASE_FUNCTIONS_URL=https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
VITE_SUPABASE_REDIRECT_URL=http://localhost:8080
```

**Important:** After creating/updating `.env.local`, restart your dev server:
```bash
# Stop the server (Ctrl+C)
npm run dev
```

## Verify It's Working

After signing in, check the browser console. You should see:
- `[getAuthHeaders] Using session token for authorization` ✅
- No more 401 errors ✅
- `propUserId: "some-user-id"` in DocumentsSidebar logs ✅

## If Sign-In Still Fails

### Check 1: Redirect URL Mismatch
**Error:** "Redirect URI mismatch"
**Fix:** Make sure Supabase Dashboard has exactly `http://localhost:8080/auth/callback` (no trailing slash, correct port)

### Check 2: Session Not Persisting
**Symptom:** Sign in works but session is lost on refresh
**Fix:** 
- Check browser console for localStorage errors
- Try incognito mode (rules out extension issues)
- Clear browser cache and try again

### Check 3: Port Mismatch
**Symptom:** Redirect goes to wrong port
**Fix:** 
- Check what port Vite is actually using (check terminal output)
- Update `.env.local` with correct port
- Update Supabase redirect URL to match

## After Sign-In Works

Once you're signed in:
1. ✅ Uploads will work (no more 401 errors)
2. ✅ Documents will appear in the left panel
3. ✅ Vision analysis will complete successfully

## Quick Test

1. Sign in with Google
2. Try uploading a file
3. Check console - should see `[registerUploadJob] Success` instead of 401
4. Documents should appear in left panel after processing

