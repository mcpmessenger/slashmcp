# Verify Production Deployment

## Status

✅ **Fix is committed and pushed:**
- Commit: `95bae40 Fix: Ensure apikey header is always included`
- Already on `origin/main` (GitHub)

## Check Vercel Deployment

**The fix should be deployed if Vercel is connected to GitHub.**

### Step 1: Check Vercel Deployment Status

1. **Go to:** https://vercel.com/dashboard
2. **Find your project** (`slashmcp`)
3. **Check "Deployments" tab:**
   - Look for latest deployment
   - Should show commit `95bae40` or newer
   - Status should be "Ready" (green)

**If deployment is old or failed:**
- Click "Redeploy" on latest deployment
- Or wait for auto-deploy (if enabled)

### Step 2: Hard Refresh Production Site

**After confirming deployment:**

1. **Go to:** https://slashmcp.vercel.app
2. **Hard refresh:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. **This clears browser cache** and loads new code

### Step 3: Verify Fix is Loaded

**Open browser console (F12) and check:**

**Should see:**
```
[api.ts] FUNCTIONS_URL configured: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
```

**When uploading, should see:**
```
[getAuthHeaders] Using anon key for authorization (no session or session failed)
  hasApikey: true
  hasAuthorization: true
```

**If you see `hasApikey: false`:**
- Fix might not be deployed yet
- Or browser is using cached code
- Try incognito mode to test

### Step 4: Test Upload

**After hard refresh:**

1. **Upload a document**
2. **Watch console** for:
   - `[registerUploadJob] Auth headers prepared` with `hasApikey: true`
   - Should NOT see timeout error
3. **Check Network tab:**
   - Request to `/functions/v1/uploads`
   - Should have `apikey` header
   - Should complete quickly (<5 seconds)

## If Still Timing Out

### Check 1: Is Fix Actually Deployed?

**Verify the deployed code has the fix:**

1. **Check Vercel deployment logs:**
   - Vercel Dashboard → Deployments → Latest → Build Logs
   - Should show successful build

2. **Check browser is using new code:**
   - Hard refresh (Ctrl+Shift+R)
   - Or test in incognito mode
   - Check console for `hasApikey: true` logs

### Check 2: Check Function Logs

**If upload still times out, check uploads function:**

- https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/uploads/logs

**Look for:**
- ✅ Function is being called
- ✅ Function completes successfully
- ❌ "No API key found" - Still getting apikey error
- ❌ Function errors/timeouts

### Check 3: Check Network Tab

**When uploading, check the actual request:**

1. **Open Network tab** (F12)
2. **Find request** to `/functions/v1/uploads`
3. **Click on it** → Headers tab
4. **Check Request Headers:**
   - Should have `apikey: eyJ...`
   - Should have `authorization: Bearer eyJ...`

**If `apikey` header is missing:**
- Fix not deployed yet
- Or browser cache issue
- Try incognito mode

## Quick Test in Incognito

**To bypass browser cache:**

1. **Open incognito/private window**
2. **Go to:** https://slashmcp.vercel.app
3. **Open console** (F12)
4. **Upload a document**
5. **Check if timeout still occurs**

**If it works in incognito:**
- Browser cache issue
- Clear cache and try again

**If it still times out:**
- Fix might not be deployed
- Or there's another issue
- Check function logs

## Summary

**Current status:**
- ✅ Fix committed: `95bae40`
- ✅ Fix pushed to GitHub
- ⏳ **Check:** Is Vercel deployment up to date?
- ⏳ **Test:** Hard refresh and try upload

**Next steps:**
1. Check Vercel deployment status
2. Hard refresh production site
3. Test upload
4. Check console for `hasApikey: true`
5. If still timing out, check function logs




