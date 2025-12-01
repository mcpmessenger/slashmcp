# Deploying Vector RAG Architecture

## Migration Status
✅ **Migration Complete** - The database migration has been successfully applied via Supabase Dashboard SQL Editor.

## Deployment Steps

### Step 1: Get Supabase Access Token (to avoid OAuth login timeout)

1. Go to [Supabase Account Tokens](https://supabase.com/dashboard/account/tokens)
2. Click **Generate New Token**
3. Give it a name (e.g., "Vector RAG Deployment")
4. Copy the token

### Step 2: Deploy Edge Functions

#### Option A: Using PowerShell Script (Recommended)

```powershell
# Set the access token
$env:SUPABASE_ACCESS_TOKEN = "your-access-token-here"

# Run the deployment script
.\deploy-functions.ps1
```

#### Option B: Deploy Manually with Access Token

```powershell
# Set the access token
$env:SUPABASE_ACCESS_TOKEN = "your-access-token-here"

# Deploy each function
npx supabase functions deploy chat --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy doc-context --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy textract-worker --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy uploads --project-ref akxdroedpsvmckvqvggr
```

#### Option C: Deploy via Supabase Dashboard (if available)

1. Go to Supabase Dashboard → Edge Functions
2. Upload each function manually (if this option is available)

### Step 3: Verify Deployment

After deployment, verify functions are live:

1. Go to Supabase Dashboard → Edge Functions
2. Check that all functions show as "Active"
3. Check the logs for any errors

### Step 4: Push to GitHub (Frontend)

```powershell
git add .
git commit -m "Implement vector RAG architecture with text-embedding-3-small

- Add pgvector extension and document_embeddings table (1536 dimensions)
- Implement semantic chunking with overlap
- Add embedding generation pipeline in textract-worker
- Add vector similarity search in doc-context
- Update chat function to use vector search
- Add 'indexed' job stage
- Update TypeScript types"

git push origin main
```

This will trigger Vercel to rebuild and deploy the frontend automatically.

## Functions Updated

The following edge functions were modified for vector RAG:

1. **chat** - Uses vector search for document context retrieval
2. **doc-context** - Implements vector similarity search with fallback to legacy system
3. **textract-worker** - Generates embeddings after text extraction
4. **uploads** - Updated job stage constants

## Environment Variables Required

Make sure these are set in Supabase Edge Functions environment:

- `OPENAI_API_KEY` - Required for embedding generation (text-embedding-3-small)

## Testing After Deployment

1. Upload a new document (PDF, CSV, or image)
2. Wait for processing to complete (should reach "indexed" stage)
3. Ask a question about the document in chat
4. The system should use vector search to find relevant chunks

## Troubleshooting

### OAuth Login Timeout
If you still get OAuth timeout errors, use the access token method (Option A or B above).

### Function Deployment Fails
- Check that you have the correct project ref
- Verify the access token is valid
- Check Supabase Dashboard → Edge Functions for error logs

### Embedding Generation Fails
- Verify `OPENAI_API_KEY` is set in Supabase Edge Functions environment
- Check that you have API credits available
- Review textract-worker logs for embedding errors

