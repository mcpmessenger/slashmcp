# Bug Bounty: Document Pipeline Issues

## Critical Issues

### Issue 1: Documents Not Appearing in Left Panel
**Status:** 🔴 ACTIVE  
**Severity:** HIGH  
**Impact:** Users cannot see their uploaded documents, making the feature unusable

### Issue 2: Document Summaries Not Appearing in Chat
**Status:** 🔴 ACTIVE  
**Severity:** MEDIUM  
**Impact:** Users don't get feedback when processing completes, don't know what their documents contain

---

## Complete Pipeline Flow

### 1. Document Upload Flow

```
User uploads file
  ↓
ChatInput.handleFileUpload()
  ↓
registerUploadJob() [api.ts]
  ↓
POST /functions/v1/uploads [Supabase Edge Function]
  ↓
Insert into processing_jobs table
  ↓
Trigger processing (textract-worker or vision-worker)
  ↓
Processing completes → Insert into analysis_results
  ↓
Index.tsx pollInterval detects completion
  ↓
Show summary in chat + refresh DocumentsSidebar
  ↓
DocumentsSidebar.loadDocuments() queries database
  ↓
Display documents in left panel
```

---

## Issue 1: Documents Not Showing in Left Panel

### Symptoms
- Documents uploaded successfully
- Toast shows "Vision analysis ready" or "Text extracted"
- Left panel remains empty or shows "No documents yet"
- MCP Event Log shows processing completed

### Root Cause Analysis

#### Potential Causes

**1. User ID Mismatch**
- **Location:** `src/components/DocumentsSidebar.tsx` line ~150-200
- **Issue:** Query filters by `user_id`, but documents might have `NULL` user_id
- **Check:**
  ```sql
  -- Run in Supabase SQL Editor
  SELECT id, file_name, user_id, analysis_target, status, created_at
  FROM processing_jobs
  ORDER BY created_at DESC
  LIMIT 10;
  ```
- **Fix Applied:** Query now includes `user_id.is.null` OR condition

**2. Analysis Target Filter**
- **Location:** `src/components/DocumentsSidebar.tsx` line ~200
- **Issue:** Query requires `analysis_target = 'document-analysis'` but documents might have different values
- **Check:**
  ```sql
  SELECT DISTINCT analysis_target, COUNT(*) 
  FROM processing_jobs 
  GROUP BY analysis_target;
  ```
- **Current Filter:** `.eq("analysis_target", "document-analysis")`

**3. RLS (Row Level Security) Policies**
- **Location:** Supabase database policies
- **Issue:** RLS might be blocking queries even for authenticated users
- **Check:**
  ```sql
  -- Check RLS policies
  SELECT * FROM pg_policies 
  WHERE tablename = 'processing_jobs';
  
  -- Test query as authenticated user
  SELECT id, file_name, user_id 
  FROM processing_jobs 
  WHERE user_id = auth.uid() OR user_id IS NULL;
  ```
- **Fix Applied:** Migration `20251203012909_fix_processing_jobs_rls.sql`

**4. Query Timeout**
- **Location:** `src/components/DocumentsSidebar.tsx` line ~200-250
- **Issue:** Query times out before returning results
- **Current Timeout:** 20 seconds primary, 15 seconds fallback
- **Check:** Browser console for `[DocumentsSidebar] Query timeout` messages

**5. Session Not Available**
- **Location:** `src/components/DocumentsSidebar.tsx` line ~136-150
- **Issue:** `getSessionFromStorage()` returns null, so userId is undefined
- **Check:** Browser console for `[DocumentsSidebar] No valid session found`
- **Fix:** Component now accepts `userId` prop from parent

**6. Callback Not Called**
- **Location:** `src/components/DocumentsSidebar.tsx` line ~400-450
- **Issue:** `onDocumentsChange` callback not called, so `documentCount` stays 0
- **Check:** Browser console for `[Index] DocumentsSidebar reported document count:`
- **Fix:** Uses `useLayoutEffect` to guarantee callback execution

**7. Panel Not Rendering**
- **Location:** `src/pages/Index.tsx` line ~650-700
- **Issue:** Panel only renders when `documentCount > 0`, but count never updates
- **Check:** React DevTools to see if `documentCount` state updates

### Debugging Steps

#### Step 1: Check Browser Console
Look for these messages:

```
[DocumentsSidebar] Loading documents...
[DocumentsSidebar] Query parameters: userId=xxx, analysisTarget=document-analysis
[DocumentsSidebar] Query result: X documents found
[DocumentsSidebar] Documents loaded: [array of documents]
[Index] DocumentsSidebar reported document count: X
```

