# 🐛 Bug Bounty: Document Upload Flow - Documents Not Appearing in Sidebar

**Status**: 🔴 **CRITICAL BLOCKER**  
**Priority**: P0 - Core Functionality Broken  
**Bounty**: High Priority Fix  
**Created**: December 3, 2025

---

## Executive Summary

Users can upload documents through the chat interface, and files are successfully registered in the database and processed by the backend. However, **uploaded documents do not appear in the "Documents & Knowledge" sidebar**, making them inaccessible to users despite being in the system.

**Impact**: Users cannot see or access their uploaded documents, breaking a core feature of the application.

---

## Problem Statement

### Current Behavior
1. ✅ User uploads file via chat interface
2. ✅ File is registered in `processing_jobs` table
3. ✅ File is uploaded to S3 storage
4. ✅ Backend processing begins (Textract worker)
5. ❌ **Document does NOT appear in "Documents & Knowledge" sidebar**
6. ❌ User cannot see their uploaded documents
7. ❌ Documents are not accessible for RAG queries

### Expected Behavior
1. User uploads file via chat interface
2. File is registered and uploaded (same as above)
3. **Document immediately appears in "Documents & Knowledge" sidebar**
4. Document shows with correct status (queued, processing, completed, failed)
5. User can click document to view details
6. Document is available for RAG queries once processed

---

## Technical Architecture

### Upload Flow (Working)
```
User selects file
  ↓
ChatInput component calls registerUploadJob()
  ↓
Edge Function: /uploads creates processing_jobs record
  ↓
File uploaded to S3 via presigned URL
  ↓
Textract worker triggered (async)
  ↓
Processing begins
```

### Display Flow (Broken)
```
DocumentsSidebar component mounts
  ↓
Queries processing_jobs table
  ↓
❌ Query hangs/times out OR returns empty results
  ↓
Sidebar shows "Loading documents..." indefinitely
  ↓
Documents never appear
```

---

## Root Cause Analysis

### Primary Issue: DocumentsSidebar Query Timeout

The `DocumentsSidebar` component is unable to query the `processing_jobs` table. Multiple attempts have been made to fix this:

#### Attempted Fixes (All Failed)

1. **RLS Policies & Indexes** ✅
   - Added proper RLS policies for `processing_jobs`
   - Added composite indexes for performance
   - **Result**: No change - query still times out

2. **Session Management**
   - Tried `setSession()` - **hangs indefinitely**
   - Tried `getSession()` - **hangs indefinitely**
   - Tried localStorage session retrieval - works but query still times out
   - **Result**: Session retrieval works, but query doesn't execute

3. **Query Execution Pattern**
   - Tried `.then()` chain - promise never resolves
   - Tried direct `await` - promise never resolves
   - Tried `Promise.race` with timeout - timeout wins, query never executes
   - **Result**: Query promise is created but HTTP request never made

4. **Client Initialization**
   - Tried `onAuthStateChange` listener for `INITIAL_SESSION` event
   - Tried fallback timeouts
   - **Result**: Still hanging

### Critical Finding

**The exact same query pattern WORKS in `ragService.ts`**:
```typescript
// This WORKS ✅
export async function getQueryableDocumentJobs(userId?: string): Promise<string[]> {
  if (!userId) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    userId = session?.user?.id;
  }
  
  const { data, error } = await supabaseClient
    .from("processing_jobs")
    .select("id, status, metadata")
    .eq("user_id", userId)
    .eq("status", "completed")
    .in("analysis_target", ["document-analysis"]);
  
  return data?.map(job => job.id) || [];
}
```

**But FAILS in `DocumentsSidebar.tsx`** using identical code:
```typescript
// This FAILS ❌
const { data, error } = await supabaseClient
  .from("processing_jobs")
  .select("id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target")
  .eq("user_id", userId)
  .order("created_at", { ascending: false })
  .limit(50);
// Query promise created but never executes HTTP request
```

### Key Differences

| Aspect | ragService.ts (Works) | DocumentsSidebar.tsx (Fails) |
|--------|----------------------|------------------------------|
| **Context** | Called from user action (button click) | Called from React component mount |
| **Timing** | User-initiated (client has time to initialize) | Component mount (race condition) |
| **getSession()** | Works fine | Hangs indefinitely |
| **Query execution** | HTTP request made immediately | HTTP request never made |

---

## Environment Details

- **Framework**: React 18 + Vite 5.4.19
- **Supabase Client**: `@supabase/supabase-js` (latest)
- **Browser**: Chrome (latest)
- **Deployment**: Vercel
- **Database**: Supabase PostgreSQL with RLS enabled
- **Node Version**: Latest LTS

