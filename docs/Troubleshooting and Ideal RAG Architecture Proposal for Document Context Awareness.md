# Troubleshooting and Ideal RAG Architecture Proposal for Document Context Awareness

**Author:** Manus AI
**Date:** December 01, 2025
**Context:** Analysis of `mcpmessenger/slashmcp` repository and user-provided screenshot.

## 1. Troubleshooting the Document Context Awareness Issue

The user-provided screenshot illustrates a common workflow issue in asynchronous document processing systems.

### 1.1. Scenario Analysis

| Element | Observation | Conclusion |
| :--- | :--- | :--- |
| **User Query** | "whats market\_niche\_1\_2.csv about" | The user is attempting to query the content of a newly uploaded file. |
| **System Response** | "I currently don't have access to specific files or documents..." | The chat agent is unable to fulfill the request. |
| **Context Inspector Stage** | `STAGE: Uploaded` | The file has been successfully uploaded to S3, but the background processing has not completed. |

### 1.2. Root Cause

Based on the analysis of the `slashmcp` architecture (specifically the `uploads`, `textract-worker`, and `chat` functions), the system follows a sequential job pipeline:

1.  **Registered** (Job created in database)
2.  **Uploaded** (File is in S3)
3.  **Processing** (Worker extracts text/data)
4.  **Extracted** (Processed content is stored in `analysis_results`)
5.  **Injected** (Content is ready for chat context)

The chat agent's logic relies on the processed content being available in the `analysis_results` table, which only happens after the worker completes the **Processing** and **Extracted** stages. Since the file is only in the **Uploaded** stage, the chat function correctly determines that the processed context is not yet available, leading to the "I currently don't have access..." response.

### 1.3. Proposed Solution for Current Architecture

To improve the user experience, the system should implement a **client-side or server-side check** for the job status:

1.  **Client-Side:** The chat interface should visually indicate that the file is still being processed (e.g., "Processing..."). It should also prevent the user from querying the document until the job reaches the **Extracted** or **Injected** stage.
2.  **Server-Side (Chat Function):** The `chat` function should check the job status in the `processing_jobs` table. If the status is `Processing` or `Uploaded`, the LLM should be prompted to inform the user about the delay, rather than stating it has no access. A helpful response would be:
    > "The file `market_niche_1_2.csv` is currently being processed. Please wait a moment, and I will be able to analyze it for you."

---

## 2. Ideal Retrieval-Augmented Generation (RAG) Architecture

The current architecture uses **direct prompt injection** of the entire document (chunked), which is inefficient and limited by the LLM's context window. The ideal solution is to implement a full RAG pipeline using a **Vector Database** for efficient semantic search.

### 2.1. Architectural Components

| Component | Technology/Concept | Role in RAG Pipeline |
| :--- | :--- | :--- |
| **Storage** | AWS S3 | Stores the raw document files. |
| **Text Extraction** | AWS Textract, Custom Parsers (for CSV/JSON) | Extracts raw text from documents. |
| **Embedding Model** | OpenAI `text-embedding-3-small` or similar | Converts text chunks and user queries into high-dimensional vectors. |
| **Vector Database** | Supabase `pgvector` (or Pinecone, Weaviate) | Stores the vector embeddings of document chunks for fast similarity search. |
| **Orchestration** | Supabase Edge Functions (Deno) | Manages the ingestion and retrieval workflow. |
| **LLM** | GPT-4, Claude 3, etc. | Generates the final answer based on the retrieved context. |

### 2.2. The Ideal RAG Workflow

The new architecture introduces a dedicated **Indexing** step and a dynamic **Retrieval** step.

#### A. Ingestion (Indexing) Pipeline

This replaces the simple "Extracted" stage with a more robust indexing process:

1.  **Extraction:** The `textract-worker` extracts the raw text and stores it in `analysis_results`.
2.  **Chunking:** A new worker (or the existing one) chunks the extracted text into smaller, semantically meaningful units (e.g., 256-512 tokens with overlap).
3.  **Embedding:** The worker calls the Embedding Model API to generate a vector for each text chunk.
4.  **Indexing:** The chunk text, its vector, and metadata (source `jobId`, page number, etc.) are stored in the **Vector Database**.
5.  **Status Update:** The job status is updated to **Indexed** (replacing `Injected`).

#### B. Retrieval and Generation (Chat) Pipeline

This is the core of the RAG system, executed every time the user sends a message:

1.  **Query Embedding:** The `chat` function receives the user's query and calls the Embedding Model API to generate a vector for the query.
2.  **Vector Search:** The query vector is sent to the **Vector Database** to perform a **similarity search**. This retrieves the top *K* (e.g., 5-10) most semantically relevant text chunks from the indexed documents.
3.  **Context Construction:** The retrieved text chunks are compiled into a concise `contextBlock`.
4.  **Prompt Augmentation:** The `contextBlock` is injected into the LLM's prompt, along with the user's original query.
5.  **Generation:** The LLM uses the provided context to generate a grounded, factual response.

### 2.3. Benefits of the Ideal RAG Architecture

| Feature | Current Architecture (Prompt Injection) | Ideal RAG Architecture (Vector Search) |
| :--- | :--- | :--- |
| **Scalability** | Limited by LLM context window (e.g., 128k tokens). | Highly scalable; only the most relevant snippets are retrieved, regardless of total document size. |
| **Relevance** | Low. Injects entire document (chunked), diluting the prompt. | High. Retrieves only the semantically most relevant snippets. |
| **Cost/Latency** | High. Large text payloads sent in every API call. | Low. Only the query and a few small, relevant snippets are sent to the LLM. |
| **Search Type** | Keyword/Full-text (if LLM is instructed to search). | **Semantic Search** (understands the *meaning* of the query). |
| **Agent Tooling** | Agents must be explicitly told which document to use. | Agents can use a "Search Document" tool that performs the vector search, making them implicitly document-aware. |

By transitioning to a vector-based RAG architecture, the system can support a virtually unlimited number of documents, provide more accurate and grounded answers, and significantly reduce operational costs and latency.
