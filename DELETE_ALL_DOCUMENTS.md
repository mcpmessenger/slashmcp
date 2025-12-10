# Delete All Documents

## Quick Solution

Since the sidebar disappeared (because `documentCount: 0`), you can delete all documents from the browser console:

### Method 1: Console Command (Works Even When Sidebar is Hidden)

**Open browser console (F12) and run:**

```javascript
// Delete all documents for your user
(async () => {
  const userId = '39d6e8e4-fad4-4d31-b364-44b0ac864918'; // Your user ID from console
  
  // First, get all your job IDs
  const { data: jobs, error } = await window.supabase
    .from('processing_jobs')
    .select('id, file_name')
    .eq('user_id', userId)
    .in('analysis_target', ['document-analysis', 'image-ocr']);
  
  if (error) {
    console.error('Failed to fetch jobs:', error);
    return;
  }
  
  if (!jobs || jobs.length === 0) {
    console.log('No documents found');
    return;
  }
  
  console.log(`Found ${jobs.length} documents to delete`);
  
  // Delete each one
  let deleted = 0;
  let failed = 0;
  
  for (const job of jobs) {
    try {
      const response = await fetch('https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/uploads', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${(await window.supabase.auth.getSession()).data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId: job.id, deleteS3File: true })
      });
      
      if (response.ok) {
        deleted++;
        console.log(`✅ Deleted: ${job.file_name}`);
      } else {
        failed++;
        console.error(`❌ Failed: ${job.file_name}`);
      }
    } catch (error) {
      failed++;
      console.error(`❌ Error deleting ${job.file_name}:`, error);
    }
  }
  
  console.log(`\n✅ Deleted: ${deleted}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('Refresh the page to see changes');
})();
```

### Method 2: Using the Exposed Function (After Sidebar Loads)

Once the sidebar loads (if queries work), you can use:

```javascript
// This function is exposed when DocumentsSidebar is mounted
window.deleteAllDocuments();
```

## Why the Sidebar Disappeared

The sidebar only shows when `documentCount > 0`. Since queries are timing out, it can't load documents, so `documentCount` stays at 0 and the sidebar is hidden.

## Fix the Query Timeout Issue

The queries are timing out after 3 seconds. This is likely an **RLS (Row Level Security) policy issue**. 

**Check in Supabase SQL Editor:**

```sql
-- Check if RLS is blocking queries
SELECT * FROM processing_jobs 
WHERE user_id = '39d6e8e4-fad4-4d31-b364-44b0ac864918'
  AND analysis_target IN ('document-analysis', 'image-ocr')
LIMIT 10;
```

**If this query works but the app query times out, it's an RLS policy issue.**

**Fix RLS Policy:**

```sql
-- Drop existing policy
DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;

-- Create new policy that allows NULL user_id (for backward compatibility)
CREATE POLICY "Users can select their own processing jobs"
  ON processing_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
```

## After Deleting All

1. Run the delete script above
2. Refresh the page
3. The sidebar should stay hidden (no documents)
4. Upload new documents to test

