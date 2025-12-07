# Fix: Infinite Refresh Loop in DocumentsSidebar

## Problem

The DocumentsSidebar was stuck in an infinite refresh loop, causing:
- Hundreds of refresh triggers (384 → 760+)
- Sidebar stuck in loading state (`isLoading: true`)
- Documents never loading
- Performance degradation
- Console spam

## Root Causes

1. **No Debouncing**: Every `onJobsChange` callback triggered a refresh immediately
2. **No Change Detection**: Refreshes triggered even when jobs didn't actually change
3. **Duplicate Refresh Handling**: Same refresh trigger could cause multiple refreshes
4. **Conditional Rendering**: Sidebar only showed when `documentCount > 0`, but count never updated if query failed

## Solutions Implemented

### 1. Added Debouncing to Refresh Triggers

**File:** `src/pages/Index.tsx`

- Added `refreshTimeoutRef` to track pending refreshes
- Clear any pending refresh before setting a new one
- 2-second delay to allow database operations to complete

```typescript
const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// In onJobsChange:
if (refreshTimeoutRef.current) {
  clearTimeout(refreshTimeoutRef.current);
}
refreshTimeoutRef.current = setTimeout(() => {
  setDocumentsSidebarRefreshTrigger(prev => prev + 1);
  refreshTimeoutRef.current = null;
}, 2000);
```

### 2. Added Change Detection

Only trigger refresh when jobs actually change:

```typescript
const previousJobIds = uploadJobs.map(j => j.id).sort().join(',');
const currentJobIds = jobs.map(j => j.id).sort().join(',');
const jobsChanged = previousJobIds !== currentJobIds;

if (jobs.length > 0 && jobsChanged) {
  // Trigger refresh
}
```

### 3. Prevented Duplicate Refreshes

**File:** `src/components/DocumentsSidebar.tsx`

- Track last refresh trigger to prevent processing the same trigger twice
- Added cleanup for timeout on unmount

```typescript
const lastRefreshTriggerRef = useRef<number>(0);

useEffect(() => {
  if (refreshTrigger && refreshTrigger > 0 && propUserId && 
      refreshTrigger !== lastRefreshTriggerRef.current) {
    lastRefreshTriggerRef.current = refreshTrigger;
    // ... refresh logic
  }
}, [refreshTrigger, propUserId]);
```

### 4. Always Show Sidebar When Authenticated

**File:** `src/pages/Index.tsx`

Changed from conditional rendering to always showing (like logs panel):

**Before:**
```typescript
{documentCount > 0 && (
  <ResizablePanel>...</ResizablePanel>
)}
{documentCount === 0 && (
  <div className="hidden">...</div>
)}
```

**After:**
```typescript
{(session || guestMode) && (
  <ResizablePanel>...</ResizablePanel>
)}
```

This ensures:
- Sidebar is visible even while loading
- Users can see loading state
- Documents appear immediately when loaded
- Consistent with logs panel behavior

## Testing

After these fixes:
1. ✅ No infinite refresh loops
2. ✅ Sidebar appears immediately when authenticated
3. ✅ Documents load successfully
4. ✅ Refresh only triggers when jobs actually change
5. ✅ Debouncing prevents excessive refreshes

## Performance Impact

- **Before**: 100+ refresh triggers per second
- **After**: 1 refresh per actual job change (debounced)

## Related Issues

- Fixed type error: Removed invalid `job.stage === "unknown"` comparison
- Added proper cleanup for timeouts
- Improved error handling in refresh logic
