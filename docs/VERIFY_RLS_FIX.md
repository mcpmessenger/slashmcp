# Verify RLS Policies Are Working

Run these queries in Supabase SQL Editor to verify the migrations were applied correctly:

## Step 1: Check RLS is Enabled

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'processing_jobs';
```

**Expected:** `rowsecurity` should be `true`

## Step 2: Check RLS Policies Exist

```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'processing_jobs'
ORDER BY cmd, policyname;
```

**Expected:** Should see 4 policies:
- `Users can select their own processing jobs` (cmd = SELECT)
- `Users can insert their own processing jobs` (cmd = INSERT)
- `Users can update their own processing jobs` (cmd = UPDATE)
- `Users can delete their own processing jobs` (cmd = DELETE)

## Step 3: Verify SELECT Policy Details

```sql
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'processing_jobs' 
  AND cmd = 'SELECT';
```

**Expected:** The `qual` column should contain: `(auth.uid() = user_id)`

## Step 4: Check Indexes Were Created

```sql
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'processing_jobs'
ORDER BY indexname;
```

**Expected:** Should see these indexes:
- `processing_jobs_user_id_analysis_target_idx`
- `processing_jobs_created_at_idx`
- `processing_jobs_user_analysis_created_idx`

## Step 5: Test Query Performance (with Service Role - bypasses RLS)

```sql
-- This uses service role, so it bypasses RLS
-- Replace USER_ID with an actual user ID from auth.users
EXPLAIN ANALYZE
SELECT
  id,
  file_name,
  status,
  metadata->>'job_stage' as stage,
  created_at
FROM processing_jobs
WHERE user_id = 'USER_ID'
  AND analysis_target = 'document-analysis'
ORDER BY created_at DESC
LIMIT 50;
```

**Expected:** Should complete in < 100ms and show "Index Scan" in the plan

## Step 6: Check if Data Exists

```sql
-- Replace USER_ID with actual user ID
SELECT COUNT(*) as total_jobs,
       COUNT(*) FILTER (WHERE analysis_target = 'document-analysis') as doc_jobs
FROM processing_jobs
WHERE user_id = 'USER_ID';
```

**Expected:** Should return counts (may be 0 if user has no documents)

## Troubleshooting

If RLS policies don't exist:
1. Re-run the migration: `20251203012909_fix_processing_jobs_rls.sql`
2. Check for errors in the migration execution

If indexes don't exist:
1. Re-run the migration: `20251203012910_add_processing_jobs_indexes.sql`
2. Check for errors in the migration execution

If query still times out:
1. Check browser console for session/auth errors
2. Verify user is logged in
3. Check if session token is expired
4. Try logging out and back in

---

## Verification for `analysis_results` Table

### Step 1: Check RLS is Enabled for analysis_results

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'analysis_results';
```

**Expected:** `rowsecurity` should be `true`

### Step 2: Check RLS Policies Exist for analysis_results

```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'analysis_results'
ORDER BY cmd, policyname;
```

**Expected:** Should see 5 policies:
- `Users can view their own analysis results` (cmd = SELECT)
- `Authenticated users can view NULL user_id results` (cmd = SELECT)
- `Users can insert their own analysis results` (cmd = INSERT)
- `Users can update their own analysis results` (cmd = UPDATE)
- `Users can delete their own analysis results` (cmd = DELETE)

### Step 3: Verify SELECT Policy Details for analysis_results

```sql
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'analysis_results' 
  AND cmd = 'SELECT'
ORDER BY policyname;
```

**Expected:** Should see 2 SELECT policies:
- `Users can view their own analysis results` - qual should contain `EXISTS` and reference `processing_jobs.user_id = auth.uid()`
- `Authenticated users can view NULL user_id results` - qual should contain `EXISTS` and reference `processing_jobs.user_id IS NULL`

### Step 4: Test Security - Unauthenticated Access Should Fail

```sql
-- This should fail if RLS is working correctly
-- Run this as an unauthenticated/anonymous user (or with service role disabled)
SELECT COUNT(*) FROM analysis_results;
```

**Expected:** Should return 0 rows or error (if RLS is properly configured, unauthenticated users cannot access the table)

### Step 5: Test Authenticated Access

```sql
-- Replace USER_ID with actual user ID from auth.users
-- This should only return results for jobs owned by that user
SELECT 
  ar.id,
  ar.job_id,
  pj.user_id,
  pj.file_name,
  LEFT(ar.ocr_text, 50) as ocr_preview
FROM analysis_results ar
JOIN processing_jobs pj ON pj.id = ar.job_id
WHERE pj.user_id = 'USER_ID'
LIMIT 10;
```

**Expected:** Should return only analysis results for jobs owned by the specified user

### Troubleshooting for analysis_results

If RLS policies don't exist:
1. Re-run the migration: `20251207000000_fix_analysis_results_rls.sql`
2. Check for errors in the migration execution

If unauthenticated users can still access data:
1. Verify RLS is enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'analysis_results';`
2. Check that policies exist and are correctly configured
3. Ensure policies use `TO authenticated` (not `TO public` or `TO anon`)

