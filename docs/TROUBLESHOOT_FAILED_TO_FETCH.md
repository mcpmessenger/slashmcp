# Troubleshoot: "Failed to fetch" Error on Upload Registration

## Problem

The initial `registerUploadJob` fetch call fails with `TypeError: Failed to fetch` before the request reaches the server.

## What This Means

"Failed to fetch" as a **synchronous error** (not a timeout) means the browser is blocking the request **before** it tries to send it. This is different from a network timeout or server error.

## Diagnostic Steps

### Step 1: Check Browser Console

After the fix, you should see:
```
[registerUploadJob] Testing OPTIONS preflight to: ...
[registerUploadJob] OPTIONS preflight response: {...}
[registerUploadJob] Sending POST request...
```

**If OPTIONS preflight fails:**
- CORS issue - Edge Function not allowing preflight
- Network connectivity problem

**If OPTIONS succeeds but POST fails:**
- Different issue - check the specific error

### Step 2: Check Network Tab

1. Open DevTools → Network tab
2. Try uploading a file
3. Look for:
   - **OPTIONS request** to `/functions/v1/uploads` - Should return 200/204
   - **POST request** to `/functions/v1/uploads` - This is the one failing

**If no requests appear:**
- Browser extension blocking (try incognito)
- Network connectivity issue
- Request being blocked before network layer

**If OPTIONS appears but POST doesn't:**
- CORS preflight succeeded but actual request blocked
- Check CORS headers in OPTIONS response

### Step 3: Test in Incognito Mode

1. Open browser in incognito/private mode
2. Try uploading again
3. If it works → Browser extension is blocking

### Step 4: Check Supabase Edge Function Status

1. Go to Supabase Dashboard
2. Edge Functions → `uploads` function
3. Check logs for any errors
4. Verify function is deployed and running

### Step 5: Test URL Directly

Open browser console and run:
```javascript
// Test if the URL is reachable
fetch('https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/uploads', {
  method: 'OPTIONS',
  headers: {
    'Origin': window.location.origin,
    'Access-Control-Request-Method': 'POST',
  }
})
.then(r => console.log('OPTIONS test:', r.status, r.ok))
.catch(e => console.error('OPTIONS test failed:', e));
```

**Expected:** Should return 200/204
**If fails:** Network or CORS issue

## Common Causes & Fixes

### 1. Browser Extension Blocking

**Symptom:** Works in incognito, fails in normal mode
**Fix:** Disable extensions one by one to find the culprit

### 2. CORS Issue

**Symptom:** OPTIONS preflight fails or returns non-200
**Check:** Supabase Edge Function CORS headers
**Fix:** Verify `uploads` function has proper CORS headers:
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, PATCH, DELETE, OPTIONS",
};
```

### 3. Network Connectivity

**Symptom:** All requests fail, no network activity
**Fix:** Check internet connection, try different network

### 4. Mixed Content (HTTP/HTTPS)

**Symptom:** App on HTTP trying to call HTTPS endpoint
**Fix:** Ensure app is served over HTTPS (Vercel should handle this)

### 5. Invalid URL

**Symptom:** URL looks wrong in console logs
**Check:** `VITE_SUPABASE_URL` or `VITE_SUPABASE_FUNCTIONS_URL` env vars
**Fix:** Verify environment variables in Vercel dashboard

## Quick Test

Run this in browser console to test connectivity:

```javascript
// Test 1: Can we reach Supabase?
fetch('https://akxdroedpsvmckvqvggr.supabase.co')
  .then(() => console.log('✅ Supabase reachable'))
  .catch(e => console.error('❌ Supabase unreachable:', e));

// Test 2: Can we reach Edge Functions?
fetch('https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/uploads', {
  method: 'OPTIONS'
})
  .then(r => console.log('✅ Edge Functions reachable:', r.status))
  .catch(e => console.error('❌ Edge Functions unreachable:', e));
```

## What the Fix Does

1. **Tests OPTIONS preflight first** - Helps diagnose CORS issues
2. **Better error messages** - Shows exactly what failed
3. **More diagnostics** - Logs URL, headers, and possible causes

## Next Steps

1. **Refresh page** - New code with diagnostics should load
2. **Try upload again** - Check console for new diagnostic logs
3. **Check Network tab** - See which request is failing
4. **Test in incognito** - Rule out browser extensions
5. **Check Supabase logs** - Edge Function logs will show server-side issues
