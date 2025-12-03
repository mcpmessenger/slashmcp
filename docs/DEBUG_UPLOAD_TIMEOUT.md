# Debugging Upload Timeout - No Logs Found

## If No Logs Appear in Supabase

This means the request **didn't reach the Edge Function**. Let's debug step by step:

## Step 1: Check Browser Network Tab

1. **Open DevTools:**
   - Press `F12` or right-click → "Inspect"
   - Go to **"Network"** tab
   - Clear existing requests (trash icon)

2. **Try Uploading Again:**
   - Select a file to upload
   - Watch the Network tab

3. **Look for the Request:**
   - Filter by: `uploads` or `functions`
   - Find request to: `/functions/v1/uploads` or similar
   - Check:
     - **Status Code:** What is it? (200, 400, 500, or pending?)
     - **Request URL:** Is it correct?
     - **Response:** What does it say?
     - **Time:** How long did it take?

## Step 2: Check Console for Errors

1. **Go to Console Tab:**
   - Look for errors or warnings
   - Check for:
     - `[registerUploadJob]` logs
     - `FUNCTIONS_URL` errors
     - Network errors
     - CORS errors

## Step 3: Verify FUNCTIONS_URL

The frontend needs to know where to send the request. Check:

1. **Browser Console:**
   ```javascript
   // Run this in console:
   console.log('FUNCTIONS_URL:', import.meta.env.VITE_SUPABASE_FUNCTIONS_URL);
   console.log('SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
   ```

2. **Expected Values:**
   - `VITE_SUPABASE_FUNCTIONS_URL` should be: `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
   - Or `VITE_SUPABASE_URL` should be: `https://akxdroedpsvmckvqvggr.supabase.co`

## Step 4: Check Function Invocations

Even if logs don't show, invocations might:

1. **Go to:** https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/uploads
2. **Click "Invocations" tab**
3. **Check if function was called at all**

## Step 5: Common Issues

### Issue 1: FUNCTIONS_URL Not Set
**Symptom:** No request appears in Network tab
**Fix:** Set environment variable in Vercel/dotenv

### Issue 2: CORS Error
**Symptom:** Request appears but fails with CORS error
**Fix:** Edge Function CORS headers should be correct (already set)

### Issue 3: Request Not Sent
**Symptom:** No request in Network tab, console shows error
**Fix:** Check console for the actual error

### Issue 4: Wrong URL
**Symptom:** Request goes to wrong endpoint
**Fix:** Verify FUNCTIONS_URL is correct

## What to Share

When checking, please share:
1. **Network Tab:** Screenshot or details of the `/uploads` request
2. **Console:** Any errors or warnings
3. **FUNCTIONS_URL:** What it shows in console
4. **Invocations Tab:** Whether function was called

This will help identify where the request is failing.

