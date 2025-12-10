# Fix "No API key found in request" Error

## Problem

You're getting this error:
```json
{"message":"No API key found in request","hint":"No `apikey` request header or url param was found."}
```

This means Supabase's API gateway isn't receiving the required `apikey` header.

## Root Cause

Supabase Edge Functions require an `apikey` header with your Supabase anon key. The code should be adding it, but it might be:
1. Missing from the request
2. Not being read from environment variables
3. Being stripped by CORS

## Fix Applied

I've updated `src/lib/api.ts` to:
1. ✅ Always ensure `apikey` header is present
2. ✅ Add better error messages if anon key is missing
3. ✅ Add logging to debug header issues

## Verification Steps

### Step 1: Check Browser Console

**After the fix, when uploading a document, you should see:**
```
[getAuthHeaders] Using anon key for authorization (no session or session failed)
  hasApikey: true
  hasAuthorization: true
```

**Or if you're signed in:**
```
[getAuthHeaders] Using session token for authorization
  hasApikey: true
  hasAuthorization: true
```

**If you see:**
```
WARNING: SUPABASE_ANON_KEY is not set
```
→ Your `.env.local` is missing `VITE_SUPABASE_PUBLISHABLE_KEY`

### Step 2: Check Network Tab

**When uploading, check the request headers:**
1. Open Network tab (F12)
2. Find request to `/functions/v1/textract-worker` or `/uploads`
3. Click on it → Headers tab
4. Look for:
   - ✅ `apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - ✅ `authorization: Bearer eyJ...`

**If `apikey` header is missing:**
- Check `.env.local` has `VITE_SUPABASE_PUBLISHABLE_KEY`
- Restart dev server after adding it

### Step 3: Verify Environment Variable

**Check if anon key is loaded:**

In browser console, the code will log:
- `[getAuthHeaders] Using anon key...` → Good ✅
- `WARNING: SUPABASE_ANON_KEY is not set` → Bad ❌

**If missing, add to `.env.local`:**
```bash
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFreGRyb2VkcHN2bWNrdnF2Z2dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NTkzNjAsImV4cCI6MjA3ODEzNTM2MH0.lCN28RsJGQ2krrXMihA8cA33dU1DNhS9a931kWLwbj4
```

**Get your anon key from:**
- Supabase Dashboard → Settings → API → `anon` `public` key

## Deploy Updated Code

### For Local Testing

**No deployment needed** - just restart dev server:
```powershell
# Stop current server (Ctrl+C)
npm run dev
```

### For Production

**Deploy the updated frontend code:**

1. **Commit and push:**
   ```powershell
   git add src/lib/api.ts
   git commit -m "Fix: Ensure apikey header is always included in Edge Function requests"
   git push
   ```

2. **Vercel will auto-deploy** (if connected to GitHub)

3. **Or manually deploy:**
   ```powershell
   vercel --prod
   ```

## Testing After Fix

1. **Restart dev server** (if testing locally)
2. **Upload a document**
3. **Check browser console:**
   - Should see `hasApikey: true` in logs
   - Should NOT see "No API key found" error
4. **Check Network tab:**
   - Request should have `apikey` header
   - Status should be 200 (not 401)

## Common Issues

### Issue 1: Anon Key Not Set

**Symptom:** `WARNING: SUPABASE_ANON_KEY is not set`

**Fix:**
1. Add `VITE_SUPABASE_PUBLISHABLE_KEY` to `.env.local`
2. Restart dev server

### Issue 2: Header Not Being Sent

**Symptom:** Console shows `hasApikey: true` but Network tab shows no `apikey` header

**Fix:**
- This shouldn't happen with the fix, but if it does:
- Check browser console for errors
- Try hard refresh (Ctrl+Shift+R)

### Issue 3: CORS Stripping Headers

**Symptom:** Headers are set but not received by function

**Fix:**
- Edge Function CORS config should allow `apikey` header
- Check `supabase/functions/textract-worker/index.ts`:
  ```typescript
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
  ```
- Redeploy function if needed

## Summary

**The fix ensures:**
- ✅ `apikey` header is always added if `SUPABASE_ANON_KEY` is available
- ✅ Better error messages if anon key is missing
- ✅ Logging to debug header issues

**Next steps:**
1. Restart dev server
2. Test upload
3. Check console logs for `hasApikey: true`
4. Verify Network tab shows `apikey` header




