# Bug Bounty: Upload Registration Timeout - No Network Request

## 🐛 Critical Issue

**Status:** 🔴 **CRITICAL - BLOCKING USER FUNCTIONALITY**  
**Severity:** High  
**Priority:** P0 - Immediate attention required  
**Bounty:** TBD

---

## 📋 Executive Summary

File uploads are completely non-functional. Users cannot upload documents for processing. The upload registration request times out after 30 seconds, but **no network request appears in the browser's Network tab**, indicating the request is being blocked or failing before it reaches the network layer.

---

## 🔍 Problem Description

### Symptom
When a user attempts to upload a file (PDF, image, etc.):

1. ✅ File selection works
2. ✅ Upload process starts (UI shows "Registering upload...")
3. ✅ MCP Event Log shows "System Log - file_upload" event
4. ❌ After 30 seconds, timeout error appears
5. ❌ **No network request appears in browser Network tab**
6. ❌ No logs appear in Supabase Edge Function logs
7. ❌ Upload fails with: "Upload registration timed out after 30 seconds"

### User Impact
- **100% of upload attempts fail**
- Users cannot upload documents for RAG/document analysis
- Core functionality is completely broken
- No workaround available

---

## 🔬 Technical Analysis

### Code Flow

```
User selects file
  ↓
handleFileUpload() called
  ↓
onEvent() - System log event created ✅
  ↓
setIsRegisteringUpload(true) ✅
  ↓
registerUploadJob() called
  ↓
[registerUploadJob] Starting upload registration ✅ (console log)
  ↓
Check FUNCTIONS_URL ✅ (should be configured)
  ↓
Prepare request body ✅
  ↓
getAuthHeaders() ✅
  ↓
Create AbortController with 30s timeout ✅
  ↓
fetch(`${FUNCTIONS_URL}/uploads`, {...}) ❌ **FAILS HERE**
  ↓
[Should see network request] ❌ **NOT APPEARING**
  ↓
Timeout after 30s ❌
  ↓
Error: "Upload registration timed out after 30 seconds"
```

### Key Observations

1. **Console logs show:**
   - `[ChatInput] handleFileUpload called` ✅
   - `[ChatInput] Setting isRegisteringUpload to true` ✅
   - `[ChatInput] Calling registerUploadJob` ✅
   - `[registerUploadJob] Starting upload registration` ✅
   - `[ChatInput] Registration failed: Error: upload registration timed out` ❌

2. **Network tab shows:**
   - **0 requests** to `/functions/v1/uploads`
   - **0 requests** to any Supabase endpoint
   - Filter set to "Fetch/XHR" (correct)
   - "Preserve log" enabled (correct)

3. **Supabase logs show:**
   - **No logs** from `uploads` Edge Function
   - **No invocations** recorded
   - Function is deployed and active ✅

4. **Environment:**
   - Production: `seco-mcp.vercel.app`
   - Code version: Latest (30s timeout deployed) ✅
   - Browser: Chrome (latest)
   - Network: Stable connection

---

## 🎯 Root Cause Hypothesis

### Hypothesis 1: FUNCTIONS_URL Not Configured in Production ⚠️ **MOST LIKELY**

**Evidence:**
- No network request appears (suggests fetch() never executes or is blocked)
- Console should show `[api.ts] FUNCTIONS_URL configured:` but we need to verify
- Vercel environment variables might not be set

**Test:**
```javascript
// In browser console (won't work due to import.meta, but check app logs):
// Should see: [api.ts] FUNCTIONS_URL configured: https://...
```

**Fix:**
- Verify `VITE_SUPABASE_FUNCTIONS_URL` or `VITE_SUPABASE_URL` is set in Vercel
- Check Vercel dashboard → Project Settings → Environment Variables
- Should be: `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`

### Hypothesis 2: CORS Preflight Blocked

**Evidence:**
- No network request appears (preflight might be blocked before main request)
- CORS headers are set in Edge Function ✅
- But browser might block preflight silently

**Test:**
- Check browser console for CORS errors
- Check Network tab with "All" filter (not just Fetch/XHR)
- Look for OPTIONS request

