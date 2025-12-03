# RAG Integration Guide for slashmcp

This document outlines the changes and new components introduced to integrate **Retrieval-Augmented Generation (RAG)** capabilities for semantic document search into the existing `slashmcp` application. The new functionality allows users to upload documents, which are then processed, chunked, and indexed for semantic search, enabling RAG-powered question-answering over the uploaded content.

## 1. Architectural Overview

The RAG system is built using a serverless architecture leveraging **Supabase** for the backend (PostgreSQL with `pgvector`, Storage, and Edge Functions) and **OpenAI** for embedding generation.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | React/TypeScript | Handles file upload, job status polling, and initiates semantic search queries. |
| **Storage** | Supabase Storage | Securely stores the raw uploaded documents. |
| **Database** | Supabase PostgreSQL (`pgvector`) | Stores document processing jobs and vector embeddings (`document_embeddings` table). |
| **RPC Function** | `start_document_processing` (SQL) | Initiates a new processing job, records it in the `processing_jobs` table, and returns a job ID. |
| **Edge Function (Worker)** | `process-document` (Deno/TypeScript) | Triggered by a worker (or webhook/database trigger), it fetches the document, chunks the text, generates embeddings using OpenAI, and inserts them into the `document_embeddings` table. |
| **Edge Function (Search)** | `search-documents` (Deno/TypeScript) | Receives a user query, generates an embedding for the query, performs a vector similarity search using the `search_document_embeddings` SQL function, and returns relevant text chunks. |
| **RAG Logic** | Frontend/LLM Service | The frontend (or a dedicated LLM service) combines the user query with the retrieved text chunks to form a final prompt for the LLM (simulated in the current implementation). |

## 2. Database Migrations (Supabase)

Two new migration files were created to support the RAG feature.

### 2.1. `20251202000000_add_file_path_to_processing_jobs.sql`

This migration adds a column to track the location of the uploaded file and updates RLS policies.

