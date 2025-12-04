# Deploy Supabase Edge Functions

## Quick Deploy

The key edge functions for document upload flow are:
- `uploads` - Handles file uploads and deletions
- `textract-worker` - Processes documents
- `agent-orchestrator-v1` - Routes queries to RAG tools
- `doc-context` - Provides document search
- `chat` - Main chat function

## Deploy All Functions

### Using PowerShell Script (Recommended)

```powershell
# Set your Supabase access token
$env:SUPABASE_ACCESS_TOKEN='your-token-here'

# Run the deployment script
.\deploy-functions.ps1
```

### Manual Deployment

```bash
# Deploy each function individually
npx supabase functions deploy uploads --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy textract-worker --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy agent-orchestrator-v1 --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy doc-context --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy chat --project-ref akxdroedpsvmckvqvggr
```

## Get Access Token

1. Go to: https://supabase.com/dashboard/account/tokens
2. Create a new access token
3. Copy and use it in the commands above

## Verify Deployment

Check Supabase Dashboard:
1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions
2. Verify all functions are deployed and active
3. Check function logs for any errors

## Recent Changes

Based on git history, these functions have been updated recently:
- `uploads` - CORS fixes, delete functionality
- `textract-worker` - CORS fixes, error handling
- `agent-orchestrator-v1` - RAG routing improvements
- `doc-context` - Document search improvements

All should be redeployed to ensure latest fixes are live.

