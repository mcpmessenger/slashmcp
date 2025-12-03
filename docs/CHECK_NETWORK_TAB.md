# How to Check Network Tab for Upload Request

## Steps

1. **Open DevTools:**
   - Press `F12` or right-click → "Inspect"
   - Go to **"Network"** tab (next to Console)

2. **Clear Existing Requests:**
   - Click the 🚫 (clear) icon or press `Ctrl+L`

3. **Filter for Upload Request:**
   - In the filter box, type: `uploads` or `functions`
   - This will show only requests related to uploads

4. **Try Uploading Again:**
   - Select a file to upload
   - Watch the Network tab

5. **Look for the Request:**
   - Find request with URL containing: `/functions/v1/uploads` or `/uploads`
   - Click on it to see details

6. **Check Request Details:**
   - **Headers tab:** 
     - Request URL: Should be `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/uploads`
     - Request Method: Should be `POST`
     - Request Headers: Should include `Authorization` and `apikey`
   - **Response tab:**
     - Status Code: What is it? (200, 400, 500, or pending?)
     - Response body: What does it say?
   - **Timing tab:**
     - How long did it take?
     - Where did it hang? (Waiting for response?)

## What to Look For

### ✅ Good Signs:
- Request appears in Network tab
- Status: 200 or 201
- Response shows `jobId` and `uploadUrl`

### ❌ Bad Signs:
- **No request appears:** FUNCTIONS_URL not configured
- **Status: 400/500:** Server error (check response body)
- **Status: pending (red):** Request timed out or failed
- **CORS error:** Cross-origin issue
- **404 Not Found:** Wrong URL or function not deployed

## Common Issues

### Issue 1: No Request Appears
**Meaning:** Frontend isn't sending the request
**Check:** Console for `FUNCTIONS_URL` errors
**Fix:** Verify environment variables in Vercel

### Issue 2: Request Pending/Timeout
**Meaning:** Request sent but server not responding
**Check:** Supabase Edge Function logs
**Fix:** Check if function is deployed and working

### Issue 3: 404 Not Found
**Meaning:** Wrong URL or function doesn't exist
**Check:** Request URL in Headers tab
**Fix:** Verify FUNCTIONS_URL is correct

### Issue 4: 401/403 Unauthorized
**Meaning:** Authentication issue
**Check:** Request Headers for Authorization token
**Fix:** Check if user is signed in

## What to Share

Please share:
1. **Does the request appear?** (Yes/No)
2. **Status code:** (200, 400, 500, pending, etc.)
3. **Request URL:** (What's the full URL?)
4. **Response body:** (What does it say?)
5. **Timing:** (How long did it take?)

This will help identify the exact issue.

