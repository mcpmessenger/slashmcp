-- Fix RLS Policy for processing_jobs
-- This allows users to query their own jobs OR jobs with NULL user_id

-- Step 1: Drop existing policy (if it exists)
DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;

-- Step 2: Create new policy that allows NULL user_id
CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Step 3: Verify the policy was created
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'processing_jobs' 
  AND policyname = 'Users can select their own processing jobs';

