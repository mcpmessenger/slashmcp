# Document Upload & RAG Query - Setup Guide

## 🎯 Goal

**Simple Goal:** Upload documents and be able to query them using RAG (Retrieval Augmented Generation).

**What Should Work:**
1. Upload a document (PDF, image, etc.)
2. Document gets processed and indexed
3. Ask questions about the document
4. Get answers from the document content

---

## 🔍 Current Problem

**Symptom:** Documents upload successfully but queries don't find/use them.

**Evidence:**
- Documents appear in "Documents & Knowledge" panel ✅
- Console shows: `[useChat] Document context payload length: 0` ❌
- When asking about documents, AI doesn't use them ❌

---

## 🛠️ What We've Implemented

### 1. Database Fallback Query (Frontend)
**File:** `src/pages/Index.tsx`

**What it does:** When sending a message, if documents exist in database but aren't in memory, query the database to get them.

**Code location:** Lines ~880-920 in `onSubmit` handler

**Status:** ✅ Code written, committed, pushed to GitHub

### 2. Document Context Passing (Frontend)
**Files:** 
- `src/hooks/useChat.ts` - Added `documentContext` to message type
- `src/pages/Index.tsx` - Builds context docs and passes to `sendMessage`

**What it does:** Includes document IDs in the chat request so backend knows which documents to search.

**Status:** ✅ Code written, committed, pushed to GitHub

### 3. RAG Tools (Backend)
**File:** `supabase/functions/_shared/orchestration/tools.ts`

**What it does:** Provides `search_documents` tool that searches document embeddings.

**Status:** ✅ Already exists, should be working

### 4. Orchestrator Instructions (Backend)
**File:** `supabase/functions/agent-orchestrator-v1/index.ts`

**What it does:** Tells the AI to use `search_documents` when documents are available.

**Status:** ✅ Enhanced, deployed to Supabase

---

## 🚨 Why It's Not Working

### Most Likely Issue: Frontend Not Deployed

**Problem:** The frontend code changes haven't been deployed to Vercel yet.

**Check:**
1. Go to: https://vercel.com/dashboard
2. Find your `slashmcp` project
3. Check "Deployments" tab
4. Is there a recent deployment after the GitHub push?

**If no deployment:**
- Vercel might not be connected to GitHub
- Or the build might have failed
- Or auto-deploy might be disabled

### Second Issue: Document Context Not Being Sent

**Problem:** Even if frontend is deployed, the document context might not be reaching the backend.

**Check in browser console:**
```
[Index] Found X queryable documents
[useChat] Document context payload length: X
```

**If payload length is 0:**
- Database query might be failing
- Or documents might not be in "completed" status
- Or user ID mismatch

---

## ✅ Step-by-Step Fix

### Step 1: Verify Frontend Deployment

```powershell
# Check Vercel dashboard
# Or manually trigger deployment if needed
```

**Expected:** See a deployment with commit `ce2a01f` (our recent commit)

### Step 2: Test Document Upload

1. Upload a test document
2. Wait for it to process (check "Documents & Knowledge" panel)
3. Verify it shows as "completed • indexed" or similar

### Step 3: Test Query with Console Open

1. Open browser console (F12)
2. Ask: "what is in my document" or "tell me about the [filename]"
3. Look for these logs:

**Expected logs:**
```
[Index] Total completed jobs in uploadJobs: 0
[Index] ⚠️ No completed jobs in uploadJobs but documentCount is 1, querying database...
[Index] ✅ Found 1 completed documents in database
[Index] Found 1 queryable documents: [{fileName: "...", jobId: "..."}]
[useChat] Document context payload length: 1
```

**If you see:**
```
[useChat] Document context payload length: 0
```

Then the database query isn't working or finding documents.

### Step 4: Check Backend Logs

1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/agent-orchestrator-v1/logs
2. Send a query about your document
3. Look for:

**Expected logs:**
```
Document context: 1 docs, 1 ready, 0 processing
Query classification: intent=document
```

**If you see:**
```
Document context: 0 docs
```

Then the backend isn't receiving document context from frontend.

---

## 🔧 Quick Fixes

### Fix 1: Manual Vercel Deployment

If auto-deploy isn't working:

1. Go to Vercel dashboard
2. Click "Deployments"
3. Click "Redeploy" on latest deployment
4. Or connect GitHub repo if not connected

### Fix 2: Add Debug Logging

Add this to `src/pages/Index.tsx` in the `onSubmit` handler (around line 880):

```typescript
console.log("[Index] DEBUG: uploadJobs:", uploadJobs.length);
console.log("[Index] DEBUG: documentCount:", documentCount);
console.log("[Index] DEBUG: session?.user?.id:", session?.user?.id);
console.log("[Index] DEBUG: guestMode:", guestMode);

// After database query
console.log("[Index] DEBUG: allCompletedJobs after query:", allCompletedJobs.length);
console.log("[Index] DEBUG: contextDocs:", contextDocs);
```

This will help us see where the flow is breaking.

### Fix 3: Verify Document Status

Check if documents are actually "completed":

1. Go to Supabase dashboard
2. Go to Table Editor → `processing_jobs`
3. Filter by your user_id
4. Check `status` column - should be "completed"
5. Check `metadata->job_stage` - should be "indexed" or "extracted"

---

## 📋 Checklist

- [ ] Frontend deployed to Vercel (check dashboard)
- [ ] Document uploads successfully
- [ ] Document shows as "completed" in database
- [ ] Document appears in "Documents & Knowledge" panel
- [ ] Console shows document context payload > 0
- [ ] Backend logs show document context received
- [ ] Query uses `search_documents` tool
- [ ] AI responds with document content

---

## 🎯 Success Criteria

**It's working when:**
1. You upload a document
2. You ask: "what is in my document" or "tell me about [filename]"
3. AI responds with content from your document (not web search)
4. Console shows: `Document context payload length: 1` (or more)
5. Backend logs show: `Document context: X docs, Y ready`

---

## 🆘 If Still Not Working

### Check These:

1. **Is the document actually indexed?**
   - Check `document_embeddings` table in Supabase
   - Should have rows with `job_id` matching your document

2. **Is the user ID correct?**
   - Frontend might be using different user ID than backend
   - Check session user ID matches document user_id

3. **Are RAG tools available?**
   - Check backend logs for: "Added X RAG tools to orchestrator"
   - If 0, RAG tools aren't being created

4. **Is the query being classified correctly?**
   - Backend logs should show: `intent=document`
   - If `intent=web`, query classifier isn't detecting document query

---

## 📝 Next Steps

1. **Verify frontend is deployed** (most important!)
2. **Add debug logging** to see where it's breaking
3. **Test with console open** to see the flow
4. **Check backend logs** to see if context is received
5. **Report what you see** in the logs

---

**Focus:** Just get basic document upload → RAG query working. Don't worry about prioritization or advanced features yet.

