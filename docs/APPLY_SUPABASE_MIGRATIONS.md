# How to Apply Supabase Migrations

If documents aren't showing in the left panel, you may need to apply database migrations to Supabase.

## Option 1: Supabase Dashboard (Easiest)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. Copy and paste the contents of each migration file (in order):
   - `supabase/migrations/20251203012909_fix_processing_jobs_rls.sql`
   - `supabase/migrations/20251203012910_add_processing_jobs_indexes.sql`
   - `supabase/migrations/20251207000000_fix_analysis_results_rls.sql` ⚠️ **CRITICAL SECURITY FIX**
5. Click **Run** for each migration
6. Verify they completed successfully

## Option 2: Supabase CLI

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Login to Supabase
npx supabase login

# Link to your project (if not already linked)
npx supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
npx supabase db push
```

## Verify Migrations Applied

Run this in Supabase SQL Editor:

```sql
-- Check RLS is enabled for processing_jobs
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'processing_jobs';
-- Should show: rowsecurity = true

-- Check policies exist for processing_jobs
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'processing_jobs';
-- Should show 4 policies

-- Check indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'processing_jobs';
-- Should include: processing_jobs_user_id_analysis_target_idx

-- ⚠️ CRITICAL: Check RLS is enabled for analysis_results
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'analysis_results';
-- Should show: rowsecurity = true

-- Check policies exist for analysis_results
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'analysis_results';
-- Should show 5 policies (2 SELECT, 1 INSERT, 1 UPDATE, 1 DELETE)
```

## After Applying Migrations

1. Refresh your browser
2. Check browser console (F12) for query logs
3. Documents should appear in left panel
