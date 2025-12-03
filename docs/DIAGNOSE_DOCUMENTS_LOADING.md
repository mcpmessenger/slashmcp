# Systematic Diagnosis: DocumentsSidebar Loading Issue

## Problem Statement
DocumentsSidebar shows "Loading documents..." spinner indefinitely, even though commit `32cfbc2` was working.

## Diagnostic Checklist

### 1. Component Rendering
- [ ] Is the component mounting? (Check for `[DocumentsSidebar] ===== COMPONENT RENDERED =====` in console)
- [ ] Is `propUserId` being passed? (Check `[DocumentsSidebar] Render props:` log)
- [ ] What is the value of `propUserId`? (Should be a UUID string)

### 2. useEffect Execution
- [ ] Is useEffect running? (Check for `[DocumentsSidebar] ===== useEffect MOUNTED =====`)
- [ ] Is `loadDocuments()` being called? (Check for `[DocumentsSidebar] ===== loadDocuments START =====`)

### 3. Session/User ID Resolution
- [ ] If `propUserId` is provided, does it have a value?
- [ ] Is `getSessionFromStorage()` finding a session token?
- [ ] Is `setSession()` on supabaseClient succeeding or failing?

### 4. Query Execution
- [ ] Is the query being built? (Check for `[DocumentsSidebar] Building query with filters:`)
- [ ] Is the query executing? (Check for `[DocumentsSidebar] Query built, executing...`)
- [ ] Does the query complete? (Check for `[DocumentsSidebar] Query completed in Xms`)
- [ ] Is there a timeout? (Check for `Query timeout triggered after 10 seconds`)

### 5. State Updates
- [ ] Is `setIsLoading(false)` being called?
- [ ] Is `setDocuments()` being called?
- [ ] Are documents being set to an empty array or actual data?

### 6. Error Handling
- [ ] Are there any errors in the catch block?
- [ ] Is `hasError` being set to true?
- [ ] Are error toasts being shown?

## Step-by-Step Debugging

### Step 1: Check Console Logs
Open browser console and look for these logs in order:

1. `[DocumentsSidebar] ===== COMPONENT RENDERED =====`
2. `[DocumentsSidebar] ===== useEffect MOUNTED =====`
3. `[DocumentsSidebar] ===== loadDocuments START =====`
4. `[DocumentsSidebar] Using userId from props: <uuid>` OR `[DocumentsSidebar] Getting session from localStorage...`
5. `[DocumentsSidebar] Querying documents for user: <uuid>`
6. `[DocumentsSidebar] Query completed in Xms`
7. `[DocumentsSidebar] ✅ Successfully loaded X document(s)` OR `[DocumentsSidebar] No documents found`

**Where does it stop?** That's where the problem is.

### Step 2: Check propUserId Value
In Index.tsx, `session?.user?.id` is being passed. Check:
- Is `session` defined?
- Is `session.user` defined?
- Is `session.user.id` a valid UUID?

Add this to Index.tsx temporarily:
```typescript
console.log("[Index] Passing userId to DocumentsSidebar:", session?.user?.id);
```

### Step 3: Check Query Execution
If logs stop at "Querying documents", the query might be hanging. Check:
- Network tab for the Supabase request
- Is the request pending or completed?
- What's the response status?

### Step 4: Check RLS Policies
If query completes but returns empty, check:
- Are RLS policies correctly configured?
- Is `auth.uid()` matching the `user_id` in the database?
- Is the session token valid?

## Current vs Working Version Differences

### Key Differences to Check:
1. **Null reference fixes** - Added `session?.access_token` checks
2. **useEffect dependencies** - Changed from `[]` to `[propUserId]`
3. **deletingJobIds state** - Added this state

### Potential Issues:
1. **useEffect dependency change** - If `propUserId` changes, it might cause re-renders
2. **Null checks** - Might be preventing execution if session is null
3. **State initialization** - `deletingJobIds` shouldn't affect loading, but verify

## Quick Test: Simplify to Working Version

If diagnosis is unclear, try this minimal change:
1. Revert useEffect dependency back to `[]`
2. Remove the null checks temporarily to see if that's blocking
3. Add more aggressive logging at each step

## Next Steps After Diagnosis

Once we identify WHERE it's failing:
- **Before loadDocuments()** → Check component props/rendering
- **In loadDocuments() but before query** → Check session/userId resolution
- **During query** → Check network/RLS/timeout
- **After query but not updating state** → Check state setters
- **State updating but UI not reflecting** → Check React rendering

