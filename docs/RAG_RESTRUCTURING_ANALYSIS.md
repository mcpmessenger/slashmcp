# RAG Restructuring Analysis

**Date:** January 2025  
**Status:** 📋 Analysis Complete - Integration Plan Needed

---

## Executive Summary

The **"Restructuring App with RAG for Semantic Document Search"** folder contains a comprehensive RAG implementation plan. However, the codebase **already has a working RAG pipeline** with a different architecture. This document analyzes the differences and provides integration recommendations.

---

## Current Implementation vs. Restructuring Proposal

### Architecture Comparison

| Component | Current Implementation | Restructuring Proposal | Status |
|-----------|----------------------|------------------------|--------|
| **Vector Database** | ✅ `document_embeddings` table (pgvector) | ✅ Same | ✅ Already exists |
| **Text Extraction** | ✅ `textract-worker` Edge Function | ❌ `process-document` Edge Function | ⚠️ Different approach |
| **Vector Search** | ✅ `doc-context` Edge Function | ❌ `search-documents` Edge Function | ⚠️ Different approach |
| **Frontend Components** | ❌ Missing (referenced but not implemented) | ✅ `DocumentUpload.tsx`, `SemanticSearchChat.tsx` | 🔴 Need to integrate |
| **RAG Service** | ❌ Missing | ✅ `ragService.ts` | 🔴 Need to integrate |
| **Storage** | ✅ AWS S3 (via `uploads` function) | ✅ Supabase Storage | ⚠️ Different approach |
| **RPC Function** | ❌ Not used | ✅ `start_document_processing` | ⚠️ Different workflow |

---

## Detailed Component Analysis

### 1. Database Migrations

#### ✅ Already Applied
- `20250201000000_add_vector_rag.sql` - Creates `document_embeddings` table with pgvector
- `search_document_embeddings` PostgreSQL function exists

#### 📋 From Restructuring Folder (Not Applied)
- `20251202000000_add_file_path_to_processing_jobs.sql` - Adds `file_path` column
- `20251202000001_create_start_document_processing_rpc.sql` - Creates RPC function

**Status:** The restructuring migrations assume a different workflow. The current implementation uses `storage_path` instead of `file_path` and doesn't use the `start_document_processing` RPC.

---

### 2. Edge Functions

#### Current Implementation

**`textract-worker`** (Existing)
- Handles text extraction from AWS S3
- Generates embeddings using OpenAI
- Stores embeddings in `document_embeddings` table
- Updates job metadata with stages: `registered` → `processing` → `extracted` → `indexed`

**`doc-context`** (Existing)
- Performs vector similarity search
- Uses `search_document_embeddings` PostgreSQL function
- Returns relevant chunks for chat context
- Supports both vector and legacy text search

#### Restructuring Proposal

**`process-document`** (Not Implemented)
- Would fetch documents from Supabase Storage
- Uses LangChain's `RecursiveCharacterTextSplitter`
- Generates embeddings and stores them
- **Note:** This duplicates functionality already in `textract-worker`

**`search-documents`** (Not Implemented)
- Generates query embeddings
- Calls `search_document_embeddings` function
- Returns chunks
- **Note:** This duplicates functionality already in `doc-context`

**Recommendation:** The existing Edge Functions already provide the same functionality. The restructuring proposal would create duplicate functions with a different storage backend (Supabase Storage vs AWS S3).

---

### 3. Frontend Components

#### Current Status

**`Index.tsx`** (Line 507-509)
```tsx
{/* New RAG Components */}
<DocumentUpload />
<SemanticSearchChat />
{/* End New RAG Components */}
```

**Problem:** These components are referenced but **don't exist** in `src/components/`. They only exist in the docs folder.

#### Restructuring Folder Components