```sql
-- Add file_path column to processing_jobs table
alter table processing_jobs
add column file_path text;

-- Optional: Add a policy to allow users to update their own job status/file_path
create policy "Users can update their own processing jobs"
on processing_jobs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

### 2.2. `20251202000001_create_start_document_processing_rpc.sql`

This migration creates an RPC function to start the document processing workflow from the client.

```sql
-- RPC function to start document processing
create or replace function start_document_processing(
  file_path text,
  user_id uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
  new_job_id uuid;
begin
  -- 1. Insert a new job into processing_jobs table
  insert into processing_jobs (user_id, status, file_path)
  values (user_id, 'pending', file_path)
  returning id into new_job_id;

  -- 2. The actual trigger mechanism for the 'process-document' Edge Function
  --    is assumed to be handled by a separate worker or a database trigger
  --    listening for new 'pending' jobs.

  return new_job_id;
end;
$$;

-- Grant execution to authenticated users
grant execute on function start_document_processing(text, uuid) to authenticated;
```

**Action Required:** Run these migrations against your Supabase database.

## 3. Supabase Edge Functions

Two new Edge Functions were created in the `supabase/functions` directory.

### 3.1. `process-document` (`supabase/functions/process-document/index.ts`)

This function handles the core RAG indexing pipeline: file fetching (simulated), text chunking (using `langchain`'s `RecursiveCharacterTextSplitter`), embedding generation (using OpenAI's `text-embedding-3-small`), and insertion into the `document_embeddings` table.

**Key Dependencies:**
- `https://esm.sh/@supabase/supabase-js@2.80.0`
- `https://esm.sh/openai@4.52.7`
- `https://esm.sh/langchain/text_splitter`

**Action Required:** Deploy this function to your Supabase project.

### 3.2. `search-documents` (`supabase/functions/search-documents/index.ts`)

This function is called by the frontend to perform semantic search. It generates an embedding for the user's query and calls the existing `search_document_embeddings` PostgreSQL function to retrieve relevant chunks.

**Action Required:** Deploy this function to your Supabase project.

## 4. Frontend Implementation

The frontend changes involve a new service layer and two new React components.

### 4.1. RAG Service (`src/lib/ragService.ts`)

This file contains the core client-side logic for the RAG feature:
- `uploadAndProcessDocument`: Uploads the file to Supabase Storage and calls the `start_document_processing` RPC.
- `searchDocuments`: Calls the `search-documents` Edge Function to perform the vector search.
- `getJobStatus`: Polls the `processing_jobs` table for the status of a document.

### 4.2. New Components

| Component | File Path | Description |
| :--- | :--- | :--- |
| `DocumentUpload` | `src/components/DocumentUpload.tsx` | A UI component for selecting a file, uploading it, and displaying the processing job status via polling. |
| `SemanticSearchChat` | `src/components/SemanticSearchChat.tsx` | A UI component for the RAG-powered semantic search. It takes a query, calls `searchDocuments`, and simulates the final RAG response by combining the query and retrieved context. **Note:** The actual LLM call for RAG is currently simulated and should be replaced with a real API call to your LLM service. |

### 4.3. Integration (`src/pages/Index.tsx`)

The new components were integrated into the main chat page (`src/pages/Index.tsx`) to sit alongside the existing chat interface, fulfilling the requirement to maintain the existing chat functionality.

```tsx
// Inside src/pages/Index.tsx, within the main content area:
<div className="max-w-4xl mx-auto space-y-6">
    {/* New RAG Components */}
    <DocumentUpload />
    <SemanticSearchChat />
    {/* End New RAG Components */}
    {/* Existing chat content follows... */}
    ...
</div>
```

## 5. Setup and Deployment Instructions

To fully deploy this RAG capability, follow these steps:

1.  **Clone and Install:** Ensure you have the updated codebase and run `pnpm install` (or `npm install`) in the project root.
2.  **Supabase Setup:**
    *   Create a new Storage Bucket named `documents`.
    *   Run the new database migrations:
        ```bash
        # Assuming you have the Supabase CLI installed and configured
        supabase migration up
        ```
    *   Deploy the Edge Functions:
        ```bash
        supabase functions deploy process-document --no-verify-jwt
        supabase functions deploy search-documents --no-verify-jwt
        ```
3.  **Environment Variables:** Ensure your Supabase project has the necessary secrets configured for the Edge Functions, including:
    *   `OPENAI_API_KEY`
    *   `SUPABASE_URL`
    *   `SUPABASE_SERVICE_ROLE_KEY` (for `process-document`)
    *   `SUPABASE_ANON_KEY` (for `search-documents`)
4.  **Worker/Trigger Setup (Crucial):** The `start_document_processing` RPC only creates a job with status 'pending'. You must set up a mechanism to trigger the `process-document` Edge Function when a new 'pending' job is created in the `processing_jobs` table. This can be done via:
    *   A **Supabase Database Webhook** listening for `INSERT` events on `processing_jobs` where `status` is 'pending', which then calls the `process-document` function's URL.
    *   A **dedicated worker service** that polls the `processing_jobs` table for 'pending' jobs and calls the function.
5.  **Frontend Development:** Run the application locally with `npm run dev` and test the new upload and search components.

## 6. Next Steps for Production

1.  **Implement Document Parsing:** The `process-document` function currently uses a placeholder for document content. Replace the `getDocumentContent` function with logic to fetch the file from Supabase Storage and parse its content (e.g., using a library for PDF/DOCX parsing).
2.  **Real RAG LLM Call:** Replace the simulated RAG response in `SemanticSearchChat.tsx` with a real API call to your LLM service, passing the retrieved context chunks and the user query.
3.  **Error Handling:** Enhance error handling and user feedback, especially for the asynchronous job processing.
4.  **Security:** Review the RLS policies and ensure the Edge Functions are secured appropriately (e.g., using JWT verification instead of `--no-verify-jwt` in production).

---
*Document prepared by Manus AI*
