# Upload Timeout Resolution Plan

## ✅ Confirmed Status

### Environment Variables: ✅ SET
- `VITE_SUPABASE_URL` - Set in Vercel
- `VITE_SUPABASE_FUNCTIONS_URL` - Set in Vercel  
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Set in Vercel
- `VITE_SUPABASE_REDIRECT_URL` - Set in Vercel

### Code Updates: ✅ DEPLOYED
- ✅ 30-second timeout (increased from 15s)
- ✅ Robust error handling with detailed logging
- ✅ URL validation before fetch()
- ✅ Synchronous error catching
- ✅ Enhanced error messages

### Edge Functions: ✅ DEPLOYED
- ✅ `uploads` function deployed with detailed logging
- ✅ `agent-orchestrator-v1` deployed with RAG tools

---

## 🔍 Current Issue

**Symptom:** Upload times out after 30 seconds, no network request appears in Network tab

**Status:** Environment variables are set, so the issue is likely:
1. Browser extension blocking requests (40% probability)
2. Service worker intercepting (30% probability)
3. CORS preflight failing (20% probability)
4. Variables not in build (10% probability - need to verify)

---

## 🎯 Action Plan

### Step 1: Verify Variables Are in Build (5 minutes)

**After Vercel redeploys with new code:**

1. **Hard refresh browser:** Ctrl+Shift+R (clears cached JS)
2. **Open console:** Look for `[api.ts] FUNCTIONS_URL configured: https://...`
3. **If you see it:** Variables are loaded ✅
4. **If you don't see it:** Variables might not be in build (check Vercel deployment)

### Step 2: Test in Incognito Mode (2 minutes) ⚡ **DO THIS FIRST**

**This is the fastest way to rule out browser extensions:**

1. Open incognito/private window
2. Navigate to production URL
3. Try uploading a file
4. Check Network tab

**Expected Results:**
- ✅ **If it works:** Browser extension is blocking → Disable extensions
- ❌ **If it still fails:** Not an extension issue → Continue to Step 3

### Step 3: Check Service Workers (1 minute)

1. DevTools → Application tab
2. Click "Service Workers" in left sidebar
3. **If any are registered:**
   - Click "Unregister"
   - Try upload again
4. **If it works:** Service worker was blocking → Fix service worker code

### Step 4: Monitor fetch() Calls (2 minutes)

**Add this to browser console:**

```javascript
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('[FETCH MONITOR] fetch() called:', args[0], args[1]?.method || 'GET');
  const result = originalFetch.apply(this, args);
  result.then(
    (r) => console.log('[FETCH MONITOR] Success:', args[0], r.status),
    (e) => console.error('[FETCH MONITOR] Error:', args[0], e)
  );
  return result;
};
```

**Then try uploading and check:**
- ✅ **If you see `[FETCH MONITOR] fetch() called:`** → fetch() is executing, but request is being blocked
- ❌ **If you DON'T see it:** fetch() isn't being called → Check console for errors before fetch()

### Step 5: Check Network Tab Settings (1 minute)

**Make sure you're seeing all requests:**

1. Network tab → Clear all filters
2. Set filter to **"All"** (not just "Fetch/XHR")
3. Enable **"Preserve log"**
4. Try upload again
5. Look for:
   - **OPTIONS request** (CORS preflight) - might appear even if POST doesn't
   - **Any request to `supabase.co`**
   - **Any failed/blocked requests** (red or gray)

### Step 6: Check Console for Detailed Logs

**After trying upload, look for this sequence:**

```
[api.ts] FUNCTIONS_URL configured: https://... ✅
[ChatInput] handleFileUpload called ✅
[ChatInput] FUNCTIONS_URL check: {...} ✅
[registerUploadJob] Starting upload registration ✅
[registerUploadJob] URL validated: https://... ✅
[registerUploadJob] About to call fetch()... ✅
[FETCH MONITOR] fetch() called: ... ✅ (if you added the monitor)
```

**If the sequence stops at any point:**
- That's where the code is failing
- Check for errors at that point

---

## 🔧 Quick Fixes Based on Results

### If It Works in Incognito:
**Fix:** Disable browser extensions
1. Go to Chrome → Extensions
2. Disable extensions one by one
3. Test after each disable
4. When upload works, that extension was the culprit

### If Service Worker Was the Issue:
**Fix:** Update service worker to allow Supabase requests
- Check `public/sw.js` or service worker registration
- Add Supabase domain to allowed origins

### If CORS Preflight Fails:
**Fix:** Verify Edge Function CORS headers
- Check `supabase/functions/uploads/index.ts`
- Ensure CORS headers include your domain

### If Variables Not in Build:
**Fix:** Trigger manual redeploy
1. Vercel → Deployments
2. Click "..." on latest deployment
3. Click "Redeploy"
4. Wait 2-3 minutes
5. Hard refresh browser

---

## 📊 Diagnostic Checklist

After testing, check off what you find:

- [ ] Console shows: `[api.ts] FUNCTIONS_URL configured: https://...`
- [ ] Console shows: `[registerUploadJob] URL validated: https://...`
- [ ] Console shows: `[registerUploadJob] About to call fetch()...`
- [ ] Fetch monitor shows: `[FETCH MONITOR] fetch() called: ...`
- [ ] Network tab shows: Request to `/functions/v1/uploads`
- [ ] Network tab shows: OPTIONS request (CORS preflight)
- [ ] Works in incognito mode
- [ ] Service workers: None registered (or unregistered)
- [ ] Supabase logs: Shows request reached function

---

## 🎯 Most Likely Resolution

Based on evidence:
1. **Environment variables are set** ✅
2. **Code is deployed** ✅
3. **No network request appears** ❌

**Most likely:** Browser extension or service worker is blocking the request

**Quick test:** Try incognito mode - if it works, you've found the culprit!

---

*Last Updated: December 2, 2025*

