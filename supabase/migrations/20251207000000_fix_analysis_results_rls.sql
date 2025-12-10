-- Fix RLS policies for analysis_results table
-- This migration ensures authenticated users can only access analysis results for their own processing jobs
-- Addresses critical security vulnerability: RLS bypass allowing unauthenticated access

-- Enable RLS if not already enabled
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to recreate)
DROP POLICY IF EXISTS "Users can view their own analysis results" ON analysis_results;
DROP POLICY IF EXISTS "Authenticated users can view NULL user_id results" ON analysis_results;
DROP POLICY IF EXISTS "Users can insert their own analysis results" ON analysis_results;
DROP POLICY IF EXISTS "Users can update their own analysis results" ON analysis_results;
DROP POLICY IF EXISTS "Users can delete their own analysis results" ON analysis_results;

-- Create proper RLS policy for SELECT: Users can view results for their own jobs
CREATE POLICY "Users can view their own analysis results"
  ON analysis_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM processing_jobs
      WHERE processing_jobs.id = analysis_results.job_id
        AND processing_jobs.user_id = auth.uid()
    )
  );

-- Policy to allow viewing of results for jobs with NULL user_id (for public/system-uploaded documents)
-- This allows authenticated users to view results for jobs that don't have a specific owner
CREATE POLICY "Authenticated users can view NULL user_id results"
  ON analysis_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM processing_jobs
      WHERE processing_jobs.id = analysis_results.job_id
        AND processing_jobs.user_id IS NULL
    )
  );

-- Note: INSERT/UPDATE/DELETE operations are typically performed by server-side functions
-- (textract-worker, vision-worker) which use service role and bypass RLS.
-- However, we add policies here for defense in depth in case client-side code attempts these operations.

-- Policy for INSERT: Users can only insert results for their own jobs
CREATE POLICY "Users can insert their own analysis results"
  ON analysis_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM processing_jobs
      WHERE processing_jobs.id = analysis_results.job_id
        AND processing_jobs.user_id = auth.uid()
    )
  );

-- Policy for UPDATE: Users can only update results for their own jobs
CREATE POLICY "Users can update their own analysis results"
  ON analysis_results
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM processing_jobs
      WHERE processing_jobs.id = analysis_results.job_id
        AND processing_jobs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM processing_jobs
      WHERE processing_jobs.id = analysis_results.job_id
        AND processing_jobs.user_id = auth.uid()
    )
  );

-- Policy for DELETE: Users can only delete results for their own jobs
CREATE POLICY "Users can delete their own analysis results"
  ON analysis_results
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM processing_jobs
      WHERE processing_jobs.id = analysis_results.job_id
        AND processing_jobs.user_id = auth.uid()
    )
  );




