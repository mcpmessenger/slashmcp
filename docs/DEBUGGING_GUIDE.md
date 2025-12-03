# Developer Debugging Instructions: slashmcp Integration Issues

**Project:** `mcpmessenger/slashmcp`
**Integration:** Documents & Knowledge Sidebar
**Date:** December 3, 2025

---

## 🎯 Executive Summary

The integration is blocked by a critical **Database Query Timeout (P0)** and a **Textract Worker Failure (P1)**. Our analysis suggests the P0 issue is most likely related to **Row Level Security (RLS) policies** or **missing database indexes**, while the P1 issue is a classic **CORS configuration error** in the Supabase Edge Function.

The following instructions provide a prioritized, step-by-step guide to debug and resolve these critical issues.

---

## 1. P0: Database Query Timeout Resolution

The persistent 10-second timeout on the query to the `processing_jobs` table is the most critical blocker. The query is: `SELECT * FROM processing_jobs WHERE user_id = ? AND analysis_target = 'document-analysis'`.

### 1.1. Priority 1: Verify Row Level Security (RLS) Policy

A misconfigured RLS policy can cause a query to hang indefinitely or time out, as the database may be waiting for an unfulfilled condition.

| Step | Action | Expected Outcome |
| :--- | :--- | :--- |
| **1.1.1** | Navigate to your Supabase Dashboard, go to **Database** -> **SQL Editor**. | |
| **1.1.2** | Run the RLS policy check command: | |
| | ```sql\nSELECT\n  schemaname,\n  tablename,\n  policyname,\n  permissive,\n  roles,\n  cmd,\n  qual,\n  with_check\nFROM pg_policies\nWHERE tablename = 'processing_jobs';\n``` | |
| **1.1.3** | **CRITICAL CHECK:** Examine the policy for `cmd = 'SELECT'` and `roles = '{authenticated}'`. The `qual` (USING expression) **MUST** contain the condition: `auth.uid() = user_id`. | The policy should explicitly allow `SELECT` for authenticated users where the row's `user_id` matches the session's `auth.uid()`. |
| **1.1.4** | **If RLS is the issue:** Fix the policy to ensure authenticated users can only select their own rows. | |
| **1.1.5** | **Test Bypass:** To confirm RLS is the cause, run the query using the Supabase **Service Role Key** (which bypasses RLS). If the query succeeds instantly, RLS is the root cause. | |

### 1.2. Priority 2: Check Database Indexes

If the RLS policy is correct, the timeout is likely a performance issue due to a missing index.

| Step | Action | Expected Outcome |
| :--- | :--- | :--- |
| **1.2.1** | In the Supabase SQL Editor, run an `EXPLAIN ANALYZE` on the query with a known `user_id`: | |
| | ```sql\nEXPLAIN ANALYZE\nSELECT\n  id,\n  file_name,\n  status,\n  metadata->>'job_stage' as stage,\n  created_at\nFROM processing_jobs\nWHERE user_id = 'USER_ID'\n  AND analysis_target = 'document-analysis'\nORDER BY created_at DESC\nLIMIT 50;\n``` | |
| **1.2.2** | **CRITICAL CHECK:** The execution plan should show an **Index Scan** or **Bitmap Index Scan** on the `user_id` and `analysis_target` columns. If it shows a **Sequential Scan**, an index is missing. | |
| **1.2.3** | **If Index is missing:** Create a composite index on the filtered columns to drastically improve query time: | |
| | ```sql\nCREATE INDEX ON processing_jobs (user_id, analysis_target);\n``` | Query time should drop to milliseconds. |

---

## 2. P1: Textract Worker Failure Resolution

The "Failed to fetch" error on the `/functions/v1/textract-worker` endpoint is a strong indicator of a **Cross-Origin Resource Sharing (CORS)** issue, which is common when calling Supabase Edge Functions from a web application.

### 2.1. Priority 1: Fix CORS Headers in Edge Function

The Edge Function must correctly handle the browser's preflight `OPTIONS` request and include the necessary CORS headers in the response.

| Step | Action | Expected Outcome |
| :--- | :--- | :--- |
| **2.1.1** | Open the worker function file: `supabase/functions/textract-worker/index.ts`. | |
| **2.1.2** | Ensure the function handles the `OPTIONS` preflight request by returning a 204 response with the correct headers. | The preflight request should succeed, allowing the subsequent `POST` request. |
| **2.1.3** | Verify the `Response` headers for the main `POST` request include: | |
| | ```typescript\n{\n  'Access-Control-Allow-Origin': '*',\n  'Access-Control-Allow-Methods': 'POST, OPTIONS',\n  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',\n}\n``` | The browser should accept the response and not throw a CORS error. |
| **2.1.4** | **Test Manually:** Use a tool like `curl` or a browser extension to send an `OPTIONS` request to the function URL to confirm the headers are present. | |

### 2.2. Priority 2: Verify Function Deployment

Confirm the function is actually deployed and running.

| Step | Action | Expected Outcome |
| :--- | :--- | :--- |
| **2.2.1** | Navigate to your Supabase Dashboard, go to **Edge Functions**. | |
| **2.2.2** | Verify that `textract-worker` is listed, deployed, and has a green "Active" status. | |
| **2.2.3** | Check the function logs for any immediate startup errors or unhandled exceptions that would prevent it from responding to requests. | |

---

## 3. P2: Orchestrator RAG Routing Improvement

The orchestrator's failure to use the RAG tools (`search_documents`, etc.) for document-related queries is a prompt engineering issue that degrades the user experience.

### 3.1. Recommendation: Strengthen Agent Instructions and Test Classification

The solution lies in making the orchestrator's system prompt more explicit and robust.

| Step | Action | Rationale |
| :--- | :--- | :--- |
| **3.1.1** | **Enhance System Prompt:** In `supabase/functions/_shared/orchestration/agents.ts`, strengthen the instructions for the orchestrator/query classifier. | Explicitly instruct the LLM to prioritize the document tools when the query contains keywords like "document," "file," "upload," "my files," or "what I uploaded." |
| **3.1.2** | **Add Negative Examples:** Include a few-shot example in the prompt where a query *should* use the document tools, and one where it *should not* (e.g., a general web query). | This helps the LLM better distinguish between the two types of intent. |
| **3.1.3** | **Test Edge Cases:** Test the classifier with various phrasings, including: "What's in my document?", "Search my files for X," "Tell me about the PDF I uploaded," and "Do I have a document about Y?" | Ensure the classifier is robust against different user language patterns. |

---

## 4. Summary of Immediate Actions

The following table summarizes the most critical, high-impact actions to take immediately:

| Issue | Root Cause (Hypothesis) | Immediate Action | File/Location |
| :--- | :--- | :--- | :--- |
| **P0 Query Timeout** | RLS Policy Misconfiguration | **Verify and fix RLS policy** on `processing_jobs` table. | Supabase SQL Editor |
| **P0 Query Timeout** | Missing Index | **Create composite index** on `(user_id, analysis_target)`. | Supabase SQL Editor |
| **P1 Worker Failure** | CORS Configuration Error | **Add/correct CORS headers** and handle `OPTIONS` preflight. | `supabase/functions/textract-worker/index.ts` |
| **P2 RAG Routing** | Weak Agent Instructions | **Strengthen system prompt** for document query classification. | `supabase/functions/_shared/orchestration/agents.ts` |

[1]: https://github.com/mcpmessenger/slashmcp "GitHub Repository: mcpmessenger/slashmcp"
[2]: /home/ubuntu/upload/CURRENT_CHALLENGES.md "CURRENT_CHALLENGES.md"
