# Diagnose: Documents Not Showing in Left Panel

## Quick Diagnostic Steps

### Step 1: Check Browser Console (F12)

Open your browser console and look for these logs when the page loads:

```
[DocumentsSidebar] ===== Starting query =====
[DocumentsSidebar] Query parameters: { userId: "...", ... }
[DocumentsSidebar] ✅ Primary query loaded X documents
```

**What to check:**
- ✅ **If you see "✅ Primary query loaded X documents"** → Documents exist, but may not be displaying
- ❌ **If you see "⚠️ Primary query returned no results"** → No documents found in database
- ❌ **If you see "❌ Database query error"** → RLS or query issue
- ❌ **If you see "Query timeout"** → Database connection issue

### Step 2: Check if Documents Exist in Database

Run this in Supabase SQL Editor:

```sql
-- Replace YOUR_USER_ID with your actual user ID (check browser console logs)
SELECT 
  id,
  file_name,
  user_id,
  analysis_target,
  status,
  metadata->>'job_stage' as stage,
  created_at,
  updated_at
FROM processing_jobs
WHERE user_id = 'YOUR_USER_ID' OR user_id IS NULL
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:**
- Should see your uploaded documents
- `status` should be `completed` or `processing`
- `analysis_target` should be `document-analysis`

**If no rows returned:**
- Documents weren't uploaded successfully
- Check upload logs in browser console
- Check MCP Event Log in the app

### Step 3: Check if Analysis Results Exist

```sql
-- Check if analysis_results exist for your jobs
SELECT 
  ar.id,
  ar.job_id,
  pj.file_name,
  pj.user_id,
  pj.status,
  CASE 
    WHEN ar.vision_summary IS NOT NULL THEN 'Has vision summary'
    WHEN ar.ocr_text IS NOT NULL THEN 'Has OCR text'
    ELSE 'No summary'
  END as summary_status
FROM analysis_results ar
JOIN processing_jobs pj ON pj.id = ar.job_id
WHERE pj.user_id = 'YOUR_USER_ID' OR pj.user_id IS NULL
ORDER BY ar.created_at DESC
LIMIT 10;
```

**Expected:**
- Should see analysis results for completed jobs
- Should have either `vision_summary` or `ocr_text`

**If no rows returned:**
- Processing hasn't completed yet
- Check textract-worker logs in Supabase Edge Functions
- Jobs may be stuck in "processing" status

### Step 4: Check RLS Policies

```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('processing_jobs', 'analysis_results');
```

**Expected:** Both should have `rowsecurity = true`

```sql
-- Check RLS policies exist
SELECT 
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('processing_jobs', 'analysis_results')
ORDER BY tablename, cmd;
```

**Expected:** Should see:
- `processing_jobs`: 4 policies (SELECT, INSERT, UPDATE, DELETE)
- `analysis_results`: 5 policies (2 SELECT, INSERT, UPDATE, DELETE)

### Step 5: Check Processing Status

```sql
-- Check which jobs are stuck
SELECT 
  id,
  file_name,
  status,
  metadata->>'job_stage' as stage,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_since_update
FROM processing_jobs
WHERE (user_id = 'YOUR_USER_ID' OR user_id IS NULL)
  AND status != 'completed'
  AND status != 'failed'
ORDER BY created_at DESC;
```

**Expected:**
- Jobs should complete within a few minutes
- If `minutes_since_update > 10`, job may be stuck

**If jobs are stuck:**
- Check textract-worker Edge Function logs
- Check AWS Textract service status
- Jobs may need manual retry

## Common Issues & Fixes

### Issue 1: RLS Policies Not Applied

**Symptom:** Query returns 0 results or permission error

**Fix:**
1. Go to Supabase Dashboard → SQL Editor
2. Run migration: `supabase/migrations/20251203012909_fix_processing_jobs_rls.sql`
3. Run migration: `supabase/migrations/20251207000000_fix_analysis_results_rls.sql`
4. Or use CLI: `npx supabase db push`

### Issue 2: Documents Exist But No Analysis Results

**Symptom:** Documents show in database but no summaries

**Possible Causes:**
1. **Processing not completing:**
   - Check textract-worker logs
   - Jobs may be stuck in "processing" status
   - AWS Textract may be failing

2. **RLS blocking analysis_results query:**
   - Check if migration `20251207000000_fix_analysis_results_rls.sql` was applied
   - Verify policies allow SELECT on analysis_results

**Fix:**
- Check Edge Function logs for errors
- Manually trigger textract-worker if needed
- Verify RLS policies are applied

### Issue 3: User ID Mismatch

**Symptom:** Documents exist but query finds 0

**Check:**
```sql
-- Compare user_id in database vs what's being queried
SELECT DISTINCT user_id, COUNT(*) 
FROM processing_jobs 
GROUP BY user_id;
```

**Fix:**
- DocumentsSidebar now includes `user_id.is.null` in query
- If documents have different user_id, they won't show
- May need to update user_id on existing documents

### Issue 4: Analysis Target Mismatch

**Symptom:** Documents exist but have different `analysis_target`

**Check:**
```sql
SELECT DISTINCT analysis_target, COUNT(*) 
FROM processing_jobs 
WHERE user_id = 'YOUR_USER_ID' OR user_id IS NULL
GROUP BY analysis_target;
```

**Expected:** Should see `document-analysis`

**Fix:**
- DocumentsSidebar fallback query shows all jobs
- Update `analysis_target` on existing documents if needed

## Next Steps

1. **Run the diagnostic queries above**
2. **Check browser console logs** for specific error messages
3. **Verify migrations are applied** (RLS policies)
4. **Check Edge Function logs** if processing isn't completing
5. **Share findings** - console logs and SQL query results

## What the Fix Does

The updated `DocumentsSidebar.tsx` now:
- ✅ Uses join query first (more efficient)
- ✅ Falls back to separate queries if RLS blocks join
- ✅ Shows documents even if summaries can't be loaded
- ✅ Adds detailed diagnostics for missing analysis results
- ✅ Handles both array and single object formats from Supabase joins
- ✅ Better error messages to identify root cause