### Supabase Configuration
```typescript
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

---

## Reproduction Steps

1. Deploy application to Vercel
2. Sign in with Google OAuth
3. Navigate to main page
4. Upload a document via chat interface (drag & drop or click to upload)
5. Observe:
   - ✅ File uploads successfully (check Network tab)
   - ✅ `processing_jobs` record created (check Supabase dashboard)
   - ❌ "Documents & Knowledge" sidebar shows "Loading documents..." indefinitely
   - ❌ Document never appears in sidebar

### Verification

**Check Supabase Dashboard**:
```sql
SELECT id, file_name, user_id, status, created_at 
FROM processing_jobs 
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC;
```
Documents exist in database ✅

**Check Browser Console**:
- Look for `[DocumentsSidebar]` logs
- Check for timeout errors
- Check Network tab for requests to `processing_jobs` (should be none)

**Check Network Tab**:
- No HTTP request to `rest/v1/processing_jobs` is made
- Query promise is created but never executes

---

## Files Involved

### Core Files
- `src/components/DocumentsSidebar.tsx` - Main component (failing)
- `src/lib/ragService.ts` - Working example (line 188-220)
- `src/lib/supabaseClient.ts` - Supabase client configuration
- `src/pages/Index.tsx` - Parent component
- `src/components/ui/chat-input.tsx` - File upload handler

### Database
- `supabase/migrations/20251203012909_fix_processing_jobs_rls.sql` - RLS policies
- `supabase/migrations/20251203012910_add_processing_jobs_indexes.sql` - Indexes

### Edge Functions
- `supabase/functions/uploads/index.ts` - File upload handler
- `supabase/functions/textract-worker/index.ts` - Document processing

---

## Diagnostic Information

### Console Logs (Current State)
```
[DocumentsSidebar] Setting up auth state listener...
[DocumentsSidebar] ⏳ Waiting for client to be ready...
[DocumentsSidebar] Dependencies: { propUserId: "...", refreshTrigger: 0, isClientReady: false }
```

### Network Tab
- **No requests** to `processing_jobs` or `rest/v1/processing_jobs`
- Query promise is created but HTTP request never made

### Database State
- Documents exist in `processing_jobs` table
- RLS policies are correct
- Indexes are present
- User has proper permissions

---

## Hypotheses & Potential Solutions

### Hypothesis 1: React Component Lifecycle Race Condition
**Theory**: The Supabase client isn't fully initialized when the component mounts, causing queries to hang.

**Potential Solutions**:
1. ✅ **Use `onAuthStateChange` listener** - Wait for `INITIAL_SESSION` event (attempted, still failing)
2. **Move query to user interaction** - Only query when user clicks "Refresh" button
3. **Use React Query/SWR** - Let a data fetching library handle the complexity
4. **Delay query execution** - Use `setTimeout` to delay query by 500ms-1s after mount

### Hypothesis 2: Supabase Client Internal State Issue
**Theory**: The client is waiting for something (session validation, token refresh) that never completes in component context.

**Potential Solutions**:
1. **Create new client instance** - Use a fresh client instance for this component
2. **Manually set headers** - Bypass client and use direct fetch with auth headers
3. **Check client internals** - Inspect client state before querying

### Hypothesis 3: React Strict Mode Double Render
**Theory**: React Strict Mode causes double renders that cancel the query promise.

**Potential Solutions**:
1. **Disable Strict Mode** - Test if this is the issue
2. **Use `useRef` to track execution** - Prevent double execution
3. **Move to `useLayoutEffect`** - Execute before paint

### Hypothesis 4: Browser/Network Issue
**Theory**: Something in the browser environment is blocking the request.

**Potential Solutions**:
1. **Test in different browser** - Rule out browser-specific issue
2. **Check CORS/Network policies** - Verify no blocking
3. **Test with direct fetch** - Bypass Supabase client entirely

### Hypothesis 5: Component Unmounting
**Theory**: Component unmounts before query completes, canceling the promise.

**Potential Solutions**:
1. **Check component lifecycle** - Verify component stays mounted
2. **Use cleanup flags** - Prevent state updates after unmount
3. **Move query outside component** - Use a service/hook

---

## Success Criteria

The fix is considered successful when:

1. ✅ Documents appear in "Documents & Knowledge" sidebar after upload
2. ✅ Documents show correct status (queued, processing, completed, failed)
3. ✅ Sidebar loads within 2 seconds of component mount
4. ✅ No console errors or warnings
5. ✅ Network tab shows successful HTTP request to `processing_jobs`
6. ✅ Documents persist after page refresh
7. ✅ Delete functionality works (bonus)

---

## Testing Checklist

- [ ] Upload PDF document → appears in sidebar
- [ ] Upload image file → appears in sidebar
- [ ] Upload CSV file → appears in sidebar
- [ ] Multiple files → all appear in sidebar
- [ ] Page refresh → documents still visible
- [ ] Sign out and sign in → documents still visible
- [ ] Delete document → removed from sidebar
- [ ] Status updates → status changes reflected in sidebar
- [ ] No console errors
- [ ] No network errors
- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari

---

## Code References

### Working Example (ragService.ts)
```typescript:188:220:src/lib/ragService.ts
export async function getQueryableDocumentJobs(userId?: string): Promise<string[]> {
  if (!userId) {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    userId = session?.user?.id;
  }

  if (!userId) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from("processing_jobs")
    .select("id, status, metadata")
    .eq("user_id", userId)
    .eq("status", "completed")
    .in("analysis_target", ["document-analysis"]);

  if (error) {
    console.error("Error fetching queryable jobs:", error);
    return [];
  }

  // Filter for jobs that have been extracted or indexed
  return (data || [])
    .filter((job) => {
      const metadata = job.metadata as Record<string, unknown> | null;
      const stage = metadata?.job_stage as string | undefined;
      return stage === "extracted" || stage === "injected" || stage === "indexed";
    })
    .map((job) => job.id);
}
```

### Failing Component (DocumentsSidebar.tsx)
```typescript:160:190:src/components/DocumentsSidebar.tsx
// CRITICAL FIX: Client should be ready at this point (checked by onAuthStateChange)
setHasCheckedSession(true);

