# Implementation Plan: Fix Documents & Knowledge Integration Issues

**Created:** December 3, 2025  
**Based on:** [`DEBUGGING_GUIDE.md`](./DEBUGGING_GUIDE.md)  
**Status:** 📋 Ready for Implementation

---

## 🎯 Overview

This plan implements the fixes outlined in the debugging guide to resolve:
- **P0:** Database Query Timeout (RLS policies and indexes)
- **P1:** Textract Worker Failure (CORS configuration)
- **P2:** Orchestrator RAG Routing (prompt engineering)

**Estimated Time:** 4-6 hours  
**Priority Order:** P0 → P1 → P2

---

## Phase 1: P0 - Database Query Timeout (Critical)

### Task 1.1: Verify and Fix RLS Policies

**Time Estimate:** 1-2 hours  
**Priority:** P0 - Critical  
**Files:** `supabase/migrations/` (new migration)

#### Steps

1. **Check Current RLS Status**
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

2. **Check if RLS is Enabled**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'processing_jobs';
   ```

3. **Create Migration File**
   - Create: `supabase/migrations/YYYYMMDDHHMMSS_fix_processing_jobs_rls.sql`
   - Add RLS policy if missing or fix existing policy

4. **Implementation**
   ```sql
   -- Enable RLS if not already enabled
   ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

   -- Drop existing policy if it exists (to recreate)
   DROP POLICY IF EXISTS "Users can select their own processing jobs" ON processing_jobs;

   -- Create proper RLS policy for SELECT
   CREATE POLICY "Users can select their own processing jobs"
     ON processing_jobs
     FOR SELECT
     TO authenticated
     USING (auth.uid() = user_id);

   -- Optional: Add policy for INSERT (if users can create jobs directly)
   DROP POLICY IF EXISTS "Users can insert their own processing jobs" ON processing_jobs;
   CREATE POLICY "Users can insert their own processing jobs"
     ON processing_jobs
     FOR INSERT
     TO authenticated
     WITH CHECK (auth.uid() = user_id);

   -- Optional: Add policy for UPDATE (if users can update their jobs)
   DROP POLICY IF EXISTS "Users can update their own processing jobs" ON processing_jobs;
   CREATE POLICY "Users can update their own processing jobs"
     ON processing_jobs
     FOR UPDATE
     TO authenticated
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);

   -- Optional: Add policy for DELETE (if users can delete their jobs)
   DROP POLICY IF EXISTS "Users can delete their own processing jobs" ON processing_jobs;
   CREATE POLICY "Users can delete their own processing jobs"
     ON processing_jobs
     FOR DELETE
     TO authenticated
     USING (auth.uid() = user_id);
   ```

5. **Test RLS Policy**
   ```sql
   -- Test as authenticated user (replace USER_ID with actual user ID)
   SET ROLE authenticated;
   SET request.jwt.claim.sub = 'USER_ID';
   
   SELECT COUNT(*) FROM processing_jobs 
   WHERE user_id = 'USER_ID' 
   AND analysis_target = 'document-analysis';
   
   -- Should return count, not timeout
   ```

6. **Verify in Application**
   - Deploy migration
   - Test document loading in UI
   - Check console for query completion
   - Verify documents appear in sidebar

#### Acceptance Criteria
- [ ] RLS policy exists and allows authenticated users to SELECT their own rows
- [ ] Query completes in < 1 second (not 10+ seconds)
- [ ] Documents appear in sidebar after migration
- [ ] No timeout errors in console

---

### Task 1.2: Create Database Indexes

**Time Estimate:** 30 minutes  
**Priority:** P0 - Critical (if RLS fix doesn't resolve timeout)  
**Files:** `supabase/migrations/` (new migration)

#### Steps

1. **Check Existing Indexes**
   ```sql
   SELECT 
     indexname,
     indexdef
   FROM pg_indexes 
   WHERE tablename = 'processing_jobs';
   ```

2. **Analyze Query Performance**
   ```sql
   -- Replace USER_ID with actual user ID
   EXPLAIN ANALYZE
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

3. **Create Migration File**
   - Create: `supabase/migrations/YYYYMMDDHHMMSS_add_processing_jobs_indexes.sql`

