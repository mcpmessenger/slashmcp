-- Check RLS policies (simpler version)
SELECT 
  policyname,
  cmd,
  qual as policy_condition
FROM pg_policies
WHERE tablename = 'processing_jobs';

-- Check if RLS is enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'processing_jobs';