// Execute query directly - matching ragService.ts pattern exactly
let data, error;
try {
  const { data: queryData, error: queryError } = await supabaseClient
    .from("processing_jobs")
    .select("id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  
  data = queryData;
  error = queryError;
  
  if (error) {
    console.error("[DocumentsSidebar] Query error:", error);
  } else {
    console.log(`[DocumentsSidebar] Loaded ${data?.length || 0} documents`);
  }
} catch (queryError) {
  console.error("[DocumentsSidebar] Query exception:", queryError);
  error = { message: queryError instanceof Error ? queryError.message : String(queryError) };
  data = null;
}
```

---

## Bounty Structure

### Primary Fix (Highest Priority)
**Reward**: Recognition + Priority Support

Fix the `DocumentsSidebar` query timeout issue so documents appear after upload.

**Requirements**:
- Documents appear in sidebar within 2 seconds of upload
- No console errors
- Works consistently across browsers
- Code is clean and maintainable

### Bonus Fixes
1. **Delete functionality** - Ensure delete button works correctly
2. **Status updates** - Real-time status updates without refresh
3. **Error handling** - Graceful error messages for users
4. **Performance** - Optimize query performance

---

## Submission Guidelines

### What to Include

1. **Root Cause Analysis**
   - Explain why the query hangs
   - Explain why `ragService.ts` works but `DocumentsSidebar.tsx` doesn't
   - Provide evidence (logs, network traces, etc.)

2. **Solution**
   - Code changes with explanations
   - Why this solution works
   - How it differs from attempted fixes

3. **Testing**
   - Test results for all scenarios
   - Before/after screenshots
   - Console logs showing success

4. **Documentation**
   - Updated code comments
   - Any necessary documentation changes

### Submission Format

- **GitHub Issue**: Create issue with `[BUG BOUNTY]` prefix
- **Pull Request**: Include detailed description
- **Documentation**: Update relevant docs

---

## Additional Context

### Related Issues
- Documents upload successfully but don't appear in sidebar
- Sidebar shows "Loading documents..." indefinitely
- Query timeout after 10 seconds (when timeout is implemented)
- No network request to `processing_jobs` is made

### Previous Attempts
See `docs/BUG_REPORT_DOCUMENTS_SIDEBAR_TIMEOUT.md` for complete history of attempted fixes.

### Working Code Reference
See `src/lib/ragService.ts:188-220` for a working example of the same query pattern.

---

## Contact & Support

- **Repository**: https://github.com/mcpmessenger/slashmcp
- **Documentation**: See `docs/` folder for related docs
- **Supabase Project**: akxdroedpsvmckvqvggr

---

## Success Metrics

After fix is deployed:
- ✅ 100% of uploaded documents appear in sidebar
- ✅ Average load time < 2 seconds
- ✅ Zero query timeouts
- ✅ Zero console errors
- ✅ User satisfaction with document visibility

---

**Last Updated**: December 3, 2025  
**Status**: Open for Bounty Hunters 🎯

