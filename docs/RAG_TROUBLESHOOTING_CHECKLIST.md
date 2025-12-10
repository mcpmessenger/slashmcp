# RAG Troubleshooting Checklist

**Based on:** `docs/RAG Troubleshooting Report.md`  
**Date:** December 9, 2025  
**Issue:** Uploaded documents are not being used in chat context

## Quick Diagnosis Steps

### Step 1: Verify Supabase Function Secrets

The RAG pipeline requires these environment variables to be set as **Supabase Edge Function Secrets**:

#### Required Secrets Checklist

| Secret Name | Purpose | How to Check |
|------------|---------|--------------|
| `PROJECT_URL` or `SUPABASE_URL` | Base URL for Supabase project | Used to construct `DOC_CONTEXT_URL` |
| `SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Service role key for database access | Required for vector search and RPC calls |
| `OPENAI_API_KEY` | OpenAI API key for embeddings | Required by `doc-context` function |

#### Check Current Secrets

**Using Supabase CLI:**
```powershell
# List all secrets
supabase secrets list --project-ref akxdroedpsvmckvqvggr
```

**Using Supabase Dashboard:**
1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr
2. Navigate to: **Edge Functions** → **Settings** → **Secrets**
3. Verify each secret exists and has a value

#### Set Missing Secrets

**Using Supabase CLI:**
```powershell
# Set PROJECT_URL (if not already set)
supabase secrets set PROJECT_URL=https://akxdroedpsvmckvqvggr.supabase.co --project-ref akxdroedpsvmckvqvggr

# Set SERVICE_ROLE_KEY (get from Supabase Dashboard → Settings → API)
supabase secrets set SERVICE_ROLE_KEY=your-service-role-key-here --project-ref akxdroedpsvmckvqvggr

# Set OPENAI_API_KEY
supabase secrets set OPENAI_API_KEY=your-openai-api-key-here --project-ref akxdroedpsvmckvqvggr
```

**Using Supabase Dashboard:**
1. Go to: **Edge Functions** → **Settings** → **Secrets**
2. Click **"Add new secret"** for each missing secret
3. Enter the key name and value
4. Click **"Save"**

### Step 2: Verify Database Setup

#### Check if `pg_vector` Extension is Enabled

**Using Supabase Dashboard:**
1. Go to: **Database** → **Extensions**
2. Search for `vector` or `pgvector`
3. Verify it shows as **"Enabled"**

**Using SQL Editor:**
```sql
-- Check if vector extension exists
SELECT * FROM pg_extension WHERE extname = 'vector';

-- If not enabled, enable it:
CREATE EXTENSION IF NOT EXISTS vector;
```

#### Verify `document_embeddings` Table Exists

```sql
-- Check if table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'document_embeddings';

-- Check if search function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'search_document_embeddings';
```

### Step 3: Check Edge Function Logs

The most direct way to diagnose the issue is to check runtime logs.

#### View Chat Function Logs

**Using Supabase Dashboard:**
1. Go to: **Edge Functions** → **chat**
2. Click **"Logs"** tab
3. Look for errors after attempting a chat query with an uploaded document

**Using Supabase CLI:**
```powershell
# View recent logs for chat function
supabase functions logs chat --project-ref akxdroedpsvmckvqvggr --limit 50
```

#### View Doc-Context Function Logs

**Using Supabase Dashboard:**
1. Go to: **Edge Functions** → **doc-context**
2. Click **"Logs"** tab
3. Look for errors after attempting a chat query

**Using Supabase CLI:**
```powershell
# View recent logs for doc-context function
supabase functions logs doc-context --project-ref akxdroedpsvmckvqvggr --limit 50
```

#### Expected Error Patterns

**In `chat` function logs, look for:**
- ⚠️ `"Document context provided but DOC_CONTEXT_URL is not configured"` → Missing `PROJECT_URL` or `SUPABASE_URL` secret
- ❌ `"fetch failed"` or `"500 Internal Server Error"` → `doc-context` function is failing
- ❌ `"Document context request timed out"` → `doc-context` function is taking too long (>30 seconds)

**In `doc-context` function logs, look for:**
- ❌ `"OpenAI API error: 401"` or `"Invalid API Key"` → Missing or invalid `OPENAI_API_KEY`
- ❌ `"relation 'document_embeddings' does not exist"` → Migration not applied
- ❌ `"function search_document_embeddings does not exist"` → Migration not applied
- ❌ `"Server not configured"` → Missing `SUPABASE_URL` or `SERVICE_ROLE_KEY`

### Step 4: Verify Code Logic

The code constructs `DOC_CONTEXT_URL` from `PROJECT_URL`:

```40:40:supabase/functions/chat/index.ts
const DOC_CONTEXT_URL = NORMALIZED_PROJECT_URL ? `${NORMALIZED_PROJECT_URL}/functions/v1/doc-context` : "";
```

**Expected URL format:**
- `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/doc-context`

**If `DOC_CONTEXT_URL` is empty:**
- The warning at line 354 will be logged
- RAG context will be skipped
- Chat will proceed without document context

### Step 5: Test the RAG Pipeline

#### Test Document Upload and Processing

1. **Upload a document** through the UI
2. **Wait for processing** to complete (check job status)
3. **Check if embeddings were created:**

```sql
-- Check if embeddings exist for a specific job
SELECT COUNT(*) as embedding_count, job_id
FROM document_embeddings
GROUP BY job_id;

