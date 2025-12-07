# Fix: Sidebar Stuck in Loading State

## Problem

Documents are being uploaded and analyzed (vision analysis completes), but:
- ❌ Sidebar shows spinner forever (`isLoading: true`)
- ❌ No documents appear in sidebar
- ❌ `isLoadingRef: true` in debug info
- ✅ Vision analysis completes successfully (popup shows "done")

## Root Causes

1. **Query Timeout**: Query may be hanging/timing out silently
2. **Loading State Not Cleared**: `isLoading` not being set to `false` when query completes
3. **No Fallback**: If query fails, no fallback mechanism
4. **Missing Error Handling**: Errors might be swallowed

## Solutions Implemented

### 1. Added Query Timeout

**File:** `src/components/DocumentsSidebar.tsx`

Added 10-second timeout to prevent infinite hanging:

```typescript
const queryPromise = queryWithFilter;
const timeoutPromise = new Promise((resolve) => 
  setTimeout(() => resolve({ data: null, error: { message: "Query timeout" } }), 10000)
);

const result = await Promise.race([queryPromise, timeoutPromise]);
```

### 2. Added Safety Timeout

Added 15-second safety timeout to force loading state to clear:

```typescript
const safetyTimeout = setTimeout(() => {
  console.warn("[DocumentsSidebar] Safety timeout: Forcing loading state to clear after 15s");
  setIsLoading(false);
  setIsLoadingRef(false);
  setHasCheckedSession(true);
}, 15000);
```

### 3. Improved Fallback Query

Enhanced fallback query to:
- Try without `analysis_target` filter
- Show all jobs if no document-analysis jobs found (for debugging)
- Always fetch analysis results separately

### 4. Guaranteed Loading State Clear

**Critical Fix**: Always clear loading state, even if:
- Query returns 0 results
- Query times out
- Query throws error
- Query never completes

```typescript
// CRITICAL: Always set documents and clear loading, even if empty
setDocuments(docs);
setIsLoading(false);
setIsLoadingRef(false);
setHasCheckedSession(true);
```

### 5. Better Error Logging

Added detailed logging:
- Query start/end times
- Number of documents found
- Number of summaries loaded
- Timeout warnings

## Testing

After these fixes:

1. **Upload a document**
2. **Wait for vision analysis** (popup appears)
3. **Check sidebar** - should show document within 15 seconds max
4. **Check console** - should see:
   - `[DocumentsSidebar] Starting query for userId: ...`
   - `[DocumentsSidebar] Loaded X documents`
   - `[DocumentsSidebar] ✅ Successfully loaded X document(s)`

## Expected Behavior

### If Query Succeeds:
- Documents appear in sidebar
- Summaries display below file size
- Loading spinner disappears
- Console shows success message

### If Query Times Out:
- Safety timeout clears loading state after 15s
- Sidebar shows "No documents yet" (not stuck loading)
- Console shows timeout warning
- User can manually refresh

### If Query Fails:
- Error toast appears
- Loading state clears
- Sidebar shows empty state
- Console shows error details

## Debugging

If sidebar still stuck loading:

1. **Check Console Logs:**
   - Look for `[DocumentsSidebar] Starting query...`
   - Check if query completes or times out
   - Look for error messages

2. **Check Network Tab:**
   - Look for requests to `processing_jobs` table
   - Check if requests complete or hang
   - Check response status codes

3. **Check Database:**
   - Verify document exists in `processing_jobs` table
   - Check `analysis_target` field value
   - Verify `user_id` matches

4. **Manual Refresh:**
   - Click "Refresh" button in sidebar
   - Check if manual refresh works

## Related Issues

- Fixed infinite refresh loop (separate issue)
- Added summary display (separate feature)
- Improved error handling throughout
