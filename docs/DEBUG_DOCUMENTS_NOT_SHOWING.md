# Debug: Documents Not Showing in Left Panel

## Problem
Documents appear in MCP Event Log (right panel) but NOT in Documents & Knowledge panel (left panel).

## Quick Diagnosis Steps

### Step 1: Check Browser Console
Open browser console (F12) and look for:
- `[DocumentsSidebar] ===== Starting query =====`
- `[DocumentsSidebar] Query parameters: {...}`
- `[DocumentsSidebar] ✅ Primary query loaded X documents`
- `[DocumentsSidebar] ⚠️ Primary query returned no results`

**What to look for:**
- Is the query running?
- What `userId` is being used?
- How many documents are found?
- Any error messages?

### Step 2: Check Supabase Database

Run these queries in Supabase SQL Editor:

#### 2.1: Check if documents exist
```sql
-- Replace YOUR_USER_ID with your actual user ID (from browser console or auth.users table)
SELECT 
  id,
  file_name,
  user_id,
  analysis_target,
  status,
  created_at
FROM processing_jobs
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:** Should see your uploaded documents

#### 2.2: Check RLS is enabled
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'processing_jobs';
```

**Expected:** `rowsecurity` should be `true`

#### 2.3: Check RLS policies exist
```sql
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'processing_jobs'
ORDER BY cmd;
```

**Expected:** Should see 4 policies including:
- `Users can select their own processing jobs` (cmd = SELECT)
- The `qual` should contain: `(auth.uid() = user_id)`

#### 2.4: Check analysis_target values
```sql
SELECT DISTINCT analysis_target, COUNT(*) as count
FROM processing_jobs
WHERE user_id = 'YOUR_USER_ID'
GROUP BY analysis_target;
```

**Expected:** Should see `document-analysis` or other values

### Step 3: Verify Migrations Applied

Check if these migrations have been applied:
- `20251203012909_fix_processing_jobs_rls.sql` - RLS policies
- `20251203012910_add_processing_jobs_indexes.sql` - Database indexes

**To apply migrations:**
1. Go to Supabase Dashboard → SQL Editor
2. Copy the contents of each migration file
3. Run them in order
4. Or use Supabase CLI: `npx supabase db push`

## Common Issues & Fixes

### Issue 1: RLS Policies Not Applied
**Symptom:** Query returns empty or times out
**Fix:** Apply migration `20251203012909_fix_processing_jobs_rls.sql`

### Issue 2: User ID Mismatch
**Symptom:** Documents exist but query finds 0
**Fix:** Check console logs for `userId` vs actual `user_id` in database

### Issue 3: Analysis Target Mismatch
**Symptom:** Documents exist but have different `analysis_target`
**Fix:** The fallback query should catch this, but check console logs

### Issue 4: Guest Mode
**Symptom:** No `userId` available
**Fix:** Guest users can't upload documents, so this is expected

## Next Steps

1. **Check console logs** - See what the query is finding
2. **Check database** - Verify documents exist and RLS is configured
3. **Apply migrations** - If RLS policies are missing
4. **Check user_id** - Ensure it matches between query and database
