// Test simpler queries to isolate the issue
// Run these one at a time in browser console (F12)

// Test 1: Check if Supabase client works at all
(async () => {
  console.log('Test 1: Basic Supabase connection...');
  const { data, error } = await window.supabase.from('processing_jobs').select('count').limit(1);
  console.log('Result:', { data, error });
})();

// Test 2: Simple query without filters
(async () => {
  console.log('Test 2: Query without filters...');
  const start = Date.now();
  const { data, error } = await window.supabase
    .from('processing_jobs')
    .select('id, file_name')
    .limit(5);
  const duration = Date.now() - start;
  console.log(`Took ${duration}ms:`, { data, error });
})();

// Test 3: Query with just user_id (no analysis_target filter)
(async () => {
  console.log('Test 3: Query with user_id only...');
  const userId = '39d6e8e4-fad4-4d31-b364-44b0ac864918';
  const start = Date.now();
  const { data, error } = await window.supabase
    .from('processing_jobs')
    .select('id, file_name')
    .eq('user_id', userId)
    .limit(5);
  const duration = Date.now() - start;
  console.log(`Took ${duration}ms:`, { data, error });
})();

// Test 4: Query with timeout wrapper
(async () => {
  console.log('Test 4: Query with 5 second timeout...');
  const userId = '39d6e8e4-fad4-4d31-b364-44b0ac864918';
  
  const queryPromise = window.supabase
    .from('processing_jobs')
    .select('id, file_name, status')
    .eq('user_id', userId)
    .in('analysis_target', ['document-analysis', 'image-ocr'])
    .order('created_at', { ascending: false })
    .limit(50);
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Query timeout after 5 seconds')), 5000)
  );
  
  try {
    const start = Date.now();
    const result = await Promise.race([queryPromise, timeoutPromise]);
    const duration = Date.now() - start;
    console.log(`✅ Query completed in ${duration}ms:`, result);
  } catch (error) {
    console.error('❌ Query failed or timed out:', error);
  }
})();

