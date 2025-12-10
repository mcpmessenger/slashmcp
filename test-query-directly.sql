-- Test the exact query the app uses
-- Replace USER_ID with your actual user ID: 39d6e8e4-fad4-4d31-b364-44b0ac864918

-- First, check if the query works at all
SELECT
  id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target
FROM processing_jobs
WHERE user_id = '39d6e8e4-fad4-4d31-b364-44b0ac864918'
  AND analysis_target IN ('document-analysis', 'image-ocr')
ORDER BY created_at DESC
LIMIT 50;

-- Then check the execution plan and timing
EXPLAIN ANALYZE
SELECT
  id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target
FROM processing_jobs
WHERE user_id = '39d6e8e4-fad4-4d31-b364-44b0ac864918'
  AND analysis_target IN ('document-analysis', 'image-ocr')
ORDER BY created_at DESC
LIMIT 50;

-- Check how many rows match
SELECT COUNT(*) as total_matching_rows
FROM processing_jobs
WHERE user_id = '39d6e8e4-fad4-4d31-b364-44b0ac864918'
  AND analysis_target IN ('document-analysis', 'image-ocr');

-- Check RLS policy is working (should return rows)
SELECT 
  policyname,
  cmd,
  qual as policy_condition
FROM pg_policies
WHERE tablename = 'processing_jobs';

