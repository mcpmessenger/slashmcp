# Current Upgrade Challenges - Documents & Knowledge Integration

**Last Updated:** December 3, 2025  
**Status:** 🔴 Active Issues  
**Priority:** P0 - Critical

---

## 🎯 Executive Summary

The Documents & Knowledge sidebar integration is experiencing critical issues preventing document loading and display. The primary blocker is a persistent database query timeout that prevents users from seeing their uploaded documents.

---

## 🔴 Critical Issues

### Issue #1: Database Query Timeout (P0)

**Status:** 🔴 **ACTIVE**  
**Severity:** Critical - Blocks core functionality  
**Impact:** 100% of users cannot see uploaded documents

#### Symptoms
- Documents sidebar shows "No documents yet" even when documents exist
- Console shows repeated errors: `Query timeout after 10 seconds`
- Query to `processing_jobs` table times out consistently
- Error loops until component stops polling (recently fixed)

#### Technical Details
- **Query:** `SELECT * FROM processing_jobs WHERE user_id = ? AND analysis_target = 'document-analysis'`
- **Timeout:** 10 seconds (recently reduced from 15s)
- **Location:** `src/components/DocumentsSidebar.tsx` → `loadDocuments()`
- **Error Pattern:** Query never completes, Promise.race timeout resolves first

#### Root Cause Hypotheses
1. **RLS Policies Blocking Query (60% probability)**
   - Row Level Security policies may be preventing the query
   - Session token might not be properly authenticated
   - Need to verify RLS policies on `processing_jobs` table

2. **Session Authentication Issue (30% probability)**
   - Session retrieved from localStorage may be expired/invalid
   - `supabaseClient.auth.setSession()` may be failing silently
   - Session verification added but query still times out

3. **Database Performance Issue (10% probability)**
   - Query might be slow due to missing indexes
   - Large dataset causing timeout
   - Network latency to Supabase

#### Attempted Fixes
- ✅ Added session verification before querying
- ✅ Set session on `supabaseClient` explicitly
- ✅ Added timeout to prevent infinite hanging
- ✅ Prevented concurrent loads with `isLoadingRef` flag
- ✅ Stopped polling on errors to prevent error loops
- ❌ Query still times out

#### Next Steps
1. **Check RLS Policies** (Priority 1)
   ```sql
   -- Run in Supabase SQL Editor
   SELECT * FROM pg_policies WHERE tablename = 'processing_jobs';
   ```
   - Verify policies allow authenticated users to SELECT their own rows
   - Check if `auth.uid()` matches `user_id` column

2. **Verify Session Token Validity** (Priority 2)
   - Check if session token from localStorage is expired
   - Verify `supabaseClient.auth.setSession()` actually sets the session
   - Test with fresh login to get new token

3. **Test Query Directly** (Priority 3)
   - Run query directly in Supabase SQL Editor with user's ID
   - Check query performance/execution time
   - Verify data exists for the user

4. **Check Database Indexes** (Priority 4)
   - Verify indexes exist on `user_id` and `analysis_target`
   - Check query execution plan

---

### Issue #2: Textract Worker Failure (P1)

**Status:** 🟡 **PARTIALLY RESOLVED**  
**Severity:** High - Documents don't process past "uploaded" stage  
**Impact:** Documents stuck in "queued" or "uploaded" status

#### Symptoms
- Documents upload successfully to S3
- Job status shows "queued" or "uploaded"
- Documents never progress to "processing" or "completed"
- Network tab shows `textract-worker` request failing
- Console shows: `Failed to trigger Textract job: TypeError: Failed to fetch`

#### Technical Details
- **Function:** `src/lib/api.ts` → `triggerTextractJob()`
- **Endpoint:** `/functions/v1/textract-worker`
- **Error:** Network/CORS error, request never completes
- **Timeout:** 30 seconds

#### Root Cause Hypotheses
1. **CORS Issue (50% probability)**
   - Edge Function CORS headers may be incorrect
   - Preflight OPTIONS request may be failing
   - Check `supabase/functions/textract-worker/index.ts` CORS config

2. **Function Not Deployed (30% probability)**
   - `textract-worker` function may not be deployed
   - Check Supabase Dashboard → Edge Functions

3. **Network/Firewall Blocking (20% probability)**
   - Browser extension blocking request
   - Network firewall blocking Supabase

#### Attempted Fixes
- ✅ Added better error handling for network errors
- ✅ Added specific TypeError handling
- ✅ Improved error messages
- ❌ Still failing with "Failed to fetch"

#### Next Steps
1. **Check CORS Headers** (Priority 1)
   - Verify `textract-worker` function has correct CORS headers
   - Test OPTIONS request manually

2. **Verify Function Deployment** (Priority 2)
   - Check Supabase Dashboard → Edge Functions → `textract-worker`
   - Verify function is deployed and active

3. **Test in Incognito** (Priority 3)
   - Rule out browser extension blocking
   - Test network request in clean environment

---

### Issue #3: Orchestrator Not Using RAG Tools (P2)

**Status:** 🟡 **PARTIALLY RESOLVED**  
**Severity:** Medium - Poor user experience  
**Impact:** Users asking about documents get web search instead of document search

#### Symptoms
- User asks: "What can you tell me about the document?"
- Orchestrator responds: "I can't analyze documents directly"
- Orchestrator performs web search instead
- `search_documents` tool is available but not being used