**If you see:**
- `Query timeout` → Database query is slow or hanging
- `No valid session found` → Session not available
- `Success. No rows returned` → Query succeeded but no matching documents
- `Error loading documents` → Check error message

#### Step 2: Check Database Directly

**Run in Supabase SQL Editor:**

```sql
-- Check if documents exist
SELECT 
  id,
  file_name,
  user_id,
  analysis_target,
  status,
  created_at,
  updated_at
FROM processing_jobs
ORDER BY created_at DESC
LIMIT 20;

-- Check analysis results
SELECT 
  job_id,
  vision_summary,
  ocr_text,
  created_at
FROM analysis_results
ORDER BY created_at DESC
LIMIT 10;

-- Check for NULL user_id (common issue)
SELECT COUNT(*) as null_user_count
FROM processing_jobs
WHERE user_id IS NULL;

-- Check user_id distribution
SELECT 
  user_id,
  COUNT(*) as doc_count
FROM processing_jobs
GROUP BY user_id
ORDER BY doc_count DESC;
```

#### Step 3: Check localStorage Session

**In Browser Console:**

```javascript
// Check session
const sessionKey = 'sb-akxdroedpsvmckvqvggr-auth-token';
const raw = localStorage.getItem(sessionKey);
if (raw) {
  const parsed = JSON.parse(raw);
  const session = parsed.currentSession || parsed.session || parsed;
  console.log('User ID:', session.user?.id);
  console.log('Access token:', session.access_token?.substring(0, 20) + '...');
  console.log('Expires at:', new Date(session.expires_at * 1000));
} else {
  console.log('No session found');
}
```

#### Step 4: Test Query Manually

**In Browser Console (on the app page):**

```javascript
// Get Supabase client
const supabase = window.supabase;

// Get current user
const { data: { session } } = await supabase.auth.getSession();
const userId = session?.user?.id;
console.log('Current user ID:', userId);

// Test query
const { data, error } = await supabase
  .from('processing_jobs')
  .select(`
    id,
    file_name,
    file_type,
    file_size,
    status,
    metadata,
    created_at,
    updated_at,
    analysis_target,
    analysis_results (
      vision_summary,
      ocr_text
    )
  `)
  .or(`user_id.eq.${userId},user_id.is.null`)
  .eq('analysis_target', 'document-analysis')
  .order('created_at', { ascending: false })
  .limit(20);

console.log('Query result:', data);
console.log('Query error:', error);
console.log('Document count:', data?.length || 0);
```

#### Step 5: Check React State

**In React DevTools:**
1. Select `DocumentsSidebar` component
2. Check `documents` state - should be array of documents
3. Check `isLoading` state - should be `false` after load
4. Check `hasError` state - should be `false`

**In Index component:**
1. Check `documentCount` state - should match number of documents
2. Check `documentsSidebarRefreshTrigger` - should increment when refresh needed

### Common Fixes

**Fix 1: NULL user_id Documents**
```typescript
// Already applied in DocumentsSidebar.tsx
.or(`user_id.eq.${userId},user_id.is.null`)
```

**Fix 2: Missing RLS Policies**
```sql
-- Run migration: 20251203012909_fix_processing_jobs_rls.sql
-- This ensures users can read their own documents and NULL user_id documents
```

**Fix 3: Session Not Passed**
```typescript
// Index.tsx should pass userId prop
<DocumentsSidebar
  userId={session?.user?.id}
  refreshTrigger={documentsSidebarRefreshTrigger}
  onDocumentsChange={setDocumentCount}
/>
```

---

## Issue 2: Document Summaries Not Appearing in Chat

### Symptoms
- Document processing completes (status = "completed")
- Toast notification shows success
- No summary message appears in chat
- User doesn't know what the document contains

### Root Cause Analysis

#### Potential Causes

**1. Poll Interval Not Detecting Completion**
- **Location:** `src/pages/Index.tsx` line ~127-235
- **Issue:** `pollInterval` might not be running or not detecting status change
- **Check:** Browser console for `[Index] Job completed` messages
- **Current Poll Interval:** 5 seconds

**2. Summary Already Shown (Duplicate Prevention)**
- **Location:** `src/pages/Index.tsx` line ~88, 178
- **Issue:** `summarizedJobsRef` tracks shown summaries, might prevent re-showing
- **Check:** Browser console for `summarizedJobsRef` state
- **Fix:** Ref is cleared on component unmount

