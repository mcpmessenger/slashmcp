# Debugging: No Network Request Appearing

## If Network Tab is Silent (No Requests)

This means the `fetch()` call isn't executing. Let's check where it's failing:

## Step 1: Check Console Logs

Look for these specific log messages in order:

1. **`[ChatInput] handleFileUpload called`** - File upload handler started
2. **`[ChatInput] Setting isRegisteringUpload to true`** - State updated
3. **`[ChatInput] Calling registerUploadJob`** - About to call API
4. **`[registerUploadJob] Starting upload registration`** - API function started
5. **`[registerUploadJob] FUNCTIONS_URL not configured`** - ❌ ERROR: Missing config
6. **`[registerUploadJob] Request body prepared`** - Body ready
7. **`[registerUploadJob] Auth headers prepared`** - Headers ready
8. **`[registerUploadJob] Sending fetch request to: ...`** - About to send fetch
9. **`[registerUploadJob] Fetch completed in Xms`** - Request completed

## Step 2: Check FUNCTIONS_URL

In the Console tab, run:

```javascript
// Check if FUNCTIONS_URL is configured
console.log('FUNCTIONS_URL:', import.meta.env.VITE_SUPABASE_FUNCTIONS_URL);
console.log('SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);

// Check what the code sees
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || 
  (import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : undefined);
console.log('Computed FUNCTIONS_URL:', FUNCTIONS_URL);
```

**Expected:**
- `FUNCTIONS_URL` should be: `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
- Or `SUPABASE_URL` should be: `https://akxdroedpsvmckvqvggr.supabase.co`

## Step 3: Check Which Logs Appear

**If you see logs 1-4 but NOT 5:**
- ✅ Code is running
- ❌ `registerUploadJob` function isn't being called
- **Check:** Is there an error before calling `registerUploadJob`?

**If you see log 5 (`FUNCTIONS_URL not configured`):**
- ❌ Environment variable not set
- **Fix:** Set `VITE_SUPABASE_FUNCTIONS_URL` or `VITE_SUPABASE_URL` in Vercel

**If you see logs 1-8 but NOT 9:**
- ✅ Request is being sent
- ❌ Request is hanging/timing out
- **Check:** Network tab with different filters

**If you see NO logs at all:**
- ❌ `handleFileUpload` isn't being called
- **Check:** Is the file input triggering the handler?

## Step 4: Check Network Tab Filters

Try these filters:
- Clear all filters (show all requests)
- Filter by: `supabase`
- Filter by: `functions`
- Filter by: `akxdroedpsvmckvqvggr`
- Check "Preserve log" is enabled
- Check time range (should include "Last hour")

## Step 5: Check for Service Workers

Service workers can intercept requests:
1. Go to **Application** tab in DevTools
2. Click **Service Workers** in left sidebar
3. Check if any are registered
4. If yes, try "Unregister" and test again

## What to Share

Please share:
1. **Which console logs appear?** (List the numbers 1-9 that you see)
2. **FUNCTIONS_URL value:** (What does the console show?)
3. **Any errors in console?** (Red error messages)
4. **Network tab filters:** (What filters are active?)

This will pinpoint exactly where the code is failing.

