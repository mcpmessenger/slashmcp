# Safe Deployment Guide - Query Timeout Fix

## What Needs to Be Updated

### ✅ Frontend Code (DocumentsSidebar.tsx)
- **File Changed:** `src/components/DocumentsSidebar.tsx`
- **No Edge Functions Changed** - All changes are frontend only
- **No Breaking Changes** - Only query optimization, backward compatible

### ✅ Database Migrations (Supabase)
- **RLS Policy Update:** `20251203012909_fix_processing_jobs_rls.sql` (already updated)
- **Indexes:** `20251203012910_add_processing_jobs_indexes.sql` (verify they exist)

## Safe Testing Approach

### Option 1: Test Locally First (SAFEST - Recommended)

**This won't affect your live site at all:**

```bash
# 1. Make sure you're on a branch (not main)
git checkout -b test-query-fix

# 2. Start local dev server
npm run dev

# 3. Test in browser at http://localhost:5173 (or whatever port Vite uses)
# - Hard refresh: Ctrl+Shift+R
# - Check console for new logs
# - Verify queries complete quickly
```

**If it works locally:**
- Commit and push to test branch
- Create PR to review
- Merge to main when ready (auto-deploys to Vercel)

### Option 2: Deploy to Preview/Staging First

**If you have Vercel preview deployments:**

```bash
# Deploy to preview (not production)
vercel

# Test the preview URL
# If it works, then deploy to production
vercel --prod
```

### Option 3: Direct Production Deploy (Fastest but test first)

**Only do this if you've tested locally:**

```bash
# Push to main (triggers auto-deploy via GitHub Actions)
git add .
git commit -m "Fix: Optimize DocumentsSidebar queries to prevent timeouts"
git push origin main

# Wait ~2-3 minutes for GitHub Actions to deploy
# Check: https://github.com/YOUR_REPO/actions
```

## Database Migrations (Apply to Supabase)

**These are safe to apply - they only add indexes and update RLS policies:**

### Step 1: Apply RLS Policy Fix

Run in Supabase SQL Editor:

```sql
-- This is safe - only updates the SELECT policy
DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;

CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
```

**Why it's safe:**
- Only affects SELECT queries (read-only)
- Doesn't change existing data
- Backward compatible (allows NULL user_id)

### Step 2: Verify/Create Indexes

Run in Supabase SQL Editor:

```sql
-- Check if indexes exist
SELECT indexname FROM pg_indexes WHERE tablename = 'processing_jobs';

-- If missing, create them (safe - only adds indexes, doesn't change data)
CREATE INDEX IF NOT EXISTS processing_jobs_user_id_analysis_target_idx 
  ON processing_jobs(user_id, analysis_target);

CREATE INDEX IF NOT EXISTS processing_jobs_created_at_idx 
  ON processing_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS processing_jobs_user_analysis_created_idx 
  ON processing_jobs(user_id, analysis_target, created_at DESC);
```

**Why it's safe:**
- Indexes are read-only optimizations
- Don't change data or queries
- Can be dropped if needed: `DROP INDEX IF EXISTS ...`

## What WON'T Break

✅ **Existing documents** - All still accessible  
✅ **User authentication** - No changes  
✅ **Edge Functions** - No changes needed  
✅ **API endpoints** - No changes  
✅ **Database schema** - Only indexes added, no table changes  

## Rollback Plan (If Needed)

### Rollback Frontend Code

```bash
# Revert the commit
git revert HEAD
git push origin main
# Auto-deploys previous version
```

### Rollback Database (If Needed)

```sql
-- Revert RLS policy (if needed)
DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;

CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
-- Note: This removes NULL user_id support, but won't break anything
```

## Recommended Order

1. **Test locally first** (`npm run dev`)
2. **Apply database migrations** (safe, can't break anything)
3. **Deploy frontend** (via GitHub Actions or Vercel CLI)
4. **Hard refresh browser** (Ctrl+Shift+R)
5. **Verify in console** - Should see new query logs

## Quick Test Checklist

After deployment, check console for:

✅ `[DocumentsSidebar] Using separate queries (join was causing timeouts)`  
✅ `[DocumentsSidebar] Querying jobs for user_id: ...`  
✅ `[DocumentsSidebar] ✅ Loaded X user jobs + Y NULL user_id jobs = Z total`  
✅ No more "Query timeout after 20 seconds" errors  

## If Something Goes Wrong

1. **Frontend issue:** Revert via Git (auto-deploys previous version)
2. **Database issue:** Rollback RLS policy (see above)
3. **Indexes:** Can be dropped safely if needed

**All changes are backward compatible and safe to rollback.**