**3. Analysis Results Not Available**
- **Location:** `src/pages/Index.tsx` line ~182-196
- **Issue:** `result.result` might not contain `vision_summary` or `ocr_text`
- **Check:** Database to verify `analysis_results` table has data
- **Query:**
  ```sql
  SELECT job_id, vision_summary, ocr_text
  FROM analysis_results
  WHERE job_id IN (
    SELECT id FROM processing_jobs WHERE status = 'completed'
  );
  ```

**4. appendAssistantText Not Working**
- **Location:** `src/pages/Index.tsx` line ~199-203
- **Issue:** `appendAssistantText` function might not be working
- **Check:** Browser console for errors when calling `appendAssistantText`
- **Test:** Manually call `appendAssistantText("Test message")` in console

**5. Job Status Not Updating**
- **Location:** `src/pages/Index.tsx` line ~158-177
- **Issue:** Status might not change from "processing" to "completed"
- **Check:** Database to see actual status:
  ```sql
  SELECT id, file_name, status, updated_at
  FROM processing_jobs
  ORDER BY updated_at DESC
  LIMIT 10;
  ```

### Debugging Steps

#### Step 1: Check Poll Interval

**In Browser Console:**

```javascript
// Check if pollInterval is running
// Look for these messages every 5 seconds:
// [Index] Polling for job status updates...
// [Index] Found X jobs to check
```

**If no messages:**
- Poll interval might not be set up
- Check `useEffect` dependency array in Index.tsx

#### Step 2: Check Job Status in Database

```sql
-- Check recent jobs and their status
SELECT 
  id,
  file_name,
  status,
  metadata->>'stage' as stage,
  created_at,
  updated_at
FROM processing_jobs
ORDER BY updated_at DESC
LIMIT 10;

-- Check if any jobs are stuck
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (NOW() - updated_at))) as avg_age_seconds
FROM processing_jobs
GROUP BY status;
```

#### Step 3: Check Analysis Results

```sql
-- Check if analysis results exist for completed jobs
SELECT 
  ar.job_id,
  pj.file_name,
  pj.status,
  ar.vision_summary IS NOT NULL as has_vision_summary,
  ar.ocr_text IS NOT NULL as has_ocr_text,
  LENGTH(ar.vision_summary) as vision_summary_length,
  LENGTH(ar.ocr_text) as ocr_text_length
FROM analysis_results ar
JOIN processing_jobs pj ON ar.job_id = pj.id
WHERE pj.status = 'completed'
ORDER BY ar.created_at DESC
LIMIT 10;
```

#### Step 4: Test Summary Display Manually

**In Browser Console (on the app page):**

```javascript
// Get a completed job ID from database
const jobId = 'YOUR_JOB_ID_HERE';

// Fetch job status
const response = await fetch(`/functions/v1/job-status?jobId=${jobId}`);
const result = await response.json();

console.log('Job status:', result);
console.log('Has vision_summary:', !!result.result?.vision_summary);
console.log('Has ocr_text:', !!result.result?.ocr_text);

// Try to manually trigger summary
// (This would need to be done in the component context)
```

#### Step 5: Check summarizedJobsRef

**In React DevTools:**
1. Select `Index` component
2. Check `summarizedJobsRef.current` - should be a Set
3. Verify job IDs are being added when summaries are shown

**In Browser Console:**

```javascript
// Check if job is already summarized
// (This requires access to the component instance)
// Look for: [Index] Job completed, triggering DocumentsSidebar refresh
```

### Common Fixes

**Fix 1: Ensure Poll Interval Runs**
```typescript
// Already implemented in Index.tsx
useEffect(() => {
  const pollInterval = setInterval(async () => {
    // Poll logic
  }, POLL_INTERVAL_MS);
  return () => clearInterval(pollInterval);
}, [uploadJobs]);
```

**Fix 2: Clear summarizedJobsRef on Unmount**
```typescript
// Already implemented
useEffect(() => {
  return () => {
    summarizedJobsRef.current.clear();
  };
}, []);
```

**Fix 3: Fallback Summary Text**
```typescript
// Already implemented
if (!summary) {
  summary = "Document processed successfully and is ready for queries.";
}
```

---

## Complete Diagnostic Checklist

### For Documents Not Showing

- [ ] Check browser console for `[DocumentsSidebar]` messages
- [ ] Verify session exists in localStorage
- [ ] Check user_id in database matches session user_id
- [ ] Verify `analysis_target = 'document-analysis'` in database
- [ ] Check RLS policies allow reading processing_jobs
- [ ] Test query manually in browser console
- [ ] Verify `onDocumentsChange` callback is called
- [ ] Check `documentCount` state in Index component
- [ ] Verify panel rendering condition `documentCount > 0`

