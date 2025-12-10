# Fix Production Upload Timeout Error

## Problem

On production site (`slashmcp.vercel.app`), you're seeing:
```
Upload registration timed out after 30 seconds.
The uploads Edge Function may be slow or unavailable.
```

## Root Causes

1. **Missing `apikey` header** (most likely)
   - The fix we just made isn't deployed to production yet
   - Supabase API gateway rejects requests without `apikey` header
   - Request hangs/times out

2. **Uploads function slow/unresponsive**
   - Function might be taking >30 seconds
   - AWS operations might be slow
   - Function might be failing silently

3. **Network/CORS issues**
   - Request blocked by browser/network
   - CORS configuration issue

## Immediate Fix

### Step 1: Deploy Frontend Fix to Production

**The `apikey` header fix needs to be deployed:**

```powershell
# Commit the changes
git add src/lib/api.ts
git commit -m "Fix: Ensure apikey header is always included in Edge Function requests"

# Push to trigger Vercel deployment
git push
```

**Or manually deploy:**
```powershell
vercel --prod
```

**Wait 2-3 minutes** for Vercel to build and deploy.

### Step 2: Check Production Logs

**After deploying, check uploads function logs:**
- https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/uploads/logs

**Look for:**
- ✅ `=== Uploads Edge Function Request Start ===` - Function is being called
- ✅ `Presigned URL created in Xms` - Function is working
- ❌ `No API key found` - Still getting apikey error (fix not deployed yet)
- ❌ No logs at all - Function isn't being called (CORS/network issue)

### Step 3: Verify Environment Variables

**Check Vercel production env vars:**
1. Go to: https://vercel.com/dashboard
2. Your project → Settings → Environment Variables
3. Verify:
   - `VITE_SUPABASE_URL` = `https://akxdroedpsvmckvqvggr.supabase.co`
   - `VITE_SUPABASE_FUNCTIONS_URL` = `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = (your anon key)

### Step 4: Test After Deploy

**After Vercel finishes deploying:**

1. **Hard refresh** production site (Ctrl+Shift+R)
2. **Open browser console** (F12)
3. **Look for:**
   - `[api.ts] FUNCTIONS_URL configured: https://...`
   - `[getAuthHeaders] Using anon key...` with `hasApikey: true`
4. **Try uploading a document**
5. **Check Network tab:**
   - Request to `/functions/v1/uploads`
   - Should have `apikey` header
   - Should complete in <5 seconds (not timeout)

## Diagnostic Steps

### Check Browser Console

**On production site, open console and look for:**

**Good signs:**
- `[api.ts] FUNCTIONS_URL configured: https://...`
- `[getAuthHeaders] Using anon key...` with `hasApikey: true`
- `[registerUploadJob] Auth headers prepared` with `hasApikey: true`

**Bad signs:**
- `Missing VITE_SUPABASE_FUNCTIONS_URL`
- `WARNING: SUPABASE_ANON_KEY is not set`
- `[getAuthHeaders] ERROR: No session and no anon key available`
- `Failed to get authentication headers`

### Check Network Tab

**When uploading:**
1. Open Network tab
2. Find request to `/functions/v1/uploads`
3. Check:
   - **Status:** Should be 200 (not timeout/404/401)
   - **Request Headers:** Should include `apikey` header
   - **Time:** Should be <5 seconds (not 30s timeout)

### Check Supabase Function Logs

**Uploads function logs:**
- https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/uploads/logs

**What to look for:**
- ✅ Function is being called
- ✅ Function completes successfully
- ❌ "No API key found" error
- ❌ Function errors/timeouts

## Common Issues

### Issue 1: Fix Not Deployed Yet

**Symptom:** Still getting timeout after deploying

**Fix:**
1. Wait 2-3 minutes for Vercel deployment
2. Hard refresh browser (Ctrl+Shift+R)
3. Check Vercel deployment status

### Issue 2: Environment Variables Not Set

**Symptom:** Console shows "Missing VITE_SUPABASE_FUNCTIONS_URL"

**Fix:**
1. Go to Vercel Dashboard → Settings → Environment Variables
2. Add missing variables
3. Redeploy

### Issue 3: Uploads Function Slow

**Symptom:** Function is called but takes >30 seconds

**Fix:**
1. Check uploads function logs for errors
2. Check AWS credentials/secrets
3. Check if AWS operations are slow

### Issue 4: Still Getting "No API key" Error

**Symptom:** Function logs show "No API key found"

**Fix:**
1. Verify frontend fix is deployed (check git commit)
2. Hard refresh browser
3. Check browser console for `hasApikey: true`
4. Check Network tab for `apikey` header

## Quick Test

**After deploying, test in browser console on production:**

The code should log:
```
[getAuthHeaders] Using anon key for authorization (no session or session failed)
  hasApikey: true
  hasAuthorization: true
```

**If you see `hasApikey: false`:**
- Check `.env.local` has `VITE_SUPABASE_PUBLISHABLE_KEY` (for local)
- Check Vercel has `VITE_SUPABASE_PUBLISHABLE_KEY` (for production)

## Summary

**The fix is ready** - just needs to be deployed to production:

1. ✅ **Code fixed** - `src/lib/api.ts` ensures `apikey` header is always included
2. ⏳ **Deploy to production** - `git push` to trigger Vercel deployment
3. ✅ **Test** - After deploy, upload should work

**The timeout is likely because:**
- Request is missing `apikey` header
- Supabase API gateway rejects it
- Request hangs until timeout

**After deploying the fix, the `apikey` header will be included and the timeout should be resolved.**



