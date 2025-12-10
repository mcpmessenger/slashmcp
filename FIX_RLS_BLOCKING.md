# Fix RLS Blocking Issue

## Problem
Query hangs without error = RLS policy is blocking it silently.

## Step 1: Check if RLS is enabled

Run in **Supabase SQL Editor**:

```sql
-- Check if RLS is enabled on processing_jobs
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'processing_jobs';
```

**If `rls_enabled = true`**, RLS is blocking queries.

---

## Step 2: Check current RLS policies

```sql
-- List all RLS policies on processing_jobs
SELECT 
  policyname,
  cmd as command,
  roles,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE tablename = 'processing_jobs';
```

**Expected:** Should see a policy like "Users can select their own processing jobs"

---

## Step 3: Check the policy condition

```sql
-- Get the exact policy condition
SELECT 
  policyname,
  pg_get_expr(qual, 'processing_jobs'::regclass) as policy_condition
FROM pg_policies
WHERE tablename = 'processing_jobs' 
  AND cmd = 'SELECT';
```

**Should show:** `(auth.uid() = user_id OR user_id IS NULL)`

**If it shows something different or NULL**, that's the problem.

---

## Step 4: Fix RLS Policy

Run this in **Supabase SQL Editor**:

```sql
-- Drop existing policy
DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;

-- Create new policy that allows NULL user_id
CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
```

---

## Step 5: Verify RLS is working

After fixing, test in browser console:

```javascript
// This should work now
window.supabase
  .from('processing_jobs')
  .select('id')
  .limit(1)
  .then(({data, error}) => {
    if (error) {
      console.error('❌ Error:', error);
    } else {
      console.log('✅ Success:', data);
    }
  })
  .catch(err => console.error('❌ Exception:', err));
```

---

## Alternative: Temporarily disable RLS (for testing only)

**⚠️ WARNING: Only for testing, re-enable after!**

```sql
-- Temporarily disable RLS to test
ALTER TABLE processing_jobs DISABLE ROW LEVEL SECURITY;

-- Test your query in browser console - should work now

-- RE-ENABLE RLS after testing
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Then create the correct policy (Step 4)
```

---

## Why queries hang instead of error

When RLS blocks a query:
- Supabase doesn't throw an error
- The query just waits indefinitely
- No response comes back
- This is why you see "Promise {<pending>}"

The fix is to ensure the RLS policy allows your user to query their own rows.

