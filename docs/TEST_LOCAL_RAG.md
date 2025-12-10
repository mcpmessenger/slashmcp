# Testing RAG Locally

## Current Status

✅ **Uploads function is running locally:**
- Running on `http://localhost:9999`
- Job created: `81a07d98-8188-45b2-b8e7-0ad1787e32e6`

## Next Steps to Test RAG Locally

### Step 1: Verify textract-worker is Running

**Check if textract-worker is also running locally:**

When you run `supabase functions serve`, it should start ALL functions. Check your terminal output for:
- `Listening on http://localhost:9999/`
- Should show multiple functions booting

**If textract-worker is not running:**
```powershell
# Make sure you're running functions serve from project root
npx supabase functions serve --env-file supabase/.env
```

### Step 2: Check if Job is Being Processed

**In browser console, look for:**
- `[triggerTextractJob] Calling: http://localhost:9999/textract-worker`
- Should NOT show "Network error"

**Or check the job status:**
```sql
-- Run in Supabase SQL Editor
SELECT id, status, metadata->>'job_stage' as stage
FROM processing_jobs
WHERE id = '81a07d98-8188-45b2-b8e7-0ad1787e32e6';
```

**Expected progression:**
- `queued` → `processing` → `completed`
- Stage: `uploaded` → `processing` → `extracted` → `indexed`

### Step 3: Check Local Function Logs

**Watch your terminal where `supabase functions serve` is running:**

You should see logs like:
```
=== Textract Worker Request Start ===
Processing job: 81a07d98-8188-45b2-b8e7-0ad1787e32e6
Starting indexing for job...
Created X chunks for indexing
Successfully indexed job...
```

**If you don't see these logs:**
- Job is not being triggered
- Check browser console for `[triggerTextractJob]` errors
- Check Network tab for failed requests

### Step 4: Verify Embeddings Created

**After job completes, check embeddings:**
```sql
SELECT COUNT(*) as embedding_count
FROM document_embeddings
WHERE job_id = '81a07d98-8188-45b2-b8e7-0ad1787e32e6';
```

**Should show:** `embedding_count > 0`

### Step 5: Test RAG in Chat

**Once embeddings exist:**
1. Send a chat message referencing the document
2. Check console for: `[useChat] Document context payload length: > 0`
3. Response should include document context

## Common Local Issues

### Issue 1: textract-worker Not Running

**Symptom:** No logs from textract-worker in terminal

**Fix:**
```powershell
# Restart functions serve
# Make sure you're in project root
npx supabase functions serve --env-file supabase/.env
```

### Issue 2: FUNCTIONS_URL Points to Production

**Symptom:** Browser is calling production URL, not localhost

**Check `.env.local`:**
```bash
# Should be:
VITE_SUPABASE_FUNCTIONS_URL=http://localhost:9999

# NOT:
VITE_SUPABASE_FUNCTIONS_URL=https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
```

**Fix:** Update `.env.local` to use localhost, restart dev server

### Issue 3: Job Not Triggering

**Symptom:** Job stays in `queued` status

**Check:**
1. Browser console for `[triggerTextractJob]` logs
2. Network tab for request to `/textract-worker`
3. Terminal for textract-worker logs

**Manual trigger (if needed):**
```javascript
// In browser console
const { triggerTextractJob } = await import('./lib/api.js');
await triggerTextractJob('81a07d98-8188-45b2-b8e7-0ad1787e32e6');
```

### Issue 4: Missing Environment Variables Locally

**Check `supabase/.env` file:**
- Should have `OPENAI_API_KEY` for embeddings
- Should have `SUPABASE_URL` and `SERVICE_ROLE_KEY`
- Should have AWS credentials for Textract

## Local vs Production

**Local Testing:**
- Functions run on `localhost:9999`
- Use `.env.local` for frontend
- Use `supabase/.env` for functions
- Database is still production (shared)

**Production:**
- Functions run on Supabase
- Use Vercel environment variables
- Same database

## Verification Checklist

- [ ] `supabase functions serve` is running
- [ ] Both `uploads` and `textract-worker` are booted
- [ ] `.env.local` has `VITE_SUPABASE_FUNCTIONS_URL=http://localhost:9999`
- [ ] Job status changes from `queued` → `completed`
- [ ] Embeddings are created (`SELECT COUNT(*) FROM document_embeddings`)
- [ ] Chat includes document context

## Quick Test Commands

```powershell
# Check if functions are running
curl http://localhost:9999/textract-worker -X OPTIONS

# Check job status (in SQL Editor)
SELECT id, status, metadata->>'job_stage' as stage
FROM processing_jobs
ORDER BY created_at DESC
LIMIT 5;

# Check embeddings
SELECT COUNT(*) FROM document_embeddings;
```

