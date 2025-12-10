# Fix Local Environment Configuration

## Problem

Your `.env.local` is pointing to **production cloud functions**, but you're running functions **locally**.

**Current config:**
```bash
VITE_SUPABASE_FUNCTIONS_URL=https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
```

**What's happening:**
- You run `supabase functions serve` → Functions run on `localhost:9999` ✅
- But frontend calls → `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1` ❌
- Result: Frontend calls production, not your local functions!

## Fix

### For Local Testing

**Update `.env.local`:**

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://akxdroedpsvmckvqvggr.supabase.co
VITE_SUPABASE_FUNCTIONS_URL=http://localhost:9999  # ← CHANGE THIS!
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OAuth Redirect URL (for local testing)
VITE_SUPABASE_REDIRECT_URL=http://localhost:8080
```

**Key change:**
- `VITE_SUPABASE_FUNCTIONS_URL=http://localhost:9999` (local functions)
- NOT: `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1` (production)

### After Changing

1. **Restart your dev server:**
   ```powershell
   # Stop current server (Ctrl+C)
   # Then restart:
   npm run dev
   ```

2. **Verify it's working:**
   - Check browser console for: `[triggerTextractJob] Calling: http://localhost:9999/textract-worker`
   - Should show `localhost:9999`, not the production URL

## Two Different Configurations

### Local Development (`.env.local`)

```bash
# Point to LOCAL functions
VITE_SUPABASE_FUNCTIONS_URL=http://localhost:9999
```

**When to use:**
- Testing locally with `supabase functions serve`
- Developing/debugging functions
- Testing before deploying

### Production (Vercel Environment Variables)

```bash
# Point to PRODUCTION cloud functions
VITE_SUPABASE_FUNCTIONS_URL=https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
```

**When to use:**
- Deployed app on Vercel
- Production environment
- Live users

## Quick Reference

| Environment | FUNCTIONS_URL | Functions Run On |
|------------|---------------|------------------|
| **Local** | `http://localhost:9999` | Your computer |
| **Production** | `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1` | Supabase cloud |

## Verification

**After updating `.env.local` and restarting:**

1. **Check browser console:**
   ```javascript
   // Should show:
   [api.ts] FUNCTIONS_URL configured: http://localhost:9999
   ```

2. **Upload a document:**
   - Should see: `[triggerTextractJob] Calling: http://localhost:9999/textract-worker`
   - Should NOT see production URL

3. **Check Network tab:**
   - Requests should go to `localhost:9999`
   - Not `akxdroedpsvmckvqvggr.supabase.co`

## Why This Matters

**If you use production URL while testing locally:**
- ❌ Frontend calls production functions (in cloud)
- ❌ Your local functions on `localhost:9999` are ignored
- ❌ Can't debug/test local function changes
- ❌ Slower (network calls to cloud)

**If you use localhost URL:**
- ✅ Frontend calls local functions (on your computer)
- ✅ Can debug/test function changes immediately
- ✅ Faster (no network calls)
- ✅ Safe (doesn't affect production)

## Summary

**For local testing:** Change `.env.local` to use `http://localhost:9999`  
**For production:** Keep Vercel env vars pointing to production URL

**Remember:** `.env.local` is gitignored, so it won't affect production! ✅




