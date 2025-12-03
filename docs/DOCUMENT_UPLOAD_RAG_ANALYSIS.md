# Document Upload & RAG Pipeline Analysis

**Date:** December 2, 2025  
**Status:** 🔴 CRITICAL - Document Uploads Hanging  
**Severity:** P0 - Production Breaking

---

## Executive Summary

Document uploads are hanging during processing, preventing users from accessing uploaded document context. The RAG pipeline is **fully implemented** but has **critical timeout issues** that cause hanging for large documents.

---

## RAG Pipeline Status

### ✅ **FULLY IMPLEMENTED**

The RAG (Retrieval-Augmented Generation) pipeline is complete and operational:

#### Architecture Components

| Component | Technology | Status | Details |
|-----------|-----------|--------|---------|
| **Raw File Storage** | AWS S3 | ✅ Working | Files stored in `incoming/` path with presigned URLs |
| **Text Extraction** | AWS Textract + Custom Parsers | ✅ Working | Extracts text from PDFs, images, CSVs, etc. |
| **Embedding Model** | OpenAI `text-embedding-3-small` | ✅ Working | 1536 dimensions, semantic chunking |
| **Vector Database** | Supabase `pgvector` | ✅ Working | HNSW index for fast similarity search |
| **Chunking Strategy** | Semantic Chunking | ✅ Working | ~2000 chars per chunk, 150 char overlap |
| **Retrieval Function** | `search_document_embeddings` | ✅ Working | PostgreSQL function with cosine similarity |
| **Context Retrieval** | `doc-context` Edge Function | ✅ Working | Vector search with legacy fallback |

#### Pipeline Flow

```
1. Upload → S3 (presigned URL)
   ↓
2. Register Job → processing_jobs table
   ↓
3. Extract Text → textract-worker → analysis_results table
   ↓
4. Chunk Text → Semantic chunking (~2000 chars, 150 overlap)
   ↓
5. Generate Embeddings → OpenAI API (batched, 100 chunks/batch)
   ↓
6. Store Embeddings → document_embeddings table (pgvector)
   ↓
7. Query Time → Vector similarity search → Top K chunks
   ↓
8. Inject Context → Chat function uses retrieved chunks
```

---

## Storage Protocol for Large Documents

### Current Storage Architecture

#### 1. **Raw File Storage (AWS S3)**
- **Location:** `incoming/{uuid}-{filename}`
- **Access:** Presigned PUT URLs for upload
- **Retention:** Files stored permanently (no auto-deletion)
- **Limitations:** None (S3 scales to any size)

#### 2. **Extracted Text Storage (PostgreSQL)**
- **Table:** `analysis_results`
- **Columns:** `ocr_text` (TEXT), `textract_response` (JSONB)
- **Limitations:** 
  - PostgreSQL TEXT can store up to 1GB
  - Large documents may cause performance issues
  - No automatic cleanup

#### 3. **Vector Embeddings Storage (PostgreSQL + pgvector)**
- **Table:** `document_embeddings`
- **Schema:**
  - `id` (UUID)
  - `job_id` (UUID, FK to processing_jobs)
  - `chunk_text` (TEXT)
  - `embedding` (vector(1536))
  - `chunk_index` (INTEGER)
  - `metadata` (JSONB)
- **Indexes:**
  - HNSW index on `embedding` for fast similarity search
  - Index on `job_id` for filtering
  - Composite index on `(job_id, chunk_index)` for ordered retrieval
- **Limitations:**
  - Each chunk = 1 row
  - Large documents = many rows (e.g., 1000-page PDF = ~5000 chunks)
  - Storage: ~6KB per chunk (text + embedding + metadata)

#### 4. **Job Metadata Storage (PostgreSQL)**
- **Table:** `processing_jobs`
- **Tracks:** File name, size, status, stage, metadata
- **Stages:** `registered` → `uploaded` → `processing` → `extracted` → `indexed` → `injected`

### Storage Capacity Estimates

| Document Size | Chunks | Embeddings Storage | Total Storage |
|--------------|--------|-------------------|---------------|
| 10 pages | ~50 | ~300 KB | ~500 KB |
| 100 pages | ~500 | ~3 MB | ~5 MB |
| 1000 pages | ~5000 | ~30 MB | ~50 MB |
| 10,000 pages | ~50,000 | ~300 MB | ~500 MB |

**Recommendation:** For documents > 10,000 pages, consider:
- Streaming chunk processing
- Batch embedding generation with progress tracking
- Incremental indexing

---

## Critical Issues Identified

### Issue #1: Embedding Generation Has No Timeout ⚠️ **CRITICAL**

**Location:** `supabase/functions/textract-worker/index.ts:122-194`

**Problem:**
- `generateEmbeddings()` function has **NO timeout**
- Large documents (1000+ pages) can generate 5000+ chunks
- Each batch of 100 chunks calls OpenAI API
- If API hangs or is slow, entire job hangs indefinitely
- No progress tracking or cancellation

**Impact:**
- Documents hang at "processing" stage
- User sees "Registering upload..." indefinitely
- No error message shown
- Job stuck in database

**Fix Required:**
- Add timeout to each OpenAI API call (30 seconds per batch)
- Add overall timeout for entire embedding process (5 minutes)
- Add progress logging
- Gracefully handle timeouts (mark job as partially indexed)

