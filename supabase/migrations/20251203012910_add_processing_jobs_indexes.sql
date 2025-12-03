-- Add database indexes for processing_jobs queries
-- These indexes optimize the common query pattern: user_id + analysis_target + created_at ordering

-- Composite index for the main query filter (user_id + analysis_target)
CREATE INDEX IF NOT EXISTS processing_jobs_user_id_analysis_target_idx 
  ON processing_jobs(user_id, analysis_target);

-- Index for ordering by created_at (if not exists)
CREATE INDEX IF NOT EXISTS processing_jobs_created_at_idx 
  ON processing_jobs(created_at DESC);

-- Composite index covering both filter and order (most efficient for common queries)
-- This index supports: WHERE user_id = X AND analysis_target = Y ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS processing_jobs_user_analysis_created_idx 
  ON processing_jobs(user_id, analysis_target, created_at DESC);

