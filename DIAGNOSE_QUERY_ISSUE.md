# Diagnose Query Timeout Issue

## Step 1: Test Query Execution Time

Run this in **Supabase SQL Editor**:

```sql
-- Test 1: Simple query with just user_id
EXPLAIN ANALYZE
SELECT id, file_name, status
FROM processing_jobs
WHERE user_id = '39d6e8e4-fad4-4d31-b364-44b0ac864918'
LIMIT 50;
```

**Check the output:**
- Look for "Execution Time: X ms" at the bottom
- Should be < 100ms
- Should show "Index Scan using processing_jobs_user_id_idx"

---

## Step 2: Test Full Query

```sql
-- Test 2: Full query with analysis_target filter
EXPLAIN ANALYZE
SELECT
  id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target
FROM processing_jobs
WHERE user_id = '39d6e8e4-fad4-4d31-b364-44b0ac864918'
  AND analysis_target IN ('document-analysis', 'image-ocr')
ORDER BY created_at DESC
LIMIT 50;
```

**Check:**
- Execution Time: Should be < 200ms
- Should show "Index Scan using processing_jobs_user_analysis_created_idx"
- If it shows "Seq Scan" → indexes aren't being used
- If Execution Time > 1000ms → something is wrong

---

## Step 3: Check Row Count

```sql
-- How many rows match?
SELECT COUNT(*) as total
FROM processing_jobs
WHERE user_id = '39d6e8e4-fad4-4d31-b364-44b0ac864918'
  AND analysis_target IN ('document-analysis', 'image-ocr');
```

**If > 10,000 rows**, even with indexes it might be slow.

---

## Step 4: Test RLS Policy

```sql
-- Test if RLS allows the query (run as authenticated user)
-- This should return rows if RLS is working
SELECT COUNT(*) 
FROM processing_jobs
WHERE user_id = '39d6e8e4-fad4-4d31-b364-44b0ac864918';
```

**If this returns 0 but you know you have rows**, RLS is blocking.

---

## Step 5: Test from Browser Console

Open browser console (F12) and run:

```javascript
// Test query with timing
(async () => {
  const userId = '39d6e8e4-fad4-4d31-b364-44b0ac864918';
  
  console.log('Testing query...');
  const start = Date.now();
  
  try {
    const { data, error, count } = await window.supabase
      .from('processing_jobs')
      .select('id, file_name, status', { count: 'exact' })
      .eq('user_id', userId)
      .in('analysis_target', ['document-analysis', 'image-ocr'])
      .order('created_at', { ascending: false })
      .limit(50);
    
    const duration = Date.now() - start;
    console.log(`✅ Query completed in ${duration}ms`);
    console.log(`Found ${data?.length || 0} documents (total: ${count})`);
    console.log('Data:', data);
    
    if (error) {
      console.error('❌ Error:', error);
    }
  } catch (err) {
    console.error('❌ Exception:', err);
  }
})();
```

**Expected:**
- Should complete in < 2000ms
- Should return data if you have documents

**If this works but sidebar doesn't**, it's a timeout issue in the component.

---

## Common Issues

### Issue 1: Query Plan Not Using Indexes
**Symptom:** EXPLAIN ANALYZE shows "Seq Scan" instead of "Index Scan"

**Fix:**
```sql
-- Force index usage (PostgreSQL should do this automatically, but sometimes needs help)
ANALYZE processing_jobs;

-- Re-run EXPLAIN ANALYZE to see if it uses indexes now
```

### Issue 2: Too Many Rows
**Symptom:** Execution time > 1000ms even with indexes

**Fix:** Add more specific filters or pagination

### Issue 3: RLS Policy Blocking
**Symptom:** Query works in SQL Editor but not from app

**Fix:** Verify RLS policy allows NULL user_id:
```sql
SELECT qual FROM pg_policies 
WHERE tablename = 'processing_jobs' 
  AND policyname = 'Users can select their own processing jobs';
```

Should show: `(auth.uid() = user_id OR user_id IS NULL)`

### Issue 4: Network/Connection Issue
**Symptom:** Queries work in SQL Editor but timeout from browser

**Fix:** Check browser network tab for slow requests

---

## Next Steps

After running these tests, share:
1. Execution time from Step 1 and Step 2
2. Row count from Step 3
3. Results from Step 5 (browser console)

This will help identify the exact issue.

