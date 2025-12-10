-- Fix RLS policy to allow NULL user_id (for backward compatibility with documents uploaded before auth)
-- This allows authenticated users to see documents that were uploaded before user_id was set

-- Drop and recreate the SELECT policy to include NULL user_id
DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;

CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Note: This allows any authenticated user to see documents with NULL user_id
-- This is intentional for backward compatibility. If you want stricter security,
-- you may need to update existing NULL user_id rows to assign them to specific users.
