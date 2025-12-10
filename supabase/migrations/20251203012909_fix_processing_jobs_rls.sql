-- Fix RLS policies for processing_jobs table
-- This migration ensures authenticated users can only access their own processing jobs

-- Enable RLS if not already enabled
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to recreate)
DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;
DROP POLICY IF EXISTS "Users can insert their own processing jobs" ON processing_jobs;
DROP POLICY IF EXISTS "Users can update their own processing jobs" ON processing_jobs;
DROP POLICY IF EXISTS "Users can delete their own processing jobs" ON processing_jobs;

-- Create proper RLS policy for SELECT
-- Allow users to see their own jobs OR jobs with NULL user_id (for backward compatibility)
CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Add policy for INSERT (users can create jobs for themselves)
CREATE POLICY "Users can insert their own processing jobs"
  ON processing_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Add policy for UPDATE (users can update their own jobs)
CREATE POLICY "Users can update their own processing jobs"
  ON processing_jobs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add policy for DELETE (users can delete their own jobs)
CREATE POLICY "Users can delete their own processing jobs"
  ON processing_jobs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

