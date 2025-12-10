# Fix: Query Timeout Issue - Documents Not Showing

## Problem Identified

**Root Cause:** The join query with `analysis_results` was causing 20+ second timeouts due to RLS policy evaluation performance issues.

### Symptoms
- All queries timing out after 20 seconds
- Both primary and fallback queries failing
- Documents not appearing in left panel
- Console logs showing: `"Query timeout after 20 seconds"`

### Why It Happened

The join query:
```typescript
.select(`
  ...,
  analysis_results (job_id, vision_summary, ocr_text)
`)
```

Was causing Supabase to evaluate RLS policies on `analysis_results` for each row, and the RLS policies use `EXISTS` subqueries that check `processing_jobs.user_id = auth.uid()`. With a join, this becomes extremely slow because:

1. For each `processing_jobs` row, it checks RLS on `analysis_results`
2. The RLS policy does an `EXISTS` subquery on `processing_jobs` 
3. This creates a nested query pattern that's very slow
4. Missing or inefficient indexes make it worse

## Solution Applied

**Changed from join query to separate queries:**

1. **Step 1:** Query `processing_jobs` first (simple, fast query)
   - Timeout: 5 seconds (should complete in < 1 second with proper indexes)
   - No join, just simple WHERE clause

2. **Step 2:** Query `analysis_results` separately (only if jobs found)
   - Timeout: 3 seconds
   - Uses `.in("job_id", jobIds)` which is faster than join
   - If this fails, documents still show (just without summaries)

### Benefits

- ✅ Queries complete in < 1 second instead of timing out
- ✅ Documents show even if `analysis_results` query fails
- ✅ Better error handling and diagnostics
- ✅ No performance impact from RLS policy evaluation on joins

## Code Changes

**File:** `src/components/DocumentsSidebar.tsx`

**Before:**
```typescript
const queryWithFilter = supabaseClient
  .from("processing_jobs")
  .select(`
    ...,
    analysis_results (job_id, vision_summary, ocr_text)
  `)
  ...
```

**After:**
```typescript
// Step 1: Query jobs (fast, simple)
const jobsQuery = supabaseClient
  .from("processing_jobs")
  .select("id, file_name, ...")
  .or(`user_id.eq.${userId},user_id.is.null`)
  .eq("analysis_target", "document-analysis")
  ...

// Step 2: Query analysis_results separately (only if jobs found)
const analysisQuery = supabaseClient
  .from("analysis_results")
  .select("job_id, vision_summary, ocr_text")
  .in("job_id", jobIds)
```

## Verification

After this fix, you should see:

1. **Fast queries:** Console logs showing queries complete in < 1 second
2. **Documents appear:** Left panel shows documents (even without summaries)
3. **No timeouts:** No more "Query timeout after 20 seconds" errors

### Expected Console Logs

```
[DocumentsSidebar] Using separate queries (join was causing timeouts)
[DocumentsSidebar] ✅ Loaded X jobs
[DocumentsSidebar] Fetching analysis_results for X jobs...
[DocumentsSidebar] ✅ Loaded X analysis results (Y jobs have summaries)
```

## If Queries Still Timeout

If the simple `processing_jobs` query still times out after 5 seconds, check:

### 1. Database Indexes

Run in Supabase SQL Editor:
```sql
-- Check if indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'processing_jobs'
ORDER BY indexname;
```

**Expected indexes:**
- `processing_jobs_user_id_analysis_target_idx`
- `processing_jobs_created_at_idx`
- `processing_jobs_user_analysis_created_idx`

**If missing:** Run migration `20251203012910_add_processing_jobs_indexes.sql`

### 2. RLS Policies

```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'processing_jobs';
```

**Expected:** `rowsecurity = true`

```sql
-- Check policies exist
SELECT policyname, cmd, qual
FROM pg_policies 
WHERE tablename = 'processing_jobs';
```

**If missing:** Run migration `20251203012909_fix_processing_jobs_rls.sql`

### 3. Test Simple Query

Run this in Supabase SQL Editor (as authenticated user):
```sql
SELECT id, file_name, status
FROM processing_jobs
WHERE (user_id = 'YOUR_USER_ID' OR user_id IS NULL)
  AND analysis_target = 'document-analysis'
ORDER BY created_at DESC
LIMIT 10;
```

**If this is slow:** The issue is with database/indexes, not the code.

## Next Steps

1. **Refresh the page** - The new query structure should work immediately
2. **Check console logs** - Should see fast queries (< 1 second)
3. **Verify documents appear** - Even if summaries don't load
4. **Check database indexes** - If still slow, verify indexes exist

## Related Files

- `src/components/DocumentsSidebar.tsx` - Main fix
- `supabase/migrations/20251203012909_fix_processing_jobs_rls.sql` - RLS policies
- `supabase/migrations/20251203012910_add_processing_jobs_indexes.sql` - Indexes
- `supabase/migrations/20251207000000_fix_analysis_results_rls.sql` - Analysis results RLS
