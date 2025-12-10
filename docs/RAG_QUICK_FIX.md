# RAG Quick Fix Guide

**Problem:** Uploaded documents are not being used in chat context.

## 🚀 Quick Fix (5 minutes)

### Step 1: Run Diagnostic Script

```powershell
cd C:\Users\senti\OneDrive\Desktop\SlashMCP
powershell -ExecutionPolicy Bypass -File scripts\check-rag-config.ps1
```

This will check:
- ✅ Required secrets are set
- ✅ Edge Function logs for errors
- ✅ Configuration issues

### Step 2: Fix Missing Secrets

If the script reports missing secrets, set them:

```powershell
# Set PROJECT_URL (required)
supabase secrets set PROJECT_URL=https://akxdroedpsvmckvqvggr.supabase.co --project-ref akxdroedpsvmckvqvggr

# Set SERVICE_ROLE_KEY (required - get from Supabase Dashboard → Settings → API)
supabase secrets set SERVICE_ROLE_KEY=your-service-role-key --project-ref akxdroedpsvmckvqvggr

# Set OPENAI_API_KEY (required)
supabase secrets set OPENAI_API_KEY=sk-your-openai-key --project-ref akxdroedpsvmckvqvggr
```

### Step 3: Verify Database Setup

Check if `pg_vector` extension is enabled:

1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr
2. Navigate to: **Database** → **Extensions**
3. Search for `vector` - should show **"Enabled"**

If not enabled, run this SQL in the SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Step 4: Check Logs

After uploading a document and trying to chat:

**Chat function logs:**
```powershell
supabase functions logs chat --project-ref akxdroedpsvmckvqvggr --limit 20
```

**Doc-context function logs:**
```powershell
supabase functions logs doc-context --project-ref akxdroedpsvmckvqvggr --limit 20
```

## 🔍 Common Issues

### Issue: "DOC_CONTEXT_URL is not configured"

**Fix:** Set `PROJECT_URL` secret (see Step 2 above)

### Issue: "OpenAI API error: 401"

**Fix:** Set `OPENAI_API_KEY` secret (see Step 2 above)

### Issue: "relation 'document_embeddings' does not exist"

**Fix:** Apply the migration:
```powershell
supabase db push --project-ref akxdroedpsvmckvqvggr
```

Or manually run: `supabase/migrations/20250201000000_add_vector_rag.sql`

## 📚 Full Documentation

- **Detailed Checklist:** `docs/RAG_TROUBLESHOOTING_CHECKLIST.md`
- **Original Analysis:** `docs/RAG Troubleshooting Report.md`
- **Diagnostic Script:** `scripts/check-rag-config.ps1`

## ✅ Verification

After fixing, test:

1. Upload a document
2. Wait for processing to complete
3. Send a chat message referencing the document
4. Verify the response includes document context
5. Check logs for any remaining errors

