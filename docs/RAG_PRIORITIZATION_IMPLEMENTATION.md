# RAG Prioritization Implementation - Problem & Solution

## 🎯 What We're Trying To Do

**Goal:** Make the chat system prioritize RAG (Retrieval Augmented Generation) document search over web search when users have uploaded documents and ask questions about them.

### The Problem

When a user:
1. Uploads a document (e.g., "UAOL_Pre-Money_Valuation_Summary.pdf")
2. Asks a question about it (e.g., "what are the details on the UAOL document")

**Current Behavior:**
- The AI responds: "Could you clarify what you mean by the 'UAOL document'?"
- The AI then performs a web search instead of searching the uploaded document
- Console shows: `[useChat] Document context payload length: 0`
- The chat is not aware that documents exist

**Desired Behavior:**
- The AI should immediately recognize the query is about an uploaded document
- The AI should use the `search_documents` tool to search the uploaded document
- The AI should provide answers from the document content
- Only fall back to web search if the document doesn't contain relevant information

---

## 🔍 Root Cause Analysis

### Issue 1: Document Context Not Being Passed

**Problem:** Documents exist in the database and are visible in the "Documents & Knowledge" panel, but they're not being included in the chat context when sending messages.

**Evidence:**
- Console log: `[useChat] Document context payload length: 0`
- Console log: `[Index] No completed jobs in uploadJobs, but keeping documentCount: 1`
- Documents appear in sidebar but chat doesn't know about them

**Why This Happens:**
- Documents uploaded in previous sessions aren't in the `uploadJobs` in-memory state
- The code only looks at `uploadJobs` to build document context
- If `uploadJobs` is empty, no documents are included even though they exist in the database

### Issue 2: Orchestrator Not Prioritizing RAG

**Problem:** Even when document context is passed, the orchestrator chooses web search over RAG search.

**Evidence:**
- AI says: "I will perform a web search to find relevant details"
- AI uses `/search-mcp web_search` instead of `search_documents`
- Query classifier doesn't detect "UAOL document" as a document query

**Why This Happens:**
- Query classifier confidence score too low for document intent
- Orchestrator instructions not strong enough to prioritize RAG
- Pattern matching doesn't catch queries like "UAOL document"

---

## 🛠️ What We've Tried So Far

### Frontend Changes (src/pages/Index.tsx)

#### 1. Database Fallback Query
**What:** Added logic to query the database directly when `uploadJobs` is empty but `documentCount > 0`

**Code Location:** `src/pages/Index.tsx` lines ~880-920

**Implementation:**
```typescript
// CRITICAL FIX: If no completed jobs in uploadJobs but we know documents exist
if (allCompletedJobs.length === 0 && documentCount > 0 && (session?.user?.id || guestMode)) {
  // Query database for completed documents
  const { data: dbJobs } = await supabaseClient
    .from("processing_jobs")
    .select("id, file_name, status, metadata")
    .eq("user_id", userId)
    .in("analysis_target", ["document-analysis", "image-ocr"])
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(50);
  
  // Convert to context docs format
  allCompletedJobs = dbJobs.map(job => ({...}));
}
```

**Status:** ✅ Implemented, committed, pushed to GitHub

#### 2. Document Context in Messages
**What:** Added `documentContext` field to messages to show which documents are included

**Code Location:** 
- `src/hooks/useChat.ts` - Added `documentContext` to `TextMessage` type
- `src/components/ChatMessage.tsx` - Added visual badges showing document names

**Status:** ✅ Implemented, committed, pushed to GitHub

#### 3. Enhanced Proactive Summaries
**What:** Made document completion summaries more detailed with metadata

**Code Location:** `src/pages/Index.tsx` lines ~262-330

**Status:** ✅ Implemented, committed, pushed to GitHub

### Backend Changes (Supabase Edge Functions)

#### 1. Enhanced Orchestrator Instructions
**What:** Made orchestrator instructions much more forceful about prioritizing RAG

**Code Location:** `supabase/functions/agent-orchestrator-v1/index.ts` lines ~179-230

**Key Changes:**
- Added "CRITICAL ROUTING RULE" section
- Instructions now say: "BEFORE using ANY other tool, you MUST check if the query can be answered from uploaded documents"
- Added filename matching logic to detect when queries mention document names
- More explicit: "YOU MUST use search_documents IMMEDIATELY"

**Status:** ✅ Implemented, deployed to Supabase

#### 2. Improved Query Classifier
**What:** Enhanced query classification to better detect document queries

**Code Location:** `supabase/functions/_shared/orchestration/queryClassifier.ts`

**Key Changes:**
- More aggressive document name matching (accepts 2+ char acronyms like "UAOL")
- Added pattern matching for "[WORD] document" queries
- Increased confidence scoring when documents are available
- Added keywords: "details on", "details about", "what are the details"
- Pattern matching for queries like "UAOL document" → matches "UAOL" in filename

