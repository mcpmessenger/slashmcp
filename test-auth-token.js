// Test if auth token is being sent with queries
// Run these in browser console

// Test 1: Check if session exists
window.supabase.auth.getSession().then(({data, error}) => {
  console.log('Session:', data.session ? '✅ Found' : '❌ Missing');
  console.log('Access Token:', data.session?.access_token ? '✅ Present' : '❌ Missing');
  console.log('User ID:', data.session?.user?.id);
  console.log('Error:', error);
});

// Test 2: Check Network tab
// 1. Open DevTools (F12)
// 2. Go to Network tab
// 3. Run this query:
window.supabase
  .from('processing_jobs')
  .select('id')
  .limit(1)
  .then(({data, error}) => {
    console.log('Result:', {data, error});
  });

// 4. In Network tab, look for request to supabase.co
// 5. Click on it and check:
//    - Request Headers → Authorization header (should have Bearer token)
//    - Status code (200, 401, 403, etc.)
//    - Response (if any)

// Test 3: Test if auth.uid() works in database
// Run this in Supabase SQL Editor:
/*
SELECT 
  auth.uid() as current_user_id,
  '39d6e8e4-fad4-4d31-b364-44b0ac864918' as expected_user_id,
  (auth.uid() = '39d6e8e4-fad4-4d31-b364-44b0ac864918') as matches;
*/

// Test 4: Try query with explicit auth header
// This tests if the issue is with token transmission
const testWithExplicitAuth = async () => {
  const {data: {session}} = await window.supabase.auth.getSession();
  if (!session) {
    console.error('❌ No session');
    return;
  }
  
  console.log('Testing with explicit auth token...');
  const response = await fetch(
    `${window.env.VITE_SUPABASE_URL}/rest/v1/processing_jobs?select=id&limit=1`,
    {
      headers: {
        'apikey': window.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      }
    }
  );
  
  console.log('Response status:', response.status);
  console.log('Response:', await response.text());
};

// Run: testWithExplicitAuth()