**Fix:**
- Verify CORS headers in `uploads` Edge Function
- Check if OPTIONS requests are handled

### Hypothesis 3: Service Worker Intercepting Request

**Evidence:**
- Service workers can intercept fetch() calls
- Might be blocking or modifying the request

**Test:**
- DevTools → Application → Service Workers
- Check if any are registered
- Try unregistering and testing

**Fix:**
- Unregister service workers
- Or ensure service worker allows requests to Supabase

### Hypothesis 4: Browser Extension Blocking Request

**Evidence:**
- Ad blockers or privacy extensions might block requests
- Some extensions block requests to unknown domains

**Test:**
- Try in incognito mode (extensions disabled)
- Try in different browser
- Disable extensions one by one

**Fix:**
- Whitelist Supabase domain in extension
- Or disable blocking extensions

### Hypothesis 5: Fetch() Throwing Synchronously

**Evidence:**
- If `FUNCTIONS_URL` is `undefined`, fetch() might throw before network request
- Error might be caught and shown as timeout

**Test:**
- Check console for `[registerUploadJob] FUNCTIONS_URL not configured` error
- Check if `FUNCTIONS_URL` is actually set

**Fix:**
- Ensure FUNCTIONS_URL is properly configured
- Add better error handling

---

## 🧪 Reproduction Steps

1. **Navigate to:** https://seco-mcp.vercel.app (or production URL)
2. **Open DevTools:** F12
3. **Go to Network tab:** Filter by "Fetch/XHR"
4. **Enable "Preserve log"**
5. **Clear network requests**
6. **Go to Console tab:** Clear console
7. **In the app:** Click "+" button or file input
8. **Select file:** Choose any PDF file (e.g., "Architecture and Core Components.pdf")
9. **Observe:**
   - ✅ MCP Event Log shows "System Log - file_upload"
   - ✅ Console shows `[ChatInput] handleFileUpload called`
   - ❌ **No network request appears in Network tab**
   - ❌ After 30s: Error "Upload registration timed out"
   - ❌ MCP Event Log shows "Error - file_upload"

**Expected Behavior:**
- Network request to `/functions/v1/uploads` should appear
- Request should complete in <5 seconds
- Upload should succeed

**Actual Behavior:**
- No network request appears
- Timeout after 30 seconds
- Upload fails

---

## 📊 Diagnostic Data

### Console Logs (What We See)
```
[ChatInput] handleFileUpload called {fileName: "...", fileSize: 48370, fileType: "application/pdf"}
[ChatInput] FUNCTIONS_URL check: {VITE_SUPABASE_FUNCTIONS_URL: undefined, VITE_SUPABASE_URL: "https://...", computed: "https://..."}
[ChatInput] Setting isRegisteringUpload to true
[ChatInput] Calling registerUploadJob {targetAnalysis: "document-analysis"}
[registerUploadJob] Starting upload registration {fileName: "...", fileSize: 48370, ...}
[registerUploadJob] Request body prepared {...}
[registerUploadJob] Auth headers prepared {hasAuth: true}
[registerUploadJob] Sending fetch request to: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/uploads
[registerUploadJob] About to call fetch()...
[ChatInput] Registration failed: Error: upload registration timed out after 30 seconds...
```

### Network Tab (What We DON'T See)
- ❌ No request to `/functions/v1/uploads`
- ❌ No OPTIONS preflight request
- ❌ No requests to Supabase at all during upload

### Supabase Logs (What We DON'T See)
- ❌ No logs from `uploads` Edge Function
- ❌ No invocations recorded
- ❌ Function appears deployed and active

### Environment Variables (Need to Verify)
- `VITE_SUPABASE_FUNCTIONS_URL`: ❓ Unknown (need to check Vercel)
- `VITE_SUPABASE_URL`: ✅ Likely set (app works otherwise)
- Computed `FUNCTIONS_URL`: Should be `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`

---

## 🔧 Proposed Solutions

### Solution 1: Verify and Set Environment Variables (Priority 1)

