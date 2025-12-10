# Final Query Optimization - Split OR Query

## Problem

Even after fixing RLS policies, queries were still timing out. The `.or()` query structure was not using database indexes efficiently.

**Original Query:**
```typescript
.or(`user_id.eq.${userId},user_id.is.null`)
```

**Issue:** PostgreSQL/Supabase may not optimize `.or()` queries well, especially when one condition checks for NULL. This can cause full table scans instead of using indexes.

## Solution

**Split into two separate queries and combine results:**

```typescript
// Query 1: Get jobs with matching user_id (uses index efficiently)
const userJobsQuery = supabaseClient
  .from("processing_jobs")
  .select("...")
  .eq("user_id", userId)
  .eq("analysis_target", "document-analysis")
  .order("created_at", { ascending: false })
  .limit(50);

// Query 2: Get jobs with NULL user_id
const nullUserJobsQuery = supabaseClient
  .from("processing_jobs")
  .select("...")
  .is("user_id", null)
  .eq("analysis_target", "document-analysis")
  .order("created_at", { ascending: false })
  .limit(50);

// Execute both in parallel, then combine
```

## Benefits

1. **Better Index Usage:** Each query can use indexes efficiently
   - `user_id = X` uses `processing_jobs_user_id_analysis_target_idx`
   - `user_id IS NULL` can use a different index strategy

2. **Faster Execution:** Two simple queries are faster than one complex `.or()` query

3. **Parallel Execution:** Both queries run simultaneously, reducing total time

4. **Shorter Timeout:** Reduced from 5 seconds to 3 seconds per query (should complete in < 1 second)

## Required Database Setup

### 1. RLS Policy (CRITICAL)

```sql
CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
```

**Migration:** `20251203012909_fix_processing_jobs_rls.sql` (updated) or `20251207010000_fix_processing_jobs_rls_null_userid.sql`

### 2. Database Indexes

```sql
-- Composite index for user_id + analysis_target
CREATE INDEX IF NOT EXISTS processing_jobs_user_id_analysis_target_idx 
  ON processing_jobs(user_id, analysis_target);

-- Index for NULL user_id queries (if needed)
CREATE INDEX IF NOT EXISTS processing_jobs_analysis_target_created_idx 
  ON processing_jobs(analysis_target, created_at DESC) 
  WHERE user_id IS NULL;

-- Composite index for ordering
CREATE INDEX IF NOT EXISTS processing_jobs_user_analysis_created_idx 
  ON processing_jobs(user_id, analysis_target, created_at DESC);
```

**Migration:** `20251203012910_add_processing_jobs_indexes.sql`

## Expected Performance

- **Before:** 20+ second timeouts
- **After:** < 1 second query completion

## Verification

After applying fixes, check console logs:

```
[DocumentsSidebar] Querying jobs for user_id: ...
[DocumentsSidebar] ✅ Loaded X user jobs + Y NULL user_id jobs = Z total
[DocumentsSidebar] ✅ Loaded Z jobs
```

**If still timing out:**
1. Verify RLS policy allows NULL user_id
2. Verify indexes exist (run SQL queries from migration)
3. Check Supabase dashboard for slow query logs
4. Test queries directly in Supabase SQL Editor
