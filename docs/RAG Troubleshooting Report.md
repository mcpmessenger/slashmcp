# MCP Messenger RAG Troubleshooting Report

**Date:** December 9, 2025
**Project:** MCP Messenger (slashmcp)
**Goal:** Troubleshoot RAG context issue where uploaded documents are not used in chat.

## Executive Summary

The issue where the chat application is not aware of the context from uploaded documents is most likely due to a **misconfiguration of environment variables** within the Supabase Edge Functions environment. The code logic for RAG (Retrieval-Augmented Generation) is present in the repository, but its execution is dependent on several critical secrets and URLs being correctly set.

The primary failure point is hypothesized to be the communication between the main `chat` function and the dedicated `doc-context` RAG function, or a failure within the `doc-context` function itself due to missing API keys or database setup.

## Technical Findings from Code Review

The RAG pipeline is implemented across two main Supabase Edge Functions: `chat` and `doc-context`.

### 1. `supabase/functions/chat/index.ts` (The Orchestrator)

This function handles the incoming chat request and orchestrates the RAG process.

| Code Section | Description | Critical Dependency |
| :--- | :--- | :--- |
| **Lines 347-355** | Checks for document context references (`documentContextRefs`) in the request body. | **`DOC_CONTEXT_URL`** environment variable. |
| **Line 354** | Logs a warning if document context is provided but `DOC_CONTEXT_URL` is not configured. | **`DOC_CONTEXT_URL`** |
| **Lines 465-473** | Invokes the RAG function via a `fetch` call to `DOC_CONTEXT_URL`. | **`SUPABASE_SERVICE_ROLE_KEY`** for authorization. |

**Key Finding:** If the `DOC_CONTEXT_URL` is not correctly set in the Supabase function secrets, the RAG logic will be bypassed, leading directly to the reported issue. The URL is constructed from the project's base URL: `\${NORMALIZED_PROJECT_URL}/functions/v1/doc-context`.

### 2. `supabase/functions/doc-context/index.ts` (The RAG Engine)

This function is responsible for generating embeddings and performing the vector search.

| Code Section | Description | Critical Dependency |
| :--- | :--- | :--- |
| **Lines 11-14** | Initializes the Supabase client and extracts necessary keys. | **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`**, and **`OPENAI_API_KEY`**. |
| **Lines 26-50** | Generates the query embedding using the OpenAI API. | **`OPENAI_API_KEY`** |
| **Lines 170-180** | Performs the vector search against the database. | **`pg_vector`** extension enabled in the Supabase database. |

**Key Finding:** A failure in this function (e.g., due to a missing `OPENAI_API_KEY` or a database error from a missing `pg_vector` extension) would cause the `fetch` call in the `chat` function to fail, resulting in the RAG context not being injected.

## Troubleshooting Recommendations

Based on the code review, the troubleshooting should focus on the backend configuration and logging.

### Recommendation 1: Verify Supabase Function Secrets

The user must ensure the following environment variables are correctly set as **Supabase Function Secrets** for the project, as they are required by the `chat` and `doc-context` functions:

| Environment Variable | Purpose | Location to Check |
| :--- | :--- | :--- |
| **`SUPABASE_URL`** | Base URL for the Supabase project. | Supabase Project Settings / API |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Key for elevated database access (required for vector search). | Supabase Project Settings / API |
| **`OPENAI_API_KEY`** | Required by `doc-context` to generate vector embeddings. | Supabase Project Settings / Secrets |
| **`DOC_CONTEXT_URL`** | The full URL for the `doc-context` function. | Should be automatically derived, but verify the base URL is correct. |

### Recommendation 2: Check Supabase Database Setup

The vector search functionality relies on a specific PostgreSQL extension.

*   **Action:** Confirm that the **`pg_vector`** extension is enabled in the Supabase database.
*   **Location:** Supabase Dashboard -> Database -> Extensions.

### Recommendation 3: Review Supabase Edge Function Logs

The most direct way to diagnose the issue is to check the runtime logs for the two functions.

*   **Action:** Check the logs for the **`chat`** and **`doc-context`** functions immediately after attempting a chat query with an uploaded document.
*   **Expected Errors to Look For:**
    *   **`chat` logs:** Look for the warning: `"Document context provided but DOC_CONTEXT_URL is not configured"` (indicating a missing URL) or errors related to the `fetch` call (e.g., "500 Internal Server Error" or "fetch failed").
    *   **`doc-context` logs:** Look for errors related to the OpenAI API (e.g., "Invalid API Key") or database errors (e.g., "relation 'vectors' does not exist" if `pg_vector` is not set up).

By systematically checking these configuration points and reviewing the function logs, the root cause of the RAG failure can be quickly identified and resolved.