-- Check a specific job's embeddings
SELECT job_id, chunk_index, LEFT(chunk_text, 100) as chunk_preview
FROM document_embeddings
WHERE job_id = 'your-job-id-here'
ORDER BY chunk_index
LIMIT 5;
```

#### Test Chat with Document Context

1. **Send a chat message** that references the uploaded document
2. **Check browser console** for any errors
3. **Check Edge Function logs** (see Step 3)
4. **Verify the response** includes document context

### Step 6: Common Issues and Fixes

#### Issue: "DOC_CONTEXT_URL is not configured"

**Symptom:** Warning in chat logs: `"Document context provided but DOC_CONTEXT_URL is not configured"`

**Fix:**
```powershell
# Set PROJECT_URL secret
supabase secrets set PROJECT_URL=https://akxdroedpsvmckvqvggr.supabase.co --project-ref akxdroedpsvmckvqvggr
```

#### Issue: "OpenAI API error: 401"

**Symptom:** Error in doc-context logs about invalid API key

**Fix:**
```powershell
# Set OPENAI_API_KEY secret
supabase secrets set OPENAI_API_KEY=sk-... --project-ref akxdroedpsvmckvqvggr
```

#### Issue: "relation 'document_embeddings' does not exist"

**Symptom:** Error in doc-context logs about missing table

**Fix:**
```powershell
# Apply the migration
supabase db push --project-ref akxdroedpsvmckvqvggr

# Or manually run the migration SQL
# See: supabase/migrations/20250201000000_add_vector_rag.sql
```

#### Issue: "Document context request timed out"

**Symptom:** Chat logs show timeout after 30 seconds

**Possible causes:**
- OpenAI API is slow or rate-limited
- Database query is slow (missing indexes)
- Network issues

**Fix:**
- Check OpenAI API status
- Verify database indexes exist (see migration file)
- Check network connectivity

### Step 7: Verification Checklist

After applying fixes, verify:

- [ ] All required secrets are set (`PROJECT_URL`, `SERVICE_ROLE_KEY`, `OPENAI_API_KEY`)
- [ ] `pg_vector` extension is enabled
- [ ] `document_embeddings` table exists
- [ ] `search_document_embeddings` function exists
- [ ] No errors in Edge Function logs
- [ ] Document uploads create embeddings
- [ ] Chat queries with documents return relevant context

## Quick Test Script

Run this PowerShell script to check configuration:

```powershell
# Check secrets
Write-Host "Checking Supabase secrets..." -ForegroundColor Cyan
supabase secrets list --project-ref akxdroedpsvmckvqvggr

# Check recent logs
Write-Host "`nChecking chat function logs..." -ForegroundColor Cyan
supabase functions logs chat --project-ref akxdroedpsvmckvqvggr --limit 10

Write-Host "`nChecking doc-context function logs..." -ForegroundColor Cyan
supabase functions logs doc-context --project-ref akxdroedpsvmckvqvggr --limit 10
```

## Next Steps

If all checks pass but RAG still doesn't work:

1. **Check the frontend** - Verify `documentContext` is being sent in chat requests
2. **Check job status** - Ensure documents are fully processed (stage: "indexed" or "injected")
3. **Check embeddings** - Verify embeddings were actually created for uploaded documents
4. **Review error logs** - Look for specific error messages in both functions

## Related Documentation

- `docs/RAG Troubleshooting Report.md` - Original analysis
- `supabase/migrations/20250201000000_add_vector_rag.sql` - Database migration
- `supabase/functions/chat/index.ts` - Chat function (orchestrator)
- `supabase/functions/doc-context/index.ts` - RAG function (vector search)

