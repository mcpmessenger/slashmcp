# How to Check Environment Variables in Browser Console

## Problem
`import.meta` cannot be used directly in browser console - it only works in module context.

## Solution: Check via Window Object or Network Tab

### Method 1: Check via Network Request (Easiest)

**In browser console, run:**
```javascript
// Check what URL is being used for function calls
// Look at the actual network requests in Network tab
// Or check the error message which shows the URL being called
```

**Better: Check the actual error/logs:**
- Look for `[triggerTextractJob] Calling: ...` in console
- This shows the actual URL being used
- If it shows `undefined/textract-worker` → variables not set
- If it shows `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker` → variables are set ✅

### Method 2: Check via Source Code Inspection

**In browser DevTools:**
1. Go to **Sources** tab
2. Find `index-*.js` file (the main bundle)
3. Search for `VITE_SUPABASE_FUNCTIONS_URL` or `VITE_SUPABASE_URL`
4. See what values are embedded in the bundle

### Method 3: Check via Network Tab

**When uploading a document:**
1. Open **Network** tab
2. Upload a file
3. Look for request to `/functions/v1/textract-worker`
4. Check the **Request URL**:
   - ✅ `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker` → Working
   - ❌ `undefined/functions/v1/textract-worker` → Variables not set
   - ❌ Request doesn't appear → Function not being called

### Method 4: Check Console Logs

**Look for these logs in console:**

**Good signs:**
- `[api.ts] FUNCTIONS_URL configured: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
- `[triggerTextractJob] Calling: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker`

**Bad signs:**
- `Missing VITE_SUPABASE_FUNCTIONS_URL. Upload API calls will fail until configured.`
- `[triggerTextractJob] Calling: undefined/textract-worker`
- `Failed to trigger Textract job: Network error - Failed to fetch`

## Quick Test: Upload a Document

**The best test is to actually try uploading:**

1. **Upload a test document**
2. **Watch console for:**
   - `[triggerTextractJob] Calling: ...` - Shows the URL
   - Should NOT show "Network error"
3. **Check Network tab:**
   - Look for POST request to `/functions/v1/textract-worker`
   - Status should be 200 (not failed/404)

## What Your Logs Show

From your console output, I can see:
- ✅ Documents are loading (1 document found)
- ✅ DocumentsSidebar is working
- ❓ Need to check if FUNCTIONS_URL is configured

**To verify FUNCTIONS_URL is working:**
1. Try uploading a NEW document
2. Watch console for `[triggerTextractJob] Calling: ...`
3. Check if it shows the correct URL or `undefined`

## If FUNCTIONS_URL is Not Set

**You'll see in console:**
- `Missing VITE_SUPABASE_FUNCTIONS_URL`
- `[triggerTextractJob] Calling: undefined/textract-worker`
- `Failed to trigger Textract job: Network error`

**Fix:**
1. Verify variables in Vercel (you already have them set)
2. **Redeploy the app** (most important!)
3. Hard refresh browser
4. Test again