---

### Issue #2: Textract Worker Has No Overall Timeout ⚠️ **CRITICAL**

**Location:** `supabase/functions/textract-worker/index.ts:470-805`

**Problem:**
- Edge function has no overall execution timeout
- Supabase Edge Functions have 60-second default timeout (can be extended)
- Large documents may exceed timeout
- No graceful degradation

**Impact:**
- Function times out mid-processing
- Job stuck in "processing" status
- No error message
- Embeddings partially created (inconsistent state)

**Fix Required:**
- Add overall timeout check (50 seconds to allow cleanup)
- Track processing time
- Mark job as "failed" if timeout exceeded
- Log timeout events

---

### Issue #3: Client-Side API Calls Have No Timeout ⚠️ **HIGH**

**Location:** `src/lib/api.ts:110-180`

**Problem:**
- `triggerTextractJob()` has no timeout
- `fetchJobStatus()` has no timeout
- Client-side polling can hang indefinitely
- No retry logic with backoff

**Impact:**
- UI hangs showing "Registering upload..."
- User cannot cancel or retry
- Browser tab becomes unresponsive

**Fix Required:**
- Add 30-second timeout to `triggerTextractJob()`
- Add 10-second timeout to `fetchJobStatus()`
- Add retry logic with exponential backoff
- Add user-friendly error messages

---

### Issue #4: No Progress Tracking for Large Documents ⚠️ **MEDIUM**

**Problem:**
- No progress updates during embedding generation
- User sees "processing" with no indication of progress
- No way to estimate completion time

**Impact:**
- Poor user experience
- Users think upload is broken
- No way to distinguish between hanging and slow processing

**Fix Required:**
- Add progress updates to job metadata
- Emit progress events to client
- Show progress percentage in UI
- Add estimated time remaining

---

## Recommended Fixes

### Priority 1: Add Timeouts (P0)

1. **Add timeout to `generateEmbeddings()`:**
   ```typescript
   const EMBEDDING_BATCH_TIMEOUT_MS = 30_000; // 30 seconds per batch
   const EMBEDDING_TOTAL_TIMEOUT_MS = 300_000; // 5 minutes total
   ```

2. **Add timeout to textract-worker:**
   ```typescript
   const WORKER_TIMEOUT_MS = 50_000; // 50 seconds (before Supabase timeout)
   ```

3. **Add timeout to client-side API calls:**
   ```typescript
   const TRIGGER_TEXTRACT_TIMEOUT_MS = 30_000;
   const FETCH_STATUS_TIMEOUT_MS = 10_000;
   ```

### Priority 2: Add Progress Tracking (P1)

1. Update job metadata with progress:
   ```typescript
   {
     embedding_progress: {
       total_chunks: 5000,
       processed_chunks: 1250,
       current_batch: 13,
       estimated_seconds_remaining: 45
     }
   }
   ```

2. Emit progress events to client via polling or WebSocket

### Priority 3: Add Graceful Degradation (P1)

1. If embedding generation fails, fall back to legacy prompt injection
2. Mark job as "extracted" (not "indexed") if embeddings fail
3. Allow chat to work with legacy system if vector search unavailable

---

## Testing Plan

### Test Cases

1. **Small Document (< 10 pages)**
   - ✅ Should complete in < 30 seconds
   - ✅ Should show all stages
   - ✅ Should be queryable via RAG

2. **Medium Document (100 pages)**
   - ✅ Should complete in < 2 minutes
   - ✅ Should show progress updates
   - ✅ Should generate ~500 chunks

3. **Large Document (1000 pages)**
   - ⚠️ Should complete in < 10 minutes
   - ⚠️ Should show progress updates
   - ⚠️ Should generate ~5000 chunks
   - ⚠️ Should handle timeouts gracefully

4. **Very Large Document (10,000+ pages)**
   - ⚠️ Should show timeout error
   - ⚠️ Should fall back to legacy system
   - ⚠️ Should not hang indefinitely

---

## Success Criteria

The document upload system is considered fixed when:

1. ✅ Small documents (< 100 pages) process successfully
2. ✅ Large documents (1000+ pages) either complete or show clear timeout error
3. ✅ No indefinite hanging states
4. ✅ Progress updates shown for long-running jobs
5. ✅ Graceful degradation when embeddings fail
6. ✅ User-friendly error messages
7. ✅ RAG pipeline works for successfully indexed documents

---

## Related Files

- `supabase/functions/textract-worker/index.ts` - Main processing function
- `supabase/functions/doc-context/index.ts` - RAG retrieval function
- `supabase/functions/uploads/index.ts` - Upload registration
- `src/lib/api.ts` - Client-side API calls
- `src/components/ui/chat-input.tsx` - Upload UI
- `supabase/migrations/20250201000000_add_vector_rag.sql` - Vector RAG schema

---

## Conclusion

The RAG pipeline is **fully implemented and functional**, but **critical timeout issues** prevent it from working reliably with large documents. The storage protocol is **well-designed** and can handle large knowledge bases, but processing timeouts need to be addressed.

**Immediate Action Required:** Add timeouts to all embedding generation and API calls to prevent indefinite hanging.