**Action:**
1. Check Vercel dashboard → Project Settings → Environment Variables
2. Verify `VITE_SUPABASE_FUNCTIONS_URL` is set to: `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
3. Or verify `VITE_SUPABASE_URL` is set to: `https://akxdroedpsvmckvqvggr.supabase.co`
4. If missing, add the variable
5. Redeploy the application

**Expected Result:**
- Console should show: `[api.ts] FUNCTIONS_URL configured: https://...`
- Network request should appear
- Upload should work

### Solution 2: Add Better Error Handling (Priority 2)

**Action:**
1. Add explicit check for FUNCTIONS_URL before calling fetch()
2. Show user-friendly error if FUNCTIONS_URL is missing
3. Add try-catch around fetch() to catch synchronous errors

**Code Changes:**
```typescript
// In registerUploadJob()
if (!FUNCTIONS_URL) {
  const error = new Error("FUNCTIONS_URL is not configured. Please check environment variables.");
  console.error("[registerUploadJob] CRITICAL:", error.message);
  throw error;
}

// Before fetch()
try {
  console.log("[registerUploadJob] About to call fetch()...");
  const response = await fetch(...);
} catch (syncError) {
  // Catch synchronous errors (like invalid URL)
  console.error("[registerUploadJob] Synchronous error:", syncError);
  throw syncError;
}
```

### Solution 3: Add Network Request Monitoring (Priority 3)

**Action:**
1. Add event listener to monitor fetch() calls
2. Log when fetch() is actually called
3. Compare with Network tab to identify discrepancies

**Code:**
```typescript
// Monitor fetch calls
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log("[FETCH MONITOR] fetch() called:", args[0]);
  return originalFetch.apply(this, args);
};
```

### Solution 4: Check for Service Workers (Priority 4)

**Action:**
1. DevTools → Application → Service Workers
2. Check if any are registered
3. If yes, unregister and test
4. Or ensure service worker allows Supabase requests

---

## 🎯 Acceptance Criteria

### Must Have
- ✅ Upload request appears in Network tab
- ✅ Request completes successfully (<5 seconds)
- ✅ Upload registration succeeds
- ✅ File is uploaded to S3
- ✅ Job is created in database
- ✅ User sees success message

### Nice to Have
- ✅ Detailed error messages if something fails
- ✅ Retry mechanism for transient failures
- ✅ Progress indicators during upload
- ✅ Better logging for debugging

---

## 📝 Testing Checklist

- [ ] Verify FUNCTIONS_URL is set in Vercel
- [ ] Check console for `[api.ts] FUNCTIONS_URL configured:` log
- [ ] Check Network tab for request to `/functions/v1/uploads`
- [ ] Check Supabase logs for Edge Function invocation
- [ ] Test in incognito mode (no extensions)
- [ ] Test in different browser
- [ ] Check for service workers
- [ ] Verify CORS headers in Edge Function
- [ ] Test with different file types
- [ ] Test with different file sizes

---

## 🔗 Related Files

- `src/lib/api.ts` - `registerUploadJob()` function
- `src/components/ui/chat-input.tsx` - `handleFileUpload()` function
- `supabase/functions/uploads/index.ts` - Edge Function handler
- `.github/workflows/deploy.yml` - Deployment configuration
- Vercel dashboard - Environment variables

---

## 📞 Contact & Reporting

**Reported by:** Development Team  
**Date:** December 2, 2025  
**Environment:** Production (Vercel)  
**Browser:** Chrome (latest)  
**Reproducibility:** 100% (every upload attempt fails)

**Next Steps:**
1. Verify environment variables in Vercel
2. Check console logs for FUNCTIONS_URL configuration
3. Test in incognito mode to rule out extensions
4. Check Supabase Edge Function logs
5. Implement Solution 1 (verify env vars) as highest priority

---

## 💰 Bounty Details

**Bounty Amount:** TBD  
**Criteria for Reward:**
- Identify root cause
- Provide working solution
- Verify fix in production
- Document the issue and resolution

**Priority:** P0 - Critical  
**Estimated Impact:** 100% of users affected  
**Business Impact:** Core functionality completely broken

---

*Last Updated: December 2, 2025, 11:06 PM*

