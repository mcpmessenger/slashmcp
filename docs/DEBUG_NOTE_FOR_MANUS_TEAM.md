# Debug Note: DocumentsSidebar Query Timeout Issue

**Date**: December 3, 2025  
**Component**: `src/components/DocumentsSidebar.tsx`  
**Status**: 🔴 **BLOCKING** - Component stuck in loading state

## Problem Summary

The `DocumentsSidebar` component is unable to query the `processing_jobs` table from Supabase. The component gets stuck in a loading state (`isLoadingRef: true`, `hasCheckedSession: false`), and no HTTP request is made to Supabase.

## Key Symptom

- Component shows "Loading documents..." indefinitely
- `hasCheckedSession: false` in debug panel
- No network request to `processing_jobs` appears in browser DevTools
- Console shows no errors (after cleanup) - just hangs silently

## Critical Finding

**The same query pattern works in `src/lib/ragService.ts`**:
```typescript
// This WORKS in ragService.ts
const { data, error } = await supabaseClient
  .from("processing_jobs")
  .select("id, status, metadata")
  .eq("user_id", userId)
  .in("analysis_target", ["document-analysis"]);
```

**But fails in `DocumentsSidebar.tsx`** using the exact same pattern.

## What We've Tried

1. ✅ **RLS Policies & Indexes** - Added proper RLS policies and composite indexes
2. ✅ **Session Management** - Tried `setSession()`, `getSession()`, localStorage retrieval
3. ❌ **`getSession()` call** - **Hangs indefinitely** (even with timeout)
4. ❌ **Direct query** - Query promise created but never executes HTTP request
5. ✅ **Minimal test component** - Same issue occurs, proving it's NOT React-specific

## Current Code State

The component currently:
- Gets `userId` from props (bypasses session retrieval)
- Tries to access `supabaseClient.auth` property (to "wake up" client)
- Skips `getSession()` call (because it hangs)
- Executes query directly (matching `ragService.ts` pattern)

**But it still hangs.**

## Hypothesis

The Supabase client is not initializing properly in the React component context. Possible causes:

1. **React Strict Mode** - Double renders causing client state issues
2. **Component lifecycle** - Client not ready when `useEffect` runs
3. **Session initialization** - Client waiting for session that never loads
4. **Browser environment** - Something specific to the browser/client setup

## What Works vs What Doesn't

| Context | Query Pattern | Result |
|---------|--------------|--------|
| `ragService.ts` (called from user action) | Direct query with `getSession()` | ✅ Works |
| `DocumentsSidebar.tsx` (component mount) | Direct query without `getSession()` | ❌ Hangs |
| `DocumentsSidebar.tsx` (component mount) | Direct query with `getSession()` | ❌ Hangs (getSession hangs) |

## Next Steps for Debugging Team

1. **Check if query executes when called from different context**:
   - Try calling the query from a button click handler
   - Try calling it from `useChat` hook instead of `DocumentsSidebar`

2. **Investigate Supabase client initialization**:
   - Check if client is fully initialized when component mounts
   - Verify `persistSession: true` is working correctly
   - Check if there's a race condition with session loading

3. **Compare execution contexts**:
   - Why does `ragService.ts` work but `DocumentsSidebar.tsx` doesn't?
   - What's different about when/how they're called?

4. **Check React-specific issues**:
   - Is React Strict Mode causing double renders?
   - Is the component unmounting before query completes?
   - Are there any React hooks interfering?

5. **Alternative approaches**:
   - Try using `useQuery` hook from a React Query library
   - Try moving query to a custom hook
   - Try using `useEffect` with different dependencies
   - Try calling query on user interaction instead of mount

## Files to Review

- `src/components/DocumentsSidebar.tsx` - Main component (failing)
- `src/lib/ragService.ts` - Working example (line 188-220)
- `src/lib/supabaseClient.ts` - Client configuration
- `src/pages/Index.tsx` - Parent component that renders DocumentsSidebar

## Quick Test

To verify the issue, try this in browser console:
```javascript
// This should work (matches ragService.ts)
const { data, error } = await window.supabase
  .from("processing_jobs")
  .select("id, file_name, status")
  .eq("user_id", "YOUR_USER_ID")
  .limit(10);

console.log("Query result:", { data, error });
```

If this works in console but not in component, it confirms a React/component lifecycle issue.

## Environment

- **Framework**: React + Vite
- **Supabase Client**: `@supabase/supabase-js`
- **Browser**: Chrome (latest)
- **Deployment**: Vercel
- **Database**: Supabase PostgreSQL with RLS enabled

---

**Contact**: See commit history for detailed debugging attempts and code changes.