**`DocumentUpload.tsx`**
- File upload UI
- Uses Supabase Storage (different from current AWS S3 approach)
- Calls `start_document_processing` RPC (doesn't exist in current implementation)
- Polls job status

**`SemanticSearchChat.tsx`**
- Search query input
- Calls `search-documents` Edge Function (doesn't exist)
- Displays RAG response (currently simulated)
- Shows retrieved chunks

**Status:** 🔴 **Critical** - These components need to be integrated but must be adapted to work with the existing architecture.

---

### 4. RAG Service Layer

#### Current Implementation
- ❌ No dedicated RAG service
- Document context is handled in `src/lib/api.ts` via `fetchJobStatus`
- Chat function (`supabase/functions/chat/index.ts`) handles document context retrieval

#### Restructuring Proposal
- ✅ `ragService.ts` provides:
  - `uploadAndProcessDocument()` - Uploads to Supabase Storage + starts processing
  - `searchDocuments()` - Calls `search-documents` Edge Function
  - `getJobStatus()` - Polls job status

**Status:** The restructuring service needs to be adapted to work with:
- AWS S3 storage (not Supabase Storage)
- Existing `uploads` Edge Function (not `start_document_processing` RPC)
- Existing `doc-context` Edge Function (not `search-documents`)

---

## Integration Plan

### Option 1: Adapt Restructuring Components to Current Architecture (Recommended)

**Pros:**
- Maintains existing working infrastructure
- Minimal changes to backend
- Reuses proven AWS S3 + Textract pipeline

**Steps:**
1. ✅ Copy `DocumentUpload.tsx` and `SemanticSearchChat.tsx` to `src/components/`
2. ✅ Create `src/lib/ragService.ts` adapted for current architecture
3. ✅ Update components to use:
   - `src/lib/api.ts` upload functions (instead of Supabase Storage)
   - `doc-context` Edge Function (instead of `search-documents`)
   - Existing job status polling
4. ✅ Remove references to `start_document_processing` RPC
5. ✅ Update `DocumentUpload` to work with AWS S3 presigned URLs

---

### Option 2: Migrate to Restructuring Architecture

**Pros:**
- Cleaner separation of concerns
- Uses Supabase Storage (simpler than AWS S3)
- More explicit RAG workflow

**Cons:**
- Requires rewriting `textract-worker` as `process-document`
- Requires rewriting `doc-context` as `search-documents`
- Need to migrate from AWS S3 to Supabase Storage
- More disruptive changes

**Steps:**
1. Apply restructuring migrations
2. Create `process-document` Edge Function
3. Create `search-documents` Edge Function
4. Migrate storage from AWS S3 to Supabase Storage
5. Update frontend to use new functions
6. Test thoroughly

---

## Recommended Approach

**Go with Option 1** - Adapt the frontend components to work with the existing backend.

### Why?
1. ✅ Backend is already working and tested
2. ✅ AWS S3 + Textract is more robust for document processing
3. ✅ Less risk of breaking existing functionality
4. ✅ Faster implementation

### Implementation Checklist

- [ ] Copy `DocumentUpload.tsx` to `src/components/DocumentUpload.tsx`
- [ ] Copy `SemanticSearchChat.tsx` to `src/components/SemanticSearchChat.tsx`
- [ ] Create `src/lib/ragService.ts` adapted for current architecture:
  - Use existing `uploads` API instead of Supabase Storage
  - Use `doc-context` Edge Function instead of `search-documents`
  - Use existing job status polling
- [ ] Update `DocumentUpload` component:
  - Remove Supabase Storage upload logic
  - Use existing file upload flow from `ChatInput` or `api.ts`
  - Remove `start_document_processing` RPC call
  - Use existing job status tracking
- [ ] Update `SemanticSearchChat` component:
  - Change `search-documents` to `doc-context` Edge Function
  - Update request/response format to match `doc-context` API
  - Integrate with existing chat context system
- [ ] Test document upload and search flow
- [ ] Verify components work with existing authentication

---

## Key Differences Summary

| Aspect | Current | Restructuring | Decision |
|--------|---------|---------------|----------|
| **Storage** | AWS S3 | Supabase Storage | Keep AWS S3 |
| **Upload Flow** | `uploads` Edge Function | `start_document_processing` RPC | Keep `uploads` |
| **Processing** | `textract-worker` | `process-document` | Keep `textract-worker` |
| **Search** | `doc-context` | `search-documents` | Keep `doc-context` |
| **Frontend** | Missing components | Complete components | ✅ Integrate (adapted) |

---

## Next Steps

1. **Review this analysis** with the team
2. **Decide on approach** (Option 1 recommended)
3. **Create adapted components** based on restructuring folder
4. **Test integration** with existing backend
5. **Deploy** frontend changes

---

*Analysis completed: January 2025*

