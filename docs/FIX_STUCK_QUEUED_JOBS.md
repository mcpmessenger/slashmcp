# Fix Stuck Queued Jobs - RAG Not Working

## Problem
All processing jobs are stuck in `queued` status with `uploaded` stage. This means:
- Documents are uploaded to S3 ✅
- Jobs are created in database ✅
- But `textract-worker` function is NOT being triggered ❌
- No embeddings are being created ❌
- RAG cannot work ❌

## Root Cause
The `triggerTextractJob()` function is failing to invoke the `textract-worker` Edge Function. This could be due to:
1. Network/CORS errors
2. Function not deployed
3. Authentication issues
4. FUNCTIONS_URL misconfiguration

## Diagnostic Steps

### Step 1: Check Browser Console
When you upload a document, check the browser console (F12) for:
- `[triggerTextractJob] Calling: ...` - Should show the URL being called
- `[triggerTextractJob] Fetch error:` - Network/CORS errors
- `[triggerTextractJob] Failed: ...` - HTTP errors
- `Failed to trigger Textract job:` - Error messages

**What to look for:**
- ❌ `Failed to trigger Textract job: Network error` → CORS or network issue
- ❌ `Failed to trigger Textract job: 404` → Function not deployed
- ❌ `Failed to trigger Textract job: 401/403` → Authentication issue
- ❌ `Textract job trigger timed out` → Function not responding

### Step 2: Check Network Tab
1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Upload a document
4. Look for request to `/functions/v1/textract-worker`
5. Check:
   - **Status:** Should be 200, not 404/500/timeout
   - **Request Headers:** Should include `Authorization` header
   - **Response:** Should show success, not error

### Step 3: Check Supabase Function Logs
Check if `textract-worker` function is being called:

**Link:** https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/textract-worker/logs

**What to look for:**
- ✅ `=== Textract Worker Request Start ===` - Function is being called
- ✅ `Processing job: {jobId}` - Job is being processed
- ❌ No logs at all - Function is NOT being called (trigger failing)
- ❌ `Job not found` - Job ID mismatch
- ❌ `CORS error` - CORS configuration issue

### Step 4: Check Environment Variables
Verify `FUNCTIONS_URL` is configured correctly:

**In browser console, run:**
```javascript
// Check if FUNCTIONS_URL is set
console.log('FUNCTIONS_URL:', import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || import.meta.env.VITE_SUPABASE_URL + '/functions/v1');
```

**Expected value:**
- `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`

**If missing or wrong:**
- Check `.env.local` file
- Check Vercel environment variables (if deployed)
- Set: `VITE_SUPABASE_FUNCTIONS_URL=https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`

### Step 5: Verify Function is Deployed
Check if `textract-worker` function exists:

**Link:** https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions

**Should see:**
- `textract-worker` in the list
- Status: Active/Deployed
- Last deployed: Recent date

**If not deployed:**
```powershell
# Deploy the function
npx supabase functions deploy textract-worker --project-ref akxdroedpsvmckvqvggr
```

## Quick Fixes

### Fix 1: Manually Trigger Stuck Jobs
The frontend has auto-retry logic, but you can manually trigger:

**In browser console:**
```javascript
// Import the function
import { triggerTextractJob } from './lib/api';

// Trigger a specific job
await triggerTextractJob('your-job-id-here');
```

**Or use SQL to check job IDs:**
```sql
SELECT id, file_name, status, metadata->>'job_stage' as stage
FROM processing_jobs
WHERE status = 'queued'
ORDER BY created_at DESC;
```

### Fix 2: Check CORS Configuration
Verify `textract-worker` has proper CORS headers:

**Check:** `supabase/functions/textract-worker/index.ts`

**Should have:**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

### Fix 3: Redeploy Function
If function exists but isn't working:

```powershell
# Redeploy textract-worker
npx supabase functions deploy textract-worker --project-ref akxdroedpsvmckvqvggr

# Check deployment status
npx supabase functions list --project-ref akxdroedpsvmckvqvggr
```

### Fix 4: Check Authentication
Verify the function can authenticate:

**Check browser console for:**
- `[triggerTextractJob] Calling: ...` - Should show URL
- `hasHeaders: true` - Should be true
- `headerKeys: ['authorization', ...]` - Should include authorization

**If missing:**
- Check if user is authenticated
- Check if `getAuthHeaders()` is working
- Verify Supabase client is initialized

## Testing After Fix

1. **Upload a new document** (or manually trigger an existing one)
2. **Watch browser console** for `[triggerTextractJob] Success`
3. **Check job status** - Should change from `queued` → `processing` → `completed`
4. **Check embeddings** - Run SQL:
   ```sql
   SELECT COUNT(*) FROM document_embeddings;
   ```
5. **Test RAG** - Send a chat message referencing the document

## Expected Flow

1. Document uploaded → Job created with `status: "queued"`
2. `triggerTextractJob()` called → Calls `/functions/v1/textract-worker`
3. `textract-worker` processes → Updates job to `status: "processing"`
4. Text extracted → Updates job to `status: "completed"`, `stage: "extracted"`
5. Embeddings created → Updates job to `stage: "indexed"`
6. RAG ready → Document can be queried with semantic search

## Still Stuck?

If jobs are still stuck after trying fixes:

1. **Check all logs:**
   - Browser console
   - Network tab
   - Supabase function logs (textract-worker)
   - Supabase function logs (uploads)

2. **Verify deployment:**
   ```powershell
   npx supabase functions list --project-ref akxdroedpsvmckvqvggr
   ```

3. **Test function directly:**
   ```powershell
   # Get a job ID from database
   # Then test the function directly
   curl -X POST https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"jobId": "YOUR_JOB_ID"}'
   ```

4. **Check for errors in:**
   - `docs/CURRENT_CHALLENGES.md` - Known issues
   - Supabase Dashboard → Edge Functions → textract-worker → Logs