**Status:** ✅ Implemented, deployed to Supabase

#### 3. Document Context Detection
**What:** Enhanced logic to detect when queries mention document filenames

**Code Location:** `supabase/functions/agent-orchestrator-v1/index.ts` lines ~204-210

**Implementation:**
```typescript
// Check if query mentions any document filename (even partially)
const queryLower = input.message.toLowerCase();
const matchingDocs = documentContext.availableDocuments.filter(doc => {
  const fileNameWords = doc.fileName.toLowerCase().replace(/\.(pdf|docx?|txt|csv)/, "").split(/[\s_-]+/);
  return fileNameWords.some(word => word.length > 3 && queryLower.includes(word.toLowerCase()));
});

if (matchingDocs.length > 0) {
  enhancedInstructions += `- Query likely refers to: ${matchingDocs.map(d => d.fileName).join(", ")}\n`;
  enhancedInstructions += `- YOU MUST use search_documents with these document(s)\n`;
}
```

**Status:** ✅ Implemented, deployed to Supabase

---

## 📊 Current Status

### ✅ Completed
1. **Frontend:** Database fallback query implemented
2. **Frontend:** Document context badges added
3. **Frontend:** Enhanced summaries implemented
4. **Backend:** Orchestrator instructions enhanced
5. **Backend:** Query classifier improved
6. **Backend:** Deployed to Supabase
7. **Git:** All changes committed and pushed to GitHub

### ❓ Still Not Working
- Chat still shows: `Document context payload length: 0`
- AI still uses web search instead of RAG
- Documents not being detected/included

---

## 🔬 Debugging Steps Needed

### Step 1: Verify Frontend Deployment
**Check:** Is the frontend code actually deployed to Vercel?

1. Go to: https://vercel.com/dashboard
2. Check if there's a new deployment after the GitHub push
3. Verify the deployment is live (not stuck in "Building")

**If not deployed:**
- Check Vercel logs for build errors
- Verify GitHub Actions workflow ran successfully
- Manually trigger Vercel deployment if needed

### Step 2: Check Document Context Payload
**Check:** Is the database fallback query actually running?

**Add logging:**
```typescript
// In src/pages/Index.tsx onSubmit handler
console.log("[Index] DEBUG: uploadJobs length:", uploadJobs.length);
console.log("[Index] DEBUG: documentCount:", documentCount);
console.log("[Index] DEBUG: allCompletedJobs before fallback:", allCompletedJobs.length);

// After database query
console.log("[Index] DEBUG: allCompletedJobs after fallback:", allCompletedJobs.length);
console.log("[Index] DEBUG: contextDocs being sent:", contextDocs);
```

**Expected:** Should see database query running and finding documents

### Step 3: Verify Backend Receives Context
**Check:** Is the orchestrator actually receiving document context?

**Check Supabase logs:**
1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/agent-orchestrator-v1/logs
2. Look for logs showing:
   - `Document context: X docs, Y ready, Z processing`
   - `Query classification: intent=document`
   - `Enhanced instructions` being added

**If not seeing context:**
- The frontend might not be sending it
- Check `useChat.ts` to verify `documentContext` is being passed to `sendMessage`

### Step 4: Test Query Classification
**Check:** Is the query classifier detecting "UAOL document" as a document query?

**Expected logs:**
```
Query classification: intent=document, confidence=0.8+, tool=search_documents
```

**If confidence is low:**
- The pattern matching might not be working
- Check if "UAOL" is being matched to the filename

### Step 5: Verify RAG Tools Available
**Check:** Are RAG tools actually available to the orchestrator?

**Check logs for:**
```
Added X RAG tools to orchestrator
```

**If tools not added:**
- Check Supabase secrets (SERVICE_ROLE_KEY, etc.)
- Verify RAG tools are being created successfully

---

## 🎯 Desired Outcome

### User Experience Flow

1. **User uploads document:**
   - Document appears in "Documents & Knowledge" panel
   - Proactive summary appears in chat with metadata
   - Panels auto-show if hidden

2. **User asks question:**
   - Types: "what are the details on the UAOL document"
   - Message shows document badge indicating which document is included

3. **System processes:**
   - Frontend: Detects document exists, includes in context payload
   - Backend: Receives document context, classifies query as "document" intent
   - Orchestrator: Sees enhanced instructions, uses `search_documents` tool
   - RAG: Searches document embeddings, returns relevant chunks

4. **AI responds:**
   - Answers based on document content
   - Cites which document the information came from
   - Only uses web search if document doesn't contain answer

### Expected Console Logs

