# Bug Report: DocumentsSidebar Query Timeout

## Summary
The `DocumentsSidebar` component is unable to query the `processing_jobs` table from Supabase. The query promise is created but never resolves, and no HTTP request is made to the Supabase API. The query consistently times out after 10 seconds.

## Symptoms
- Component shows "Loading documents..." indefinitely
- Console shows: `[DocumentsSidebar] Step 9d: Query timeout triggered after 10 seconds`
- No network request appears in browser DevTools Network tab
- Error toast: "Error loading documents / Query timeout after 10 seconds"

## Environment
- **Framework**: React + Vite
- **Supabase Client**: `@supabase/supabase-js`
- **Browser**: Chrome (latest)
- **Deployment**: Vercel
- **Database**: Supabase PostgreSQL with RLS enabled

## What Works
- `ragService.ts` successfully queries `processing_jobs` using the exact same pattern:
  ```typescript
  const { data, error } = await supabaseClient
    .from("processing_jobs")
    .select("id, status, metadata")
    .eq("user_id", userId)
    .eq("status", "completed")
    .in("analysis_target", ["document-analysis"]);
  ```

## What Doesn't Work
- `DocumentsSidebar.tsx` query times out using the same pattern:
  ```typescript
  const queryPromise = supabaseClient
    .from("processing_jobs")
    .select("id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  
  const result = await Promise.race([queryPromise, timeout]);
  // queryPromise never resolves
  ```

## Attempted Fixes

### 1. RLS Policies and Indexes ✅
- Added RLS policies for `processing_jobs` table
- Added composite indexes for query performance
- **Result**: No change - query still times out

### 2. Session Management
- **Attempt 1**: Added `supabaseClient.auth.setSession()` before query
  - **Result**: `setSession()` itself timed out after 3 seconds
- **Attempt 2**: Removed `setSession()` call entirely
  - **Result**: Query still times out
- **Attempt 3**: Used `getSessionFromStorage()` to read session from localStorage
  - **Result**: Session retrieved successfully, but query still times out

### 3. Query Execution Pattern
- **Attempt 1**: Used `.then()` chain
  - **Result**: Query promise never resolves
- **Attempt 2**: Used direct `await`
  - **Result**: Query promise never resolves
- **Attempt 3**: Wrapped in async IIFE with Promise.race
  - **Result**: Query promise never resolves

### 4. Component Lifecycle
- Added `useEffect` with proper dependencies
- Added loading state management
- Added error handling
- **Result**: Component renders correctly, but query still times out

### 5. Supabase Client Configuration
- Verified `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set
- Verified client is initialized correctly
- **Result**: Client is configured correctly (other queries work)

## Key Observations

1. **The query promise is created** - `typeof query === 'object'` and has `then` method
2. **No HTTP request is made** - Network tab shows no request to `processing_jobs` or `rest/v1/processing_jobs`
3. **Same pattern works elsewhere** - `ragService.ts` uses identical code and works
4. **Session is available** - We can read session from localStorage and it's valid
5. **Component renders** - All React lifecycle hooks execute correctly

## Hypothesis

The Supabase client is waiting for something before executing the HTTP request, but:
- It's not waiting for session (session is available)
- It's not waiting for client initialization (client is initialized)
- It's not a React issue (component lifecycle is correct)

**Possible causes:**
1. **React Strict Mode** causing double renders that cancel the promise
2. **Component unmounting** before query completes (but we see timeout, not cancellation)
3. **Supabase client internal state** - something in the client is blocking execution
4. **Browser extension or network issue** - but other Supabase queries work
5. **RLS policy evaluation** - but the query never reaches the server

## Diagnostic Logs

All logs show:
```
[DocumentsSidebar] Step 8b: Query chain built, checking if it's a promise...
[DocumentsSidebar] Step 8b: Query type: object
[DocumentsSidebar] Step 8b: Has then: true
[DocumentsSidebar] Step 8e: Racing query and timeout...
[DocumentsSidebar] Step 8d: ⚠️ Query timeout after 10 seconds
[DocumentsSidebar] Step 8d: Query promise never resolved - Supabase client not executing HTTP request
```

## Next Steps

1. **Create minimal test component** (`DocumentsSidebarMinimalTest.tsx`) that:
   - Bypasses all React complexity
   - Queries `processing_jobs` directly
   - Logs every step
   - This will determine if it's a React-specific issue

2. **Compare with working code**:
   - `ragService.ts` works - what's different?
   - Check if `ragService.ts` is called from a different context
   - Check if there's a timing issue

3. **Check Supabase client internals**:
   - Is there a queue or batching mechanism?
   - Is there a connection pool issue?
   - Is there a rate limit being hit?

4. **External help**:
   - Post to Supabase Discord/Forum
   - Create GitHub issue with minimal reproduction
   - Consider Stack Overflow with bounty

## Files Involved

- `src/components/DocumentsSidebar.tsx` - Main component (failing)
- `src/lib/ragService.ts` - Working example
- `src/lib/supabaseClient.ts` - Supabase client configuration
- `src/pages/Index.tsx` - Parent component
- `supabase/migrations/20251203012909_fix_processing_jobs_rls.sql` - RLS policies
- `supabase/migrations/20251203012910_add_processing_jobs_indexes.sql` - Indexes

## Reproduction Steps

1. Deploy to Vercel
2. Open application in browser
3. Sign in with Google OAuth
4. Navigate to main page
5. Observe "Documents & Knowledge" sidebar
6. Check browser console for timeout errors
7. Check Network tab - no request to `processing_jobs`

## Expected Behavior

The sidebar should:
1. Query `processing_jobs` table
2. Display list of uploaded documents
3. Show document status (completed, processing, failed)

## Actual Behavior

The sidebar:
1. Shows "Loading documents..." indefinitely
2. Times out after 10 seconds
3. Shows error toast
4. Never makes HTTP request to Supabase

