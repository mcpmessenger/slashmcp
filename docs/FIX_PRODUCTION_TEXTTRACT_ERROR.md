# Fix "Failed to trigger Textract job: Network error" on Deployed Site

## Problem
On the deployed site, you see this error:
```
Failed to trigger Textract job: Network error - Failed to fetch
This may indicate a CORS problem, network connectivity issue, or the textract-worker function is unavailable.
```

This means the `triggerTextractJob()` function cannot reach the `textract-worker` Edge Function.

## Root Causes

1. **Missing Environment Variables** (Most Common)
   - `VITE_SUPABASE_URL` or `VITE_SUPABASE_FUNCTIONS_URL` not set in Vercel
   - Function URL is `undefined` at runtime

2. **CORS Configuration Issue**
   - `textract-worker` function doesn't allow requests from your production domain

3. **Function Not Deployed**
   - `textract-worker` Edge Function doesn't exist or isn't deployed

## Fix Steps

### Step 1: Verify Environment Variables in Vercel

1. **Go to Vercel Dashboard:**
   - https://vercel.com/dashboard
   - Find your project (`slashmcp` or similar)
   - Click on it

2. **Navigate to Environment Variables:**
   - Click **"Settings"** → **"Environment Variables"**

3. **Check Required Variables:**

   **Required:**
   - `VITE_SUPABASE_URL` = `https://akxdroedpsvmckvqvggr.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = (your anon key)

   **Recommended:**
   - `VITE_SUPABASE_FUNCTIONS_URL` = `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`

4. **Verify Environment:**
   - Make sure variables are set for **"Production"** environment
   - Or set for **"All Environments"**

### Step 2: Add Missing Variables

**If `VITE_SUPABASE_URL` is missing:**

1. Click **"Add New"**
2. **Key:** `VITE_SUPABASE_URL`
3. **Value:** `https://akxdroedpsvmckvqvggr.supabase.co`
4. **Environment:** Select **"Production"** (or "All Environments")
5. Click **"Save"**

**If `VITE_SUPABASE_FUNCTIONS_URL` is missing (optional but recommended):**

1. Click **"Add New"**
2. **Key:** `VITE_SUPABASE_FUNCTIONS_URL`
3. **Value:** `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
4. **Environment:** Select **"Production"** (or "All Environments")
5. Click **"Save"**

### Step 3: Redeploy

**After adding/updating environment variables:**

1. **Option A: Wait for Auto-Redeploy**
   - Vercel will auto-redeploy if enabled
   - Wait 2-3 minutes

2. **Option B: Manual Redeploy**
   - Go to **"Deployments"** tab
   - Click **"..."** on latest deployment
   - Click **"Redeploy"**

### Step 4: Verify Function is Deployed

**Check if `textract-worker` function exists:**

1. **Go to Supabase Dashboard:**
   - https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions

2. **Look for `textract-worker`:**
   - Should be in the list
   - Status should be "Active" or "Deployed"

3. **If missing, deploy it:**
   ```powershell
   npx supabase functions deploy textract-worker --project-ref akxdroedpsvmckvqvggr
   ```

### Step 5: Check CORS Configuration

**Verify `textract-worker` has proper CORS:**

1. **Check the function code:**
   - File: `supabase/functions/textract-worker/index.ts`
   - Should have CORS headers defined

2. **Should include:**
   ```typescript
   const corsHeaders = {
     "Access-Control-Allow-Origin": "*",
     "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
     "Access-Control-Allow-Methods": "POST, OPTIONS",
   };
   ```

3. **If CORS is wrong, fix and redeploy:**
   ```powershell
   npx supabase functions deploy textract-worker --project-ref akxdroedpsvmckvqvggr
   ```

### Step 6: Test in Production

**After redeploy:**

1. **Hard refresh the page** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Open browser console** (F12)
3. **Look for:**
   - `[api.ts] FUNCTIONS_URL configured: https://...` ✅ Good
   - `Missing VITE_SUPABASE_FUNCTIONS_URL` ❌ Bad - variables not set

4. **Try uploading a document:**
   - Should see `[triggerTextractJob] Calling: ...` in console
   - Should NOT see "Network error - Failed to fetch"
   - Network tab should show successful request to `/functions/v1/textract-worker`

## Quick Diagnostic

**In browser console on production site, run:**

```javascript
// Check if FUNCTIONS_URL is configured
console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_FUNCTIONS_URL:', import.meta.env.VITE_SUPABASE_FUNCTIONS_URL);

// Check computed FUNCTIONS_URL
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || 
  (import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : undefined);
console.log('Computed FUNCTIONS_URL:', FUNCTIONS_URL);
```

**Expected output:**
- `VITE_SUPABASE_URL`: `https://akxdroedpsvmckvqvggr.supabase.co`
- `Computed FUNCTIONS_URL`: `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`

**If `undefined`:**
- Environment variables are not set in Vercel
- Follow Step 1-3 above

## Common Issues

### Issue 1: Variables Set But Not Propagated

**Symptom:** Variables exist in Vercel but app still shows error

**Fix:**
1. Wait 2-3 minutes for auto-redeploy
2. Or manually trigger redeploy
3. Hard refresh browser (Ctrl+Shift+R)

### Issue 2: Variables Set for Wrong Environment

**Symptom:** Variables exist but only for "Development" or "Preview"

**Fix:**
1. Edit the variable in Vercel
2. Change environment to "Production" or "All Environments"
3. Redeploy

### Issue 3: Function Not Deployed

**Symptom:** Variables are correct but function doesn't exist

**Fix:**
```powershell
# Deploy the function
npx supabase functions deploy textract-worker --project-ref akxdroedpsvmckvqvggr

# Verify it's deployed
npx supabase functions list --project-ref akxdroedpsvmckvqvggr
```

### Issue 4: CORS Error

**Symptom:** Network request fails with CORS error in console

**Fix:**
1. Check `textract-worker` function CORS headers
2. Ensure `Access-Control-Allow-Origin: *` is set
3. Redeploy the function

## Verification Checklist

- [ ] `VITE_SUPABASE_URL` exists in Vercel Production environment
- [ ] `VITE_SUPABASE_URL` value is: `https://akxdroedpsvmckvqvggr.supabase.co`
- [ ] `VITE_SUPABASE_FUNCTIONS_URL` is set (optional but recommended)
- [ ] App has been redeployed after adding variables
- [ ] Browser console shows `FUNCTIONS_URL configured: https://...`
- [ ] `textract-worker` function is deployed in Supabase
- [ ] Network tab shows successful request to `/functions/v1/textract-worker`

## Still Not Working?

If error persists after fixing environment variables:

1. **Check Network Tab:**
   - Look for request to `/functions/v1/textract-worker`
   - Check status code (should be 200, not 404/500)
   - Check if request is being made at all

2. **Check Function Logs:**
   - https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/textract-worker/logs
   - Look for incoming requests
   - If no logs, function isn't being called (CORS/network issue)

3. **Test Function Directly:**
   ```bash
   curl -X POST https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"jobId": "test-job-id"}'
   ```

4. **Check Browser Console:**
   - Look for `[triggerTextractJob] Calling: ...` log
   - Check the exact URL being called
   - Verify it matches your Supabase project URL

