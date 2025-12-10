# Fix Query Timeout Issue

## Problem
Queries are timing out even after fixing RLS policy. This could be due to:
1. Missing database indexes
2. Too many rows in the table
3. Slow database connection

## Step 1: Verify Indexes Exist

Run this in **Supabase SQL Editor**:

```sql
-- Check if indexes exist
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'processing_jobs'
ORDER BY indexname;
```

**Expected indexes:**
- `processing_jobs_user_id_analysis_target_idx`
- `processing_jobs_created_at_idx`
- `processing_jobs_user_analysis_created_idx`
- `processing_jobs_user_id_idx` (basic index)

**If indexes are missing**, run this:

```sql
-- Create missing indexes
CREATE INDEX IF NOT EXISTS processing_jobs_user_id_analysis_target_idx 
  ON processing_jobs(user_id, analysis_target);

CREATE INDEX IF NOT EXISTS processing_jobs_created_at_idx 
  ON processing_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS processing_jobs_user_analysis_created_idx 
  ON processing_jobs(user_id, analysis_target, created_at DESC);
```

## Step 2: Test Query Directly

Run this in **Supabase SQL Editor** (replace USER_ID with your actual user ID):

```sql
-- Test the exact query the app uses
EXPLAIN ANALYZE
SELECT
  id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target
FROM processing_jobs
WHERE user_id = '39d6e8e4-fad4-4d31-b364-44b0ac864918'
  AND analysis_target IN ('document-analysis', 'image-ocr')
ORDER BY created_at DESC
LIMIT 50;
```

**Check the output:**
- **Execution Time:** Should be < 100ms
- **Index Scan:** Should show "Index Scan" not "Seq Scan"
- **If > 1 second:** Indexes might not be used or don't exist

## Step 3: Verify RLS Policy

```sql
-- Check current RLS policy
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'processing_jobs';
```

**Expected policy:**
- Policy name: `Users can select their own processing jobs`
- Condition: `(auth.uid() = user_id OR user_id IS NULL)`

**If wrong, fix it:**

```sql
DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;

CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
```

## Step 4: Check Table Size

```sql
-- Check how many rows you have
SELECT 
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE user_id = '39d6e8e4-fad4-4d31-b364-44b0ac864918') as your_rows,
  COUNT(*) FILTER (WHERE user_id IS NULL) as null_user_rows
FROM processing_jobs;
```

**If you have thousands of rows**, the query might be slow even with indexes. Consider:
- Archiving old jobs
- Adding pagination
- Using a more specific filter

## Step 5: Test with Browser Console

Open browser console (F12) and run:

```javascript
// Test query directly from browser
(async () => {
  const userId = '39d6e8e4-fad4-4d31-b364-44b0ac864918';
  
  console.log('Testing query...');
  const start = Date.now();
  
  const { data, error } = await window.supabase
    .from('processing_jobs')
    .select('id, file_name, status')
    .eq('user_id', userId)
    .in('analysis_target', ['document-analysis', 'image-ocr'])
    .order('created_at', { ascending: false })
    .limit(50);
  
  const duration = Date.now() - start;
  console.log(`Query took ${duration}ms`);
  console.log('Result:', { data, error });
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${data?.length || 0} documents`);
  }
})();
```

**If this works but the sidebar doesn't**, it's a timeout issue in the component.

## Temporary Workaround

I've increased the timeout from 3 seconds to 10 seconds. If it still times out:
1. Check indexes (Step 1)
2. Test query directly (Step 2)
3. Verify RLS policy (Step 3)

## After Fixing

Refresh the page and check console logs:
- Should see: `[DocumentsSidebar] ✅ Loaded X jobs`
- Should NOT see: `Query timeout after 10 seconds`

