# Testing Production Functions from Local Dev

## ✅ Safe Configuration

**Your `.env.local` is correctly set for testing production:**
```bash
VITE_SUPABASE_URL=https://akxdroedpsvmckvqvggr.supabase.co
VITE_SUPABASE_FUNCTIONS_URL=https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_SUPABASE_REDIRECT_URL=http://localhost:8080
```

## 🔒 Why This Won't Break Production

**Important:** `.env.local` is **gitignored** and **only affects your local dev server**:

1. **Vercel uses its own env vars** - Set in Vercel Dashboard → Settings → Environment Variables
2. **`.env.local` is never deployed** - It stays on your computer
3. **Local dev server** (`npm run dev`) reads `.env.local`
4. **Production** (Vercel) reads Vercel's env vars

**You can safely test production functions from local dev!** ✅

## 🧪 Testing Production Setup

### Step 1: Stop Local Functions

**If you're running `supabase functions serve`:**
- Stop it (Ctrl+C)
- You want to test **production cloud functions**, not local ones

### Step 2: Start Local Dev Server

```powershell
npm run dev
```

**This will:**
- Run frontend on `localhost:8080`
- Call production functions at `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
- Use production database
- Use production S3

### Step 3: Test Document Upload

1. **Upload a document** through the UI
2. **Watch browser console** for:
   - `[triggerTextractJob] Calling: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker`
   - Should NOT show "Network error"
3. **Check Network tab:**
   - Look for request to `/functions/v1/textract-worker`
   - Status should be 200 (not 404/500)

### Step 4: Check Production Logs

**Check if textract-worker is being called:**
- https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/textract-worker/logs

**Look for:**
- `=== Textract Worker Request Start ===`
- `Processing job: {jobId}`
- `Starting indexing for job...`

### Step 5: Verify Job Processing

**Check job status:**
```sql
SELECT id, status, metadata->>'job_stage' as stage, created_at
FROM processing_jobs
ORDER BY created_at DESC
LIMIT 5;
```

**Expected progression:**
- `queued` → `processing` → `completed`
- Stage: `uploaded` → `extracted` → `indexed`

### Step 6: Check Embeddings

**After job completes:**
```sql
SELECT COUNT(*) as embedding_count
FROM document_embeddings;
```

**Should show:** `embedding_count > 0`

## 🔍 What to Look For

### ✅ Good Signs:
- Browser console shows: `[triggerTextractJob] Calling: https://...`
- Network tab shows successful request (200)
- Production logs show function being called
- Job status changes from `queued` → `completed`
- Embeddings are created

### ❌ Bad Signs:
- `Failed to trigger Textract job: Network error`
- `404 Not Found` in Network tab
- No logs in production function logs
- Job stays in `queued` status
- No embeddings created

## 🎯 Current Setup

**What you're doing:**
- ✅ Frontend: Running locally (`localhost:8080`)
- ✅ Functions: Calling production cloud (`https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`)
- ✅ Database: Production (shared)
- ✅ S3: Production (shared)

**This is perfect for testing production setup!** ✅

## 🚨 Important Notes

1. **`.env.local` won't affect Vercel** - Vercel has its own env vars
2. **Production functions must be deployed** - Check Supabase Dashboard → Edge Functions
3. **Production secrets must be set** - Check Supabase Dashboard → Edge Functions → Settings → Secrets

## 📋 Verification Checklist

- [ ] `.env.local` points to production URLs ✅ (you have this)
- [ ] Local functions server is **stopped** (testing production, not local)
- [ ] Dev server running (`npm run dev`)
- [ ] Browser console shows production URL when uploading
- [ ] Network tab shows successful requests
- [ ] Production function logs show activity
- [ ] Jobs process successfully
- [ ] Embeddings are created

## 🐛 If Something Goes Wrong

**If you see errors:**

1. **Check production function logs:**
   - https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/textract-worker/logs

2. **Verify functions are deployed:**
   - https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions
   - Should see `textract-worker` in the list

3. **Check production secrets:**
   - Supabase Dashboard → Edge Functions → Settings → Secrets
   - Should have `OPENAI_API_KEY`, `PROJECT_URL`, `SERVICE_ROLE_KEY`

4. **Check Vercel env vars** (for production site):
   - Vercel Dashboard → Settings → Environment Variables
   - Should have `VITE_SUPABASE_FUNCTIONS_URL` pointing to production

## Summary

**You're all set!** Your `.env.local` is correctly configured to test production functions. This won't affect your Vercel deployment at all.

**Next steps:**
1. Make sure local functions server is stopped
2. Run `npm run dev`
3. Upload a document
4. Watch browser console and production logs
5. Verify jobs process and embeddings are created



