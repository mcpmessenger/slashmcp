// Check if documents exist in database
// Run this in browser console (F12)

(async () => {
  const userId = '39d6e8e4-fad4-4d31-b364-44b0ac864918';
  
  console.log('🔍 Checking if documents exist in database...');
  
  // Get session
  const {data: {session}, error: sessionError} = await window.supabase.auth.getSession();
  if (!session || sessionError) {
    console.error('❌ No session:', sessionError);
    return;
  }
  
  // Try to query with timeout
  const queryPromise = window.supabase
    .from('processing_jobs')
    .select('id, file_name, status, analysis_target, created_at')
    .eq('user_id', userId)
    .in('analysis_target', ['document-analysis', 'image-ocr'])
    .order('created_at', { ascending: false })
    .limit(50);
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Query timeout after 5 seconds')), 5000)
  );
  
  try {
    const result = await Promise.race([queryPromise, timeoutPromise]);
    console.log(`✅ Found ${result.data?.length || 0} documents in database:`);
    if (result.data && result.data.length > 0) {
      result.data.forEach((job, i) => {
        console.log(`${i + 1}. ${job.file_name} (${job.status}, ${job.analysis_target})`);
      });
    } else {
      console.log('❌ No documents found in database - they may have been deleted');
    }
  } catch (error) {
    console.error('❌ Query failed or timed out:', error.message);
    console.log('💡 This means the database query is still hanging');
  }
  
  // Also check uploadJobs in memory
  console.log('\n📦 Checking uploadJobs in memory...');
  if (window.uploadJobs) {
    const completed = window.uploadJobs.filter(j => j.status === 'completed');
    console.log(`Found ${completed.length} completed jobs in memory:`, completed.map(j => j.fileName));
  } else {
    console.log('uploadJobs not exposed to window - check React DevTools');
  }
})();



