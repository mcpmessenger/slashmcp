// MANUAL LOAD DOCUMENTS - Run this in browser console
// This bypasses the timeout issue and manually loads documents

(async () => {
  const userId = '39d6e8e4-fad4-4d31-b364-44b0ac864918';
  
  console.log('🔍 Loading documents manually...');
  
  // Step 1: Get session
  const {data: {session}, error: sessionError} = await window.supabase.auth.getSession();
  if (!session || sessionError) {
    console.error('❌ No session:', sessionError);
    return;
  }
  
  console.log('✅ Session found, user:', session.user.id);
  
  // Step 2: Try direct REST API call (bypasses Supabase client timeout)
  const url = `${window.env.VITE_SUPABASE_URL}/rest/v1/processing_jobs?select=id,file_name,file_type,status,created_at,analysis_target&user_id=eq.${userId}&analysis_target=in.(document-analysis,image-ocr)&order=created_at.desc&limit=50`;
  
  console.log('📡 Fetching from:', url);
  
  try {
    const response = await fetch(url, {
      headers: {
        'apikey': window.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });
    
    console.log('📊 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      return;
    }
    
    const jobs = await response.json();
    console.log(`✅ Found ${jobs.length} documents:`);
    
    jobs.forEach((job, i) => {
      console.log(`${i + 1}. ${job.file_name} (${job.status}) - ${job.analysis_target}`);
    });
    
    // Step 3: Get summaries
    if (jobs.length > 0) {
      const jobIds = jobs.map(j => j.id).join(',');
      const summaryUrl = `${window.env.VITE_SUPABASE_URL}/rest/v1/analysis_results?select=job_id,vision_summary,ocr_text&job_id=in.(${jobIds})`;
      
      console.log('📄 Fetching summaries...');
      const summaryResponse = await fetch(summaryUrl, {
        headers: {
          'apikey': window.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (summaryResponse.ok) {
        const summaries = await summaryResponse.json();
        const summaryMap = new Map(summaries.map(s => [s.job_id, s]));
        
        console.log(`✅ Found ${summaries.length} summaries:`);
        jobs.forEach(job => {
          const summary = summaryMap.get(job.id);
          if (summary) {
            const text = summary.vision_summary || summary.ocr_text?.substring(0, 100);
            console.log(`  - ${job.file_name}: ${text ? text.substring(0, 80) + '...' : 'No summary'}`);
          }
        });
      }
    }
    
    // Step 4: Try to trigger sidebar refresh
    console.log('\n💡 To refresh sidebar, run:');
    console.log('   window.location.reload();');
    console.log('\nOr manually trigger refresh by calling the sidebar refresh function');
    
  } catch (error) {
    console.error('❌ Exception:', error);
  }
})();

