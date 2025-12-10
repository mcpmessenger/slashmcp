# Deploy Production Fix for Upload Timeout

## Quick Deploy

**The `apikey` header fix is ready to deploy:**

```powershell
# Stage the fix
git add src/lib/api.ts

# Commit with descriptive message
git commit -m "Fix: Ensure apikey header is always included in Edge Function requests to prevent timeout errors"

# Push to trigger Vercel auto-deployment
git push
```

**Vercel will automatically:**
1. Build the project
2. Deploy to production
3. Update `slashmcp.vercel.app`

**Wait 2-3 minutes** for deployment to complete.

## Verify Deployment

**After Vercel finishes deploying:**

1. **Go to production site:** https://slashmcp.vercel.app
2. **Hard refresh** (Ctrl+Shift+R)
3. **Open browser console** (F12)
4. **Look for:**
   ```
   [api.ts] FUNCTIONS_URL configured: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
   [getAuthHeaders] Using anon key for authorization...
     hasApikey: true
     hasAuthorization: true
   ```
5. **Try uploading a document**
6. **Should NOT timeout** - should complete in <5 seconds

## What the Fix Does

**Before (causing timeout):**
- Request might be missing `apikey` header
- Supabase API gateway rejects it
- Request hangs until 30s timeout

**After (fixed):**
- `apikey` header is always included
- Request is accepted by API gateway
- Function processes normally (<5 seconds)

## If Still Timing Out After Deploy

**Check:**

1. **Browser console** - Does it show `hasApikey: true`?
2. **Network tab** - Does request have `apikey` header?
3. **Function logs** - https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/uploads/logs
4. **Vercel deployment** - Did it complete successfully?

## Summary

**Ready to deploy:**
- ✅ Code fixed (`src/lib/api.ts`)
- ⏳ **Next step:** `git push` to deploy to production
- ✅ **After deploy:** Upload should work without timeout



