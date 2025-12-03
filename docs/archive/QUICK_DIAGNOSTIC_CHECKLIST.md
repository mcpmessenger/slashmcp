# Quick Diagnostic Checklist - Upload Timeout

## ⚡ Fast Checks (Do These First)

### 1. Check Console for FUNCTIONS_URL (30 seconds)

**In Browser Console, look for:**
- `[api.ts] FUNCTIONS_URL configured: https://...` ✅ Good
- `Missing VITE_SUPABASE_FUNCTIONS_URL...` ❌ Problem: Env var not set

**If you see the warning:**
- Go to Vercel → Project Settings → Environment Variables
- Add `VITE_SUPABASE_FUNCTIONS_URL` = `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
- Or ensure `VITE_SUPABASE_URL` = `https://akxdroedpsvmckvqvggr.supabase.co`
- Redeploy

### 2. Check Console Logs During Upload (1 minute)

**Look for this sequence:**
```
[ChatInput] handleFileUpload called ✅
[ChatInput] FUNCTIONS_URL check: {...} ✅
[registerUploadJob] Starting upload registration ✅
[registerUploadJob] About to call fetch()... ✅
[registerUploadJob] Sending fetch request to: ... ✅
```

**If you DON'T see "About to call fetch()":**
- Code is failing before fetch() executes
- Check for errors above this line

**If you DO see "About to call fetch()" but no network request:**
- Fetch is being blocked (CORS, extension, service worker)
- See checks below

### 3. Check Network Tab Filters (10 seconds)

**Make sure:**
- Filter is set to "All" (not just "Fetch/XHR")
- "Preserve log" is checked
- Clear requests before testing
- Time range includes "Last hour"

**Look for:**
- Request to `/functions/v1/uploads` ✅
- OPTIONS request (CORS preflight) ✅
- Any request to `supabase.co` ✅

**If you see OPTIONS but no POST:**
- CORS preflight is failing
- Check Edge Function CORS headers

### 4. Test in Incognito Mode (2 minutes)

**Why:** Rules out browser extensions

1. Open incognito window
2. Navigate to production URL
3. Try upload
4. Check Network tab

**If it works in incognito:**
- Browser extension is blocking
- Disable extensions one by one

### 5. Check Service Workers (30 seconds)

**DevTools → Application → Service Workers**

**If any are registered:**
- Click "Unregister"
- Try upload again

**If it works after unregistering:**
- Service worker is blocking requests
- Fix service worker to allow Supabase requests

### 6. Check Vercel Environment Variables (2 minutes)

**Vercel Dashboard → Project → Settings → Environment Variables**

**Required:**
- `VITE_SUPABASE_URL` = `https://akxdroedpsvmckvqvggr.supabase.co`
- OR `VITE_SUPABASE_FUNCTIONS_URL` = `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`

**If missing:**
- Add the variable
- Redeploy (or wait for auto-deploy)

### 7. Check Supabase Logs (1 minute)

**Go to:** https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/uploads/logs

**Filter:** "Last 5 minutes"

**Look for:**
- `=== Uploads Edge Function Request Start ===` ✅ Request reached function
- Any error messages ❌ Function error
- No logs at all ❌ Request not reaching function

---

## 🎯 Most Likely Causes (In Order)

1. **FUNCTIONS_URL not set in Vercel** (80% probability)
   - Fix: Add environment variable
   - Check: Console shows warning about missing URL

2. **Browser extension blocking** (10% probability)
   - Fix: Test in incognito
   - Check: Works in incognito but not normal mode

3. **Service worker intercepting** (5% probability)
   - Fix: Unregister service worker
   - Check: Application → Service Workers

4. **CORS preflight failing** (3% probability)
   - Fix: Check Edge Function CORS headers
   - Check: See OPTIONS request but no POST

5. **Network/firewall blocking** (2% probability)
   - Fix: Check network settings
   - Check: Try different network

---

## 📋 What to Report

When reporting, include:

1. **Console logs:** Screenshot or copy of all `[registerUploadJob]` logs
2. **Network tab:** Screenshot showing (or not showing) the request
3. **FUNCTIONS_URL check:** What does `[api.ts] FUNCTIONS_URL configured:` show?
4. **Vercel env vars:** Screenshot of environment variables (hide secrets)
5. **Incognito test:** Does it work in incognito?
6. **Service workers:** Any registered?
7. **Supabase logs:** Any logs appear?

This will help identify the root cause quickly.