### For Summaries Not Showing

- [ ] Check browser console for `[Index] Job completed` messages
- [ ] Verify job status is actually "completed" in database
- [ ] Check `analysis_results` table has data for the job
- [ ] Verify `vision_summary` or `ocr_text` exists
- [ ] Check `summarizedJobsRef` doesn't already contain job ID
- [ ] Test `appendAssistantText` function manually
- [ ] Verify poll interval is running (check console every 5s)
- [ ] Check for errors in console when summary should appear

---

## SQL Queries for Diagnosis

### Check Document Pipeline Health

```sql
-- Overall pipeline health
SELECT 
  'Total Jobs' as metric,
  COUNT(*) as value
FROM processing_jobs
UNION ALL
SELECT 
  'Completed Jobs',
  COUNT(*)
FROM processing_jobs
WHERE status = 'completed'
UNION ALL
SELECT 
  'Jobs with Analysis Results',
  COUNT(DISTINCT ar.job_id)
FROM analysis_results ar
JOIN processing_jobs pj ON ar.job_id = pj.id
UNION ALL
SELECT 
  'Jobs with Vision Summary',
  COUNT(*)
FROM analysis_results
WHERE vision_summary IS NOT NULL
UNION ALL
SELECT 
  'Jobs with OCR Text',
  COUNT(*)
FROM analysis_results
WHERE ocr_text IS NOT NULL
UNION ALL
SELECT 
  'NULL user_id Jobs',
  COUNT(*)
FROM processing_jobs
WHERE user_id IS NULL;
```

### Find Problematic Jobs

```sql
-- Jobs that completed but have no analysis results
SELECT 
  pj.id,
  pj.file_name,
  pj.status,
  pj.user_id,
  pj.created_at,
  pj.updated_at
FROM processing_jobs pj
LEFT JOIN analysis_results ar ON pj.id = ar.job_id
WHERE pj.status = 'completed'
  AND ar.job_id IS NULL
ORDER BY pj.updated_at DESC;

-- Jobs stuck in processing
SELECT 
  id,
  file_name,
  status,
  metadata->>'stage' as stage,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) as seconds_since_update
FROM processing_jobs
WHERE status IN ('processing', 'queued')
  AND updated_at < NOW() - INTERVAL '5 minutes'
ORDER BY updated_at ASC;
```

---

## Expected Console Output

### Successful Document Load

```
[DocumentsSidebar] Loading documents...
[DocumentsSidebar] Query parameters: userId=abc123, analysisTarget=document-analysis, hasSession=true
[DocumentsSidebar] Query result: 3 documents found
[DocumentsSidebar] Documents loaded: [
  { jobId: "job1", fileName: "doc.pdf", status: "completed", ... },
  { jobId: "job2", fileName: "img.png", status: "completed", ... },
  { jobId: "job3", fileName: "file.docx", status: "processing", ... }
]
[DocumentsSidebar] Analysis targets found: ["document-analysis"]
[Index] DocumentsSidebar reported document count: 3
```

### Successful Summary Display

```
[Index] Polling for job status updates...
[Index] Found 1 jobs to check
[Index] Job job1 status changed: processing -> completed
[Index] Job completed, triggering DocumentsSidebar refresh
[Index] Showing summary for job job1
```

---

## Next Steps

1. **Run diagnostic queries** in Supabase SQL Editor
2. **Check browser console** for error messages
3. **Test manual queries** in browser console
4. **Verify RLS policies** are correctly applied
5. **Check session availability** in localStorage
6. **Test with a fresh upload** and watch console logs
7. **Share findings** - console logs, SQL query results, error messages

---

## Files to Check

- `src/components/DocumentsSidebar.tsx` - Document loading and display
- `src/pages/Index.tsx` - Polling and summary display
- `src/lib/api.ts` - API calls for job status
- `supabase/functions/uploads/index.ts` - Upload registration
- `supabase/migrations/20251203012909_fix_processing_jobs_rls.sql` - RLS policies
- `supabase/migrations/20251203012910_add_processing_jobs_indexes.sql` - Database indexes

---

## Contact & Reporting

When reporting issues, please include:
1. Browser console logs (all `[DocumentsSidebar]` and `[Index]` messages)
2. SQL query results from diagnostic queries
3. Screenshot of localStorage session data
4. Network tab showing API calls
5. React DevTools showing component state