**Frontend:**
```
[Index] DEBUG: uploadJobs length: 0
[Index] DEBUG: documentCount: 1
[Index] ⚠️ No completed jobs in uploadJobs but documentCount is 1, querying database...
[Index] ✅ Found 1 completed documents in database
[Index] ✅ Including UAOL_Pre-Money_Valuation_Summary.pdf - completed (backend will retrieve content)
[Index] Found 1 queryable documents: [{fileName: "UAOL_Pre-Money_Valuation_Summary.pdf", jobId: "..."}]
[useChat] Document context payload length: 1
[useChat] Including document context payload: [{jobId: "...", fileName: "...", textLength: ...}]
```

**Backend:**
```
Document context: 1 docs, 1 ready, 0 processing
Query classification: intent=document, confidence=0.85, tool=search_documents
Query likely refers to: UAOL_Pre-Money_Valuation_Summary.pdf
YOU MUST use search_documents with these document(s)
```

### Expected AI Behavior

**Instead of:**
> "Could you clarify what you mean by the 'UAOL document'? I will perform a web search..."

**Should say:**
> "I found your UAOL document. Let me search it for details..." [uses search_documents] "Based on the UAOL Pre-Money Valuation Summary document, here are the key details: [content from document]"

---

## 🚨 Potential Issues & Solutions

### Issue A: Frontend Not Deployed
**Symptom:** Changes in code but not reflected in production
**Solution:** 
- Verify Vercel deployment completed
- Check build logs for errors
- Clear browser cache

### Issue B: Database Query Failing
**Symptom:** `documentCount > 0` but database query returns empty
**Solution:**
- Check RLS policies allow user to read their own jobs
- Verify `user_id` matches session user
- Check query timeout (might need to increase)

### Issue C: Context Not Reaching Backend
**Symptom:** Frontend sends context but backend doesn't receive it
**Solution:**
- Verify `sendMessage` function includes `documentContext` parameter
- Check `useChat.ts` implementation
- Verify API call includes document context in request body

### Issue D: Orchestrator Ignoring Instructions
**Symptom:** Backend receives context but still uses web search
**Solution:**
- Check orchestrator logs for enhanced instructions
- Verify RAG tools are available
- Check if query classification is working correctly

### Issue E: Guest Mode Issues
**Symptom:** Works for authenticated users but not guests
**Solution:**
- Verify guest mode has access to documents
- Check if `guestMode` flag is being checked correctly
- Ensure guest users can query their documents

---

## 📝 Next Steps

1. **Verify Frontend Deployment**
   - Check Vercel dashboard
   - Test in production (not localhost)

2. **Add Debug Logging**
   - Add console logs to track document context flow
   - Add backend logs to track orchestrator decisions

3. **Test End-to-End**
   - Upload a document
   - Ask a question about it
   - Check logs at each step

4. **Compare Local vs Production**
   - Test locally first
   - Then test in production
   - Compare behavior

5. **Check Browser Console**
   - Look for errors
   - Verify document context payload
   - Check network requests

---

## 🔗 Related Files

- `src/pages/Index.tsx` - Frontend document context handling
- `src/hooks/useChat.ts` - Chat message sending with context
- `src/components/ChatMessage.tsx` - Visual document badges
- `supabase/functions/agent-orchestrator-v1/index.ts` - Orchestrator logic
- `supabase/functions/_shared/orchestration/queryClassifier.ts` - Query classification
- `supabase/functions/_shared/orchestration/contextManager.ts` - Document context retrieval

---

## 📅 Timeline

- **Started:** Layout improvements and document context awareness
- **Frontend Changes:** Document badges, database fallback, enhanced summaries
- **Backend Changes:** RAG prioritization, query classification improvements
- **Deployed Backend:** ✅ Supabase Edge Functions deployed
- **Pushed Frontend:** ✅ GitHub commit and push completed
- **Current Status:** ⚠️ Waiting for frontend deployment and verification

---

## 🎓 Key Learnings

1. **State Management:** Documents can exist in database but not in component state
2. **Context Passing:** Need to verify context flows from frontend → backend → orchestrator
3. **Query Classification:** Pattern matching is crucial for detecting document queries
4. **Instruction Strength:** LLMs need very explicit instructions to prioritize certain tools
5. **Debugging:** Need comprehensive logging at each step to track the flow

---

## ✅ Success Criteria

The implementation is successful when:

1. ✅ Documents uploaded in previous sessions are detected
2. ✅ Document context is included in chat messages
3. ✅ Queries about documents are classified correctly
4. ✅ Orchestrator prioritizes RAG over web search
5. ✅ AI responds with document content instead of asking for clarification
6. ✅ Visual indicators show which documents are being used
7. ✅ System works for both authenticated and guest users

---

**Last Updated:** After deployment attempt
**Status:** ⚠️ Needs verification and debugging