#### Technical Details
- **Location:** `supabase/functions/_shared/orchestration/agents.ts`
- **Issue:** Query classification not detecting document queries
- **Tools Available:** `search_documents`, `list_documents`, `get_document_status`

#### Root Cause
- Query classifier not robust enough
- Orchestrator instructions not strong enough
- Document context not being injected properly

#### Attempted Fixes
- ✅ Enhanced `QueryClassifier` with better keyword detection
- ✅ Added document context injection
- ✅ Strengthened orchestrator instructions
- ✅ Added plural form detection ("documents" vs "document")
- 🟡 Still needs testing

#### Next Steps
1. **Test Query Classification** (Priority 1)
   - Test various document query phrasings
   - Verify classifier detects document intent

2. **Verify Context Injection** (Priority 2)
   - Check if document context is being injected into conversation
   - Verify orchestrator receives context

3. **Improve Instructions** (Priority 3)
   - Strengthen orchestrator instructions for document queries
   - Add more examples of document-related queries

---

## 🟡 Known Issues

### Issue #4: getSession() Timeout (P2)

**Status:** 🟢 **RESOLVED**  
**Severity:** Medium - Causes delays but has workaround  
**Impact:** Slow initial load, but localStorage fallback works

#### Resolution
- ✅ Implemented localStorage-first approach
- ✅ Removed `getSession()` fallback in DocumentsSidebar
- ✅ Added timeout to prevent hanging
- ✅ Fallback to anon key if session fails

---

## 📋 Testing Checklist

### Documents Sidebar
- [ ] Documents load without timeout
- [ ] Empty state shows when no documents
- [ ] Error doesn't loop (polling stops on error)
- [ ] Refresh button works
- [ ] Delete functionality works

### Document Processing
- [ ] Upload completes successfully
- [ ] Job status progresses: queued → uploaded → processing → completed
- [ ] Textract worker triggers successfully
- [ ] Documents become searchable after processing

### Orchestrator Integration
- [ ] Document queries use `search_documents` tool
- [ ] Web queries use web search
- [ ] Context is injected correctly
- [ ] Query classification works for various phrasings

---

## 🔧 Debugging Guide

**📖 For detailed step-by-step debugging instructions, see:** [`docs/DEBUGGING_GUIDE.md`](./DEBUGGING_GUIDE.md)

This guide provides:
- Prioritized debugging steps for each issue
- SQL queries to check RLS policies and indexes
- CORS troubleshooting for Edge Functions
- Testing procedures and expected outcomes

---

## 🔧 Debugging Commands

### Check RLS Policies
```sql
-- Run in Supabase SQL Editor
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'processing_jobs';
```

### Test Query Directly
```sql
-- Replace USER_ID with actual user ID from auth.users
SELECT 
  id, 
  file_name, 
  status, 
  metadata->>'job_stage' as stage,
  created_at
FROM processing_jobs
WHERE user_id = 'USER_ID'
  AND analysis_target = 'document-analysis'
ORDER BY created_at DESC
LIMIT 50;
```

### Check Session in Browser Console
```javascript
// Check if session is set
const { data } = await window.supabase.auth.getSession();
console.log('Session:', data.session);

// Check localStorage
Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('auth'));
```

---

## 📊 Status Summary

| Issue | Status | Priority | Impact |
|-------|--------|----------|--------|
| Database Query Timeout | 🔴 Active | P0 | Critical |
| Textract Worker Failure | 🟡 Partial | P1 | High |
| Orchestrator RAG Routing | 🟡 Partial | P2 | Medium |
| getSession() Timeout | 🟢 Resolved | P2 | Low |

---

## 🎯 Immediate Next Steps

1. **Investigate RLS Policies** (2 hours)
   - Check if policies exist and are correct
   - Test query with service role key (bypass RLS)
   - Fix policies if needed

2. **Verify Session Authentication** (1 hour)
   - Test with fresh login
   - Verify session token is valid
   - Check if `setSession()` actually works

3. **Fix Textract Worker CORS** (1 hour)
   - Verify CORS headers
   - Test OPTIONS request
   - Fix if needed

4. **Test Orchestrator Integration** (2 hours)
   - Test various document query phrasings
   - Verify tool selection
   - Improve if needed

---

## 📝 Notes for Contributors

### Architecture Overview
- **Frontend:** React/TypeScript, uses Supabase JS client
- **Backend:** Supabase Edge Functions (Deno/TypeScript)
- **Database:** PostgreSQL with pgvector extension
- **Storage:** AWS S3 for raw files
- **RAG:** Semantic search using OpenAI embeddings

### Key Files
- `src/components/DocumentsSidebar.tsx` - Document list UI
- `src/lib/api.ts` - API client for Edge Functions
- `supabase/functions/uploads/index.ts` - Upload handler
- `supabase/functions/textract-worker/index.ts` - Document processor
- `supabase/functions/_shared/orchestration/` - Orchestrator logic

### Common Pitfalls
1. **Session Management:** Always check localStorage first, avoid `getSession()` if possible
2. **RLS Policies:** Queries may fail silently if RLS blocks them
3. **CORS:** Edge Functions must return proper CORS headers
4. **Timeouts:** Always add timeouts to prevent hanging
5. **Error Loops:** Stop polling/retrying on persistent errors

---

*This document should be updated as issues are resolved or new issues are discovered.*

