# RAG & Document Upload Investigation Report

**Date:** January 2025  
**Status:** 🔴 Issues Found - Fixes Required

---

## Executive Summary

The RAG (Retrieval-Augmented Generation) pipeline is **fully implemented** but has **integration gaps** preventing it from working properly. Document summaries are not consistently showing, and the chat is not always aware of uploaded documents.

---

## Current Architecture Status

### ✅ **Fully Implemented Components**

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| **Vector Database** | ✅ Working | `document_embeddings` table (pgvector) | HNSW index, 1536-dim embeddings |
| **Text Extraction** | ✅ Working | `textract-worker` function | Extracts text from PDFs, images, CSVs |
| **Embedding Generation** | ✅ Working | `textract-worker` (lines 758-795) | Uses OpenAI `text-embedding-3-small` |
| **Chunking Strategy** | ✅ Working | Semantic chunking (~2000 chars, 150 overlap) | In `doc-context/index.ts` |
| **RAG Search Tool** | ✅ Working | `search_documents` in `tools.ts` | Calls `doc-context` function |
| **Document Context Retrieval** | ✅ Working | `doc-context` Edge Function | Vector search + legacy fallback |

### ⚠️ **Integration Issues**

| Issue | Severity | Impact | Root Cause |
|-------|----------|--------|------------|
| **Summaries Not Showing** | HIGH | Users don't know when documents are ready | `showDocumentSummary` not always triggered |
| **Chat Unaware of Documents** | HIGH | RAG not used even when documents exist | `documentContext` not passed correctly |
| **RAG Tools Not Available** | MEDIUM | `search_documents` tool not accessible | Conditional tool loading may fail |

---

## Issue 1: Document Summaries Not Showing

### Problem
When documents complete processing, summaries should appear in chat, but they often don't.

### Root Causes

1. **Polling Gap**: `showDocumentSummary` is only called when polling detects status change to "completed" (line 412 in Index.tsx). If a document completes between polls, it might be missed.

2. **Guest Mode**: Summary check on page load (line 232-271) only runs for authenticated users (`userId` required), so guest mode users never see summaries for existing documents.

3. **Error Handling**: If `fetchJobStatus` fails, the error is caught but the summary is still marked as "shown" (line 227), preventing retry.

### Fixes Needed

1. ✅ Check for completed documents more frequently
2. ✅ Support guest mode in summary checks
3. ✅ Improve error handling and retry logic
4. ✅ Add manual "Show Summary" button in DocumentsSidebar

---

## Issue 2: Chat Unaware of RAG Uploads

### Problem
Documents exist in database and are indexed, but chat doesn't use them for queries.

### Root Causes

1. **Context Not Passed**: `documentContext` is built from `uploadJobs` state (line 948-1042), but:
   - Documents uploaded in previous sessions aren't in `uploadJobs`
   - Database fallback query (line 964-999) only runs if `documentCount > 0`
   - If `documentCount` is 0 (sidebar not loaded), no context is passed

2. **RAG Tools Conditional**: RAG tools are only added if `input.userId` exists (line 339 in orchestrator), so guest mode can't use RAG.

3. **Tool Not Prioritized**: Even when RAG tools are available, the orchestrator might choose web search instead.

### Fixes Needed

1. ✅ Always query database for completed documents when sending messages
2. ✅ Ensure RAG tools are available in guest mode (if documents exist)
3. ✅ Improve orchestrator instructions to prioritize RAG
4. ✅ Add logging to track when RAG is used vs. skipped

---

## Issue 3: RAG Tools Not Available

### Problem
`search_documents` tool exists but might not be accessible in all scenarios.

### Root Causes

1. **Conditional Loading**: RAG tools only added if `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `input.userId` all exist (line 339).

2. **Guest Mode**: Guest users don't have `userId`, so RAG tools are never added.

3. **Error Handling**: If `createRagTools` throws, error is caught but tools aren't added (line 344-347).

### Fixes Needed

1. ✅ Support guest mode RAG (use session-based user identification)
2. ✅ Add fallback when RAG tools fail to load
3. ✅ Log when RAG tools are missing

---

## Recommended Fixes

### Priority 1: Fix Document Summaries

1. **Improve Polling**: Check for completed documents more aggressively
2. **Guest Mode Support**: Allow summaries in guest mode
3. **Manual Trigger**: Add "Show Summary" button in DocumentsSidebar

### Priority 2: Fix RAG Awareness

1. **Always Query Database**: Don't rely on `uploadJobs` state alone
2. **Guest Mode RAG**: Support RAG for guest users with documents
3. **Better Logging**: Track when documents are found vs. not found

### Priority 3: Improve RAG Tool Availability

1. **Conditional Logic**: Make RAG tools available when documents exist, even in guest mode
2. **Error Recovery**: Better handling when RAG tools fail to load
3. **Tool Prioritization**: Ensure orchestrator prefers RAG over web search

---

## Testing Checklist

- [ ] Upload document → Summary appears in chat
- [ ] Upload document in guest mode → Summary appears
- [ ] Query document → RAG search is used
- [ ] Query document in guest mode → RAG search works
- [ ] Multiple documents → All are included in context
- [ ] Document from previous session → Still queryable
- [ ] Large document → Embeddings generated successfully
- [ ] Document stuck in processing → User sees helpful message

---

## Next Steps

1. Implement fixes for Priority 1 issues
2. Test document summary flow end-to-end
3. Implement fixes for Priority 2 issues
4. Test RAG query flow end-to-end
5. Deploy and verify in production