4. **Implementation**
   ```sql
   -- Composite index for the main query filter
   CREATE INDEX IF NOT EXISTS processing_jobs_user_id_analysis_target_idx 
     ON processing_jobs(user_id, analysis_target);

   -- Index for ordering by created_at (if not exists)
   CREATE INDEX IF NOT EXISTS processing_jobs_created_at_idx 
     ON processing_jobs(created_at DESC);

   -- Composite index covering both filter and order (most efficient)
   CREATE INDEX IF NOT EXISTS processing_jobs_user_analysis_created_idx 
     ON processing_jobs(user_id, analysis_target, created_at DESC);
   ```

5. **Verify Index Usage**
   ```sql
   -- Re-run EXPLAIN ANALYZE - should show Index Scan
   EXPLAIN ANALYZE
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

#### Acceptance Criteria
- [ ] Indexes created successfully
- [ ] EXPLAIN ANALYZE shows Index Scan (not Sequential Scan)
- [ ] Query execution time < 100ms
- [ ] Documents load without timeout

---

## Phase 2: P1 - Textract Worker Failure (High Priority)

### Task 2.1: Fix CORS Headers in Textract Worker

**Time Estimate:** 1 hour  
**Priority:** P1 - High  
**Files:** `supabase/functions/textract-worker/index.ts`

#### Steps

1. **Review Current CORS Configuration**
   - Check existing CORS headers
   - Verify OPTIONS handler

2. **Update CORS Headers**
   ```typescript
   // In supabase/functions/textract-worker/index.ts
   
   const corsHeaders = {
     'Access-Control-Allow-Origin': '*',
     'Access-Control-Allow-Methods': 'POST, OPTIONS',
     'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
     'Access-Control-Max-Age': '86400', // 24 hours
   };
   
   serve(async (req) => {
     // Handle OPTIONS preflight request FIRST
     if (req.method === 'OPTIONS') {
       return new Response(null, {
         status: 204, // No Content
         headers: corsHeaders,
       });
     }
     
     // ... rest of function
     
     // Ensure all responses include CORS headers
     return new Response(JSON.stringify(responseData), {
       status: 200,
       headers: {
         ...corsHeaders,
         'Content-Type': 'application/json',
       },
     });
   });
   ```

3. **Test OPTIONS Request**
   ```bash
   # Test preflight request
   curl -X OPTIONS \
     -H "Origin: https://slashmcp.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: authorization,content-type" \
     https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker \
     -v
   ```

4. **Test POST Request**
   ```bash
   # Test actual POST request
   curl -X POST \
     -H "Origin: https://slashmcp.vercel.app" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "apikey: YOUR_ANON_KEY" \
     -d '{"jobId":"test-job-id"}' \
     https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker \
     -v
   ```

5. **Verify in Application**
   - Deploy updated function
   - Upload a document
   - Check Network tab for successful request
   - Verify job progresses past "uploaded" status

#### Acceptance Criteria
- [ ] OPTIONS request returns 204 with CORS headers
- [ ] POST request succeeds without CORS errors
- [ ] Documents progress from "uploaded" to "processing"
- [ ] No "Failed to fetch" errors in console

---

### Task 2.2: Verify Function Deployment

**Time Estimate:** 15 minutes  
**Priority:** P1 - High  
**Files:** Supabase Dashboard

#### Steps

1. **Check Function Status**
   - Navigate to Supabase Dashboard → Edge Functions
   - Verify `textract-worker` is listed and active
   - Check deployment timestamp

2. **Review Function Logs**
   - Check for startup errors
   - Look for runtime exceptions
   - Verify function is receiving requests

3. **Redeploy if Needed**
   ```bash
   # If function needs redeployment
   supabase functions deploy textract-worker
   ```

#### Acceptance Criteria
- [ ] Function is deployed and active
- [ ] No startup errors in logs
- [ ] Function responds to requests

---

## Phase 3: P2 - Orchestrator RAG Routing (Medium Priority)

### Task 3.1: Strengthen Agent Instructions

**Time Estimate:** 1-2 hours  
**Priority:** P2 - Medium  
**Files:** `supabase/functions/_shared/orchestration/agents.ts`

#### Steps

1. **Review Current Instructions**
   - Check `Orchestrator_Agent` instructions
   - Review `QueryClassifier` logic
   - Identify weak points

2. **Enhance Document Query Detection**
   ```typescript
   // In agents.ts - Update Orchestrator_Agent instructions
   
   "FOR DOCUMENT/知识 REQUESTS (RAG - Retrieval Augmented Generation) - HIGHEST PRIORITY:\n" +
   "- CRITICAL: If the user mentions ANY of the following, you MUST use `search_documents` tool:\n" +
   "  * 'document', 'documents', 'file', 'files', 'PDF', 'uploaded', 'my document', 'my file'\n" +
   "  * 'what I uploaded', 'the document', 'that file', 'my PDF'\n" +
   "  * 'tell me about', 'what does it say', 'what can you tell me', 'analyze'\n" +
   "  * 'search my documents', 'find in my documents', 'in my document'\n" +
   "  * 'from my document', 'document says', 'document contains', 'document mentions'\n" +
   "  * 'what's in', 'what is in', 'content of', 'information in'\n" +
   "- Examples that REQUIRE `search_documents`:\n" +
   "  * 'What can you tell me about the document I just uploaded?'\n" +
   "  * 'What does my document say about X?'\n" +
   "  * 'Tell me about the PDF'\n" +
   "  * 'Search my documents for Y'\n" +
   "  * 'What information is in my uploaded file?'\n" +
   "  * 'Analyze my document'\n" +
   "  * 'What's in the document?'\n" +
   "- DO NOT say 'I can't analyze documents' - you CAN and MUST use `search_documents`\n" +
   "- DO NOT use web search for document queries - ALWAYS use `search_documents` first\n" +
   "- If documents are still processing, inform user and check status with `get_document_status`\n" +
   "- The orchestrator MUST proactively search documents when users ask questions that might be answered by uploaded content\n"
   ```

3. **Add Few-Shot Examples**
   ```typescript
   // Add examples to help LLM understand intent
   const documentQueryExamples = `
   EXAMPLES OF DOCUMENT QUERIES (use search_documents):
   - User: "What can you tell me about the document?"
     → Action: Use search_documents tool with query="document content"
   
   - User: "What does my PDF say about pricing?"
     → Action: Use search_documents tool with query="pricing"
   
   - User: "Search my documents for information about X"
     → Action: Use search_documents tool with query="X"
   
   EXAMPLES OF WEB QUERIES (use web search):
   - User: "What is the weather today?"
     → Action: Use web search (no documents involved)
   
   - User: "Tell me about artificial intelligence"
     → Action: Use web search (general knowledge query)
   `;
   ```

4. **Improve QueryClassifier**
   ```typescript
   // In queryClassifier.ts - Enhance detection
   
   const DOCUMENT_KEYWORDS = [
     "document", "documents", "uploaded", "file", "files", "pdf", "pdfs",
     "what i uploaded", "my document", "my documents", "the document", "that document",
     "tell me about", "what does it say", "what can you tell me", "analyze",
     "search my documents", "find in my documents", "in my document",
     "from my document", "document says", "document contains", "document mentions",
     "what's in", "what is in", "content of", "information in",
     "about the document", "about the file", "about my document", "about my files",
   ];
   
   // Add document name matching
   if (availableDocuments && availableDocuments.length > 0) {
     for (const doc of availableDocuments) {
       const fileNameLower = doc.fileName.toLowerCase();
       // Check for exact filename match
       if (lowerQuery.includes(fileNameLower)) {
         intent = "document_query";
         tool = "search_documents";
         confidence = Math.min(1.0, confidence + 0.5);
         reasoning = `Query mentions document filename: ${doc.fileName}`;
         break;
       }
     }
   }
   ```

5. **Test Classification**
   - Test with various phrasings
   - Verify correct tool selection
   - Check confidence scores

#### Acceptance Criteria
- [ ] Document queries correctly classified with high confidence (>0.7)
- [ ] Orchestrator uses `search_documents` for document queries
- [ ] Web queries still use web search
- [ ] Few-shot examples help LLM understand intent

---

### Task 3.2: Test Edge Cases

**Time Estimate:** 30 minutes  
**Priority:** P2 - Medium  
**Files:** Manual testing

#### Test Cases

1. **Explicit Document Queries**
   - "What's in my document?"
   - "Search my files for X"
   - "Tell me about the PDF I uploaded"
   - "Do I have a document about Y?"

2. **Ambiguous Queries**
   - "What can you tell me about X?" (when document exists)
   - "Tell me about Y" (when document exists)
   - "Search for Z" (when documents exist)

3. **Plural Forms**
   - "What can you tell me about the documents?"
   - "Search my files"
   - "What's in my PDFs?"

4. **Document Name References**
   - "What does Architecture and Core Components.pdf say?"
   - "Tell me about the document named X"

#### Acceptance Criteria
- [ ] All test cases correctly route to `search_documents`
- [ ] No false positives (web queries don't use document search)
- [ ] Confidence scores are appropriate

---

## Implementation Order

### Week 1: Critical Fixes (P0)

**Day 1-2: RLS Policies**
1. ✅ Check current RLS status
2. ✅ Create migration for RLS policies
3. ✅ Test RLS policies
4. ✅ Deploy and verify

**Day 2-3: Database Indexes** (if RLS doesn't fix timeout)
1. ✅ Check existing indexes
2. ✅ Create migration for indexes
3. ✅ Verify index usage
4. ✅ Deploy and verify

### Week 1: High Priority Fixes (P1)

**Day 3-4: CORS Configuration**
1. ✅ Update CORS headers in textract-worker
2. ✅ Test OPTIONS and POST requests
3. ✅ Deploy and verify
4. ✅ Test document processing

### Week 2: Medium Priority Improvements (P2)

**Day 1-2: Prompt Engineering**
1. ✅ Enhance orchestrator instructions
2. ✅ Add few-shot examples
3. ✅ Improve QueryClassifier
4. ✅ Test classification

**Day 2-3: Edge Case Testing**
1. ✅ Test various query phrasings
2. ✅ Verify tool selection
3. ✅ Document results

---

## Testing Checklist

### P0: Database Query Timeout
- [ ] RLS policy allows authenticated users to SELECT their own rows
- [ ] Query completes in < 1 second
- [ ] Documents appear in sidebar
- [ ] No timeout errors in console
- [ ] Indexes are being used (if created)

### P1: Textract Worker Failure
- [ ] OPTIONS request returns 204 with CORS headers
- [ ] POST request succeeds without CORS errors
- [ ] Documents progress from "uploaded" to "processing"
- [ ] No "Failed to fetch" errors
- [ ] Function logs show successful processing

### P2: Orchestrator RAG Routing
- [ ] Document queries use `search_documents` tool
- [ ] Web queries use web search
- [ ] Classification confidence > 0.7 for document queries
- [ ] No false positives (web queries don't use document search)
- [ ] Edge cases handled correctly

---

## Rollback Plan

If any change causes issues:

1. **RLS Policies**
   - Revert migration: `DROP POLICY IF EXISTS ...`
   - Or temporarily disable RLS: `ALTER TABLE processing_jobs DISABLE ROW LEVEL SECURITY;`

2. **CORS Headers**
   - Revert to previous CORS configuration
   - Redeploy function

3. **Agent Instructions**
   - Revert to previous instructions
   - Redeploy function

---

## Success Metrics

### P0 Success
- Query timeout: **0%** (currently 100%)
- Query completion time: **< 1 second** (currently > 10 seconds)
- Documents visible: **100%** (currently 0%)

### P1 Success
- Textract worker success rate: **> 95%** (currently 0%)
- Document processing completion: **> 90%** (currently 0%)
- CORS errors: **0%** (currently 100%)

### P2 Success
- Document query routing accuracy: **> 90%** (currently ~30%)
- False positive rate: **< 5%** (currently ~70%)
- User satisfaction: **Improved** (subjective)

---

## Notes

- **RLS Policies:** Most likely root cause of P0 issue. Should be fixed first.
- **CORS:** Common issue with Edge Functions. Standard fix.
- **Prompt Engineering:** Iterative process. May need multiple rounds of refinement.

---

## References

- [`DEBUGGING_GUIDE.md`](./DEBUGGING_GUIDE.md) - Detailed debugging steps
- [`CURRENT_CHALLENGES.md`](./CURRENT_CHALLENGES.md) - Current issues overview
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Edge Functions CORS](https://supabase.com/docs/guides/functions/cors)

---

*Last Updated: December 3, 2025*

