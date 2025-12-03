# Systematic Debugging Plan: DocumentsSidebar Not Loading

## Problem Statement
- Sidebar shows "Loading documents..." spinner
- No console logs from DocumentsSidebar component
- Files are uploaded (visible in MCP Event Log) but not appearing in sidebar

## Flow Analysis

### Expected Flow:
1. **Component Mounts** → `useEffect` runs → `loadDocuments()` called
2. **Get Session** → From localStorage → Set on supabaseClient
3. **Query Database** → `processing_jobs` table with `user_id` and `analysis_target` filters
4. **Display Results** → Show documents in sidebar

### Current Issues:
- Component renders (shows loading spinner)
- But no logs = `loadDocuments()` may not be executing OR failing silently
- Query may be timing out or returning empty

## Systematic Debugging Steps

### Step 1: Verify Component is Actually Rendering
- [ ] Check if `[DocumentsSidebar] ===== COMPONENT RENDERED =====` appears in console
- [ ] If NO → Component isn't mounting (check conditional rendering)
- [ ] If YES → Component is rendering, move to Step 2

### Step 2: Verify useEffect is Running
- [ ] Check if `[DocumentsSidebar] ===== useEffect MOUNTED =====` appears
- [ ] If NO → useEffect dependency issue or component unmounting immediately
- [ ] If YES → Move to Step 3

### Step 3: Verify Session Exists
- [ ] Check browser localStorage for Supabase session
- [ ] Run in console: `Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('auth'))`
- [ ] Check if session exists and is valid
- [ ] If NO → User not logged in (expected behavior)
- [ ] If YES → Move to Step 4

### Step 4: Test Query Directly
- [ ] Open browser console
- [ ] Run: `await window.supabase.from('processing_jobs').select('*').eq('user_id', 'USER_ID').limit(5)`
- [ ] Replace USER_ID with actual user ID from session
- [ ] Check if query returns data
- [ ] If NO → RLS policies blocking or no data exists
- [ ] If YES → Query works, issue is in component logic

### Step 5: Check Database Directly
- [ ] Go to Supabase Dashboard → SQL Editor
- [ ] Run: `SELECT * FROM processing_jobs WHERE user_id = 'USER_ID' LIMIT 10;`
- [ ] Replace USER_ID with actual user ID
- [ ] Check if data exists
- [ ] Check `analysis_target` values
- [ ] If NO data → Files aren't being saved to database
- [ ] If data exists → Issue is in query/component

### Step 6: Simplify Component
- [ ] Create minimal version that just queries and logs
- [ ] Remove all complex logic
- [ ] Test if basic query works
- [ ] Gradually add back features

### Step 7: Rebuild from Scratch (if needed)
- [ ] Create new simplified DocumentsSidebar component
- [ ] Use Supabase client directly (no custom session handling)
- [ ] Simple query, simple display
- [ ] Test incrementally

## Quick Test Script

Run this in browser console to test the query directly:

```javascript
// Get session
const session = await window.supabase.auth.getSession();
console.log('Session:', session.data.session?.user?.id);

// Test query
if (session.data.session?.user?.id) {
  const result = await window.supabase
    .from('processing_jobs')
    .select('*')
    .eq('user_id', session.data.session.user.id)
    .limit(10);
  console.log('Query result:', result);
}
```

## Common Issues & Solutions

### Issue 1: No Console Logs
**Possible Causes:**
- Component not mounting
- useEffect not running
- Logs being filtered out

**Solution:** Add console.log at very top of component (outside useEffect)

### Issue 2: Query Timeout
**Possible Causes:**
- RLS policies blocking
- Session not set correctly
- Database performance issue

**Solution:** Test query directly in console, check RLS policies

### Issue 3: Empty Results
**Possible Causes:**
- Wrong `analysis_target` filter
- Wrong `user_id`
- Data doesn't exist

**Solution:** Remove filters, check database directly

### Issue 4: Component Stuck Loading
**Possible Causes:**
- `setIsLoading(false)` never called
- Error in loadDocuments() not caught
- Promise never resolves

**Solution:** Add try/catch, ensure loading state always cleared

