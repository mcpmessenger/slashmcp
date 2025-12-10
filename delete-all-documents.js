// Delete All Documents - Console Script
// Run this in browser console (F12) to delete all your documents
// Works even when sidebar can't load due to query timeouts

(async () => {
  const userId = '39d6e8e4-fad4-4d31-b364-44b0ac864918'; // Your user ID from console logs
  
  console.log('🔍 Fetching all documents for user:', userId);
  
  // Get session token
  const { data: { session }, error: sessionError } = await window.supabase.auth.getSession();
  if (!session || sessionError) {
    console.error('❌ Failed to get session:', sessionError);
    return;
  }
  
  // Query all jobs directly (bypassing the timeout in DocumentsSidebar)
  // Use a longer timeout and simpler query
  const { data: jobs, error } = await window.supabase
    .from('processing_jobs')
    .select('id, file_name, analysis_target, status')
    .eq('user_id', userId);
  
  if (error) {
    console.error('❌ Failed to fetch jobs:', error);
    console.error('This might be an RLS policy issue. Check Supabase dashboard.');
    return;
  }
  
  if (!jobs || jobs.length === 0) {
    console.log('✅ No documents found - nothing to delete');
    return;
  }
  
  console.log(`📄 Found ${jobs.length} document(s):`);
  jobs.forEach((job, i) => {
    console.log(`  ${i + 1}. ${job.file_name} (${job.analysis_target}, ${job.status})`);
  });
  
  // Confirm deletion
  const confirmed = confirm(`Delete ALL ${jobs.length} document(s)?\n\nThis will:\n- Delete from database\n- Delete files from S3\n- Cannot be undone!`);
  
  if (!confirmed) {
    console.log('❌ Deletion cancelled');
    return;
  }
  
  console.log('🗑️ Deleting documents...');
  
  const FUNCTIONS_URL = 'https://akxdroedpsvmckvqvggr.supabase.co/functions/v1';
  let deleted = 0;
  let failed = 0;
  const errors = [];
  
  // Delete each job
  for (const job of jobs) {
    try {
      const response = await fetch(`${FUNCTIONS_URL}/uploads`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': window.env?.VITE_SUPABASE_PUBLISHABLE_KEY || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId: job.id, deleteS3File: true })
      });
      
      if (response.ok) {
        deleted++;
        console.log(`✅ Deleted: ${job.file_name}`);
      } else {
        failed++;
        const errorText = await response.text().catch(() => 'Unknown error');
        errors.push({ file: job.file_name, error: errorText });
        console.error(`❌ Failed: ${job.file_name} - ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      failed++;
      errors.push({ file: job.file_name, error: error.message });
      console.error(`❌ Error deleting ${job.file_name}:`, error);
    }
  }
  
  console.log('\n📊 Summary:');
  console.log(`✅ Deleted: ${deleted}/${jobs.length}`);
  console.log(`❌ Failed: ${failed}/${jobs.length}`);
  
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => console.error(`  - ${e.file}: ${e.error}`));
  }
  
  if (deleted > 0) {
    console.log('\n🔄 Refresh the page to see changes');
  }
})();

