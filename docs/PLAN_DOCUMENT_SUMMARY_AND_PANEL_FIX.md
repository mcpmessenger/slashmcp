# Plan: Document Summary in Chat + Fix Documents Panel

## Problem Analysis

### Issue 1: No Summary in Chat When Processing Completes
**Current State:**
- Documents are processed successfully
- Toast notification shows "Vision analysis ready" or "Text extracted"
- But no summary appears in the chat interface
- User has no way to see what the document contains without querying

**Root Cause:**
- Processing completion is detected in `ChatInput.handleFileUpload`
- Status is updated to "completed" 
- But no message is added to chat with the summary

### Issue 2: Documents Don't Appear in Left Panel
**Current State:**
- Documents are uploaded and processed
- DocumentsSidebar queries `processing_jobs` table
- Query might be failing or returning empty results
- Panel doesn't show even when documents exist

**Possible Root Causes:**
1. **User ID Mismatch**: Query uses `session?.user?.id` but documents might have different `user_id`
2. **Analysis Target Filter**: Query requires `analysis_target = 'document-analysis'` but documents might have different values
3. **RLS Policies**: Row Level Security might be blocking the query
4. **Query Timeout**: Query times out before returning results
5. **Callback Not Called**: `onDocumentsChange` might not be called, so `documentCount` stays 0
6. **Panel Rendering**: Panel might not render even when `documentCount > 0`

## Solution Plan

### Phase 1: Show Summary in Chat When Processing Completes

#### Step 1.1: Detect Processing Completion in Index.tsx
**Location:** `src/pages/Index.tsx` - `pollInterval` function

**Changes:**
- Track which jobs we've already summarized (use a `Set<string>` of job IDs)
- When a job status changes to "completed", check if we've summarized it
- If not summarized, fetch the analysis results and show summary

**Implementation:**
```typescript
const summarizedJobsRef = useRef<Set<string>>(new Set());

// In pollInterval, when status changes to "completed":
if (newStatus === "completed" && !summarizedJobsRef.current.has(result.job.id)) {
  summarizedJobsRef.current.add(result.job.id);
  
  // Fetch analysis results
  const analysisResult = result.result;
  const summary = analysisResult?.vision_summary || 
                  analysisResult?.ocr_text?.substring(0, 500) || 
                  "Document processed successfully.";
  
  // Show summary in chat
  appendAssistantText(
    `📄 **${result.job.file_name}** processing complete!\n\n` +
    `${summary}${summary.length >= 500 ? '...' : ''}`
  );
  
  // Trigger DocumentsSidebar refresh
  setDocumentsSidebarRefreshTrigger(prev => prev + 1);
}
```

#### Step 1.2: Handle Vision Summary vs OCR Text
- Prefer `vision_summary` if available (more concise)
- Fallback to first 500 chars of `ocr_text` if no vision summary
- Truncate with "..." if longer than 500 chars

### Phase 2: Fix Documents Showing in Left Panel

#### Step 2.1: Debug Query Issues
**Location:** `src/components/DocumentsSidebar.tsx` - `loadDocuments` function

**Add Comprehensive Logging:**
```typescript
console.log("[DocumentsSidebar] Query parameters:", {
  userId,
  analysisTarget: "document-analysis",
  hasSession: !!session,
  sessionUserId: session?.user?.id,
});
```

**Check Query Results:**
- Log raw query results before filtering
- Log how many documents found with each filter
- Log analysis_target values found in database

#### Step 2.2: Make Query More Flexible
**Current:** Requires exact match on `analysis_target = 'document-analysis'`
**Fix:** Try primary query first, then fallback to show all jobs if no matches

**Implementation:**
- Keep primary query with `analysis_target` filter
- If no results, try fallback query without filter
- Show all jobs if no document-analysis jobs found (for debugging)
- Log which analysis_target values exist

#### Step 2.3: Ensure Callback is Always Called
**Location:** `src/components/DocumentsSidebar.tsx`

**Current:** `onDocumentsChange` is called in `loadDocuments` but might be missed
**Fix:** Use `useLayoutEffect` to ensure callback is always called (already implemented)

**Verify:**
- Check that `useLayoutEffect` is working correctly
- Ensure callback is called even when component returns `null`
- Log when callback is called with what value

#### Step 2.4: Fix Panel Rendering Logic
**Location:** `src/pages/Index.tsx`

**Current:** Panel only shows when `documentCount > 0`
**Issue:** `documentCount` might not update if callback isn't called

**Fix:**
- Ensure hidden DocumentsSidebar always calls `onDocumentsChange`
- Add logging to track `documentCount` changes
- Verify panel renders when `documentCount > 0`

#### Step 2.5: Handle Guest Users
**Issue:** Guest users might not have `user_id`, so query fails
**Fix:**
- Check if user is in guest mode
- For guest users, query might need different approach
- Or skip query for guest users (they can't upload anyway)

### Phase 3: Testing & Verification

#### Test Cases:
1. **Upload PDF → Check Summary in Chat**
   - Upload a PDF
   - Wait for processing
   - Verify summary appears in chat
   - Verify summary is from vision_summary or ocr_text

2. **Upload Image → Check Summary in Chat**
   - Upload an image
   - Wait for vision analysis
   - Verify vision summary appears in chat

3. **Check Documents Panel Appears**
   - Upload document
   - Wait for processing
   - Verify panel appears on left
   - Verify document is listed
   - Verify summary is shown in panel

4. **Check Multiple Documents**
   - Upload 2-3 documents
   - Verify all appear in panel
   - Verify summaries appear in chat for each

5. **Check Guest Mode**
   - Test as guest user
   - Verify behavior (might not be able to upload)

## Implementation Order

1. **First:** Fix Documents Panel (Phase 2)
   - This is the core issue blocking users
   - Add comprehensive logging
   - Make query more flexible
   - Ensure callbacks work

2. **Second:** Add Summary to Chat (Phase 1)
   - This is a nice-to-have feature
   - Depends on documents being found
   - Can use same data from DocumentsSidebar

## Files to Modify

1. `src/pages/Index.tsx`
   - Add summarizedJobsRef tracking
   - Detect completion in pollInterval
   - Show summary in chat
   - Trigger DocumentsSidebar refresh

2. `src/components/DocumentsSidebar.tsx`
   - Add comprehensive logging
   - Make query more flexible
   - Ensure callbacks work
   - Fix guest user handling

3. `src/lib/api.ts` (if needed)
   - Check fetchJobStatus returns analysis results
   - Verify data structure

## Success Criteria

✅ **Documents Panel:**
- Panel appears when documents exist
- Documents are listed with summaries
- Panel auto-expands when documents found
- Works for both logged-in and guest users

✅ **Summary in Chat:**
- Summary appears when processing completes
- Summary is from vision_summary or ocr_text
- Summary is truncated appropriately
- Each document summarized only once

## Next Steps

1. Start with Phase 2 (Fix Documents Panel)
2. Add logging to understand why documents aren't showing
3. Fix query issues
4. Then implement Phase 1 (Summary in Chat)
5. Test thoroughly
6. Deploy
