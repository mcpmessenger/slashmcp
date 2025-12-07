# Debug: Sidebar Not Showing / No Summaries

## Current Status

The DocumentsSidebar should:
1. ✅ Always appear on the left when authenticated (like logs panel on right)
2. ✅ Load documents from `processing_jobs` table
3. ✅ Fetch summaries from `analysis_results` table
4. ✅ Display summaries below file size

## Recent Changes

### Fixed Query Approach
Changed from nested relationship query to separate queries:
- First: Query `processing_jobs` table
- Then: Query `analysis_results` table separately
- Merge results in JavaScript

This is more reliable than Supabase's nested relationship syntax.

## Debugging Steps

### 1. Check if Sidebar is Rendering

Open browser console (F12) and look for:
```
[DocumentsSidebar] RENDER - Current state: {...}
```

If you see this log, the component is rendering.

### 2. Check if Query is Executing

Look for these logs:
```
[DocumentsSidebar] Starting query for userId: ...
[DocumentsSidebar] Loaded X documents
[DocumentsSidebar] Loaded X analysis results
```

### 3. Check for Errors

Look for error logs:
```
[DocumentsSidebar] Query error: ...
[DocumentsSidebar] Database query error: ...
```

### 4. Verify Sidebar Visibility

The sidebar should be in a `ResizablePanel` on the left side. Check:
- Is the panel visible? (Should have a border on the right)
- Is it collapsed? (Try dragging the resize handle)
- Check browser DevTools → Elements → Look for `DocumentsSidebar` component

### 5. Check Document Count

The sidebar shows:
- **Loading state**: "Loading documents..." with spinner
- **Empty state**: "No documents yet" with upload hint
- **Documents**: List of documents with summaries

### 6. Verify Summaries are Being Fetched

Check console for:
```
[DocumentsSidebar] Loaded X analysis results
```

If this shows 0, summaries won't appear even if documents do.

## Common Issues

### Issue 1: Sidebar Not Visible
**Symptoms**: No left panel at all
**Possible Causes**:
- Panel width is 0
- CSS hiding the panel
- Not authenticated (check `session` or `guestMode`)

**Fix**: Check `src/pages/Index.tsx` - sidebar should always render when `(session || guestMode)`

### Issue 2: No Documents Showing
**Symptoms**: Sidebar shows "No documents yet"
**Possible Causes**:
- No documents uploaded
- Documents have wrong `analysis_target` (should be "document-analysis")
- Query failing silently

**Fix**: 
1. Check console for query errors
2. Verify documents exist in database
3. Check `analysis_target` field

### Issue 3: Documents Show But No Summaries
**Symptoms**: Documents appear but no summary text
**Possible Causes**:
- `analysis_results` table has no data
- `vision_summary` and `ocr_text` are both null
- Query for analysis_results failing

**Fix**:
1. Check console: `[DocumentsSidebar] Loaded X analysis results`
2. Verify `analysis_results` table has data for your job_ids
3. Check if `vision_summary` or `ocr_text` fields have values

## Manual Testing

### Test 1: Verify Sidebar Renders
1. Open app (should be authenticated)
2. Check left side - should see "Documents & Knowledge" panel
3. If not visible, check console for errors

### Test 2: Verify Documents Load
1. Upload a document
2. Wait for processing
3. Check sidebar - should show document
4. Check console for query logs

### Test 3: Verify Summaries Load
1. Upload an image (for vision_summary) or PDF (for ocr_text)
2. Wait for processing to complete
3. Check sidebar - should show summary below file size
4. Check console: `[DocumentsSidebar] Loaded X analysis results`

## Database Queries to Run

If debugging, run these in Supabase SQL editor:

```sql
-- Check if documents exist
SELECT id, file_name, status, analysis_target 
FROM processing_jobs 
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC;

-- Check if analysis results exist
SELECT job_id, vision_summary, ocr_text 
FROM analysis_results 
WHERE job_id IN (
  SELECT id FROM processing_jobs WHERE user_id = 'YOUR_USER_ID'
);
```

## Next Steps

If sidebar still not showing:
1. Check browser console for all `[DocumentsSidebar]` logs
2. Verify authentication state
3. Check ResizablePanel is rendering
4. Verify no CSS is hiding the panel

If summaries not showing:
1. Verify `analysis_results` table has data
2. Check console for analysis query logs
3. Verify `vision_summary` or `ocr_text` have values
4. Check the summary extraction logic in code
