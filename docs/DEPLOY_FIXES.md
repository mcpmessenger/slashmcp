# Deploying Gemini and Search Fixes

## Current Status
✅ **Fixes are complete** but **NOT live yet** - they're only in your local codebase.

## What Needs to be Deployed

The fixes are in **Supabase Edge Functions**, which deploy separately from the Vercel frontend:

1. `supabase/functions/mcp/index.ts` - Main MCP gateway (includes Gemini handler)
2. `supabase/functions/search-mcp/index.ts` - Search MCP function

## Deployment Steps

### Step 1: Deploy Supabase Functions

Deploy both functions to Supabase (using your project ref from memory):

```bash
# Deploy the main MCP gateway (includes Gemini fixes)
npx supabase functions deploy mcp --project-ref akxdroedpsvmckvqvggr

# Deploy the search MCP function
npx supabase functions deploy search-mcp --project-ref akxdroedpsvmckvqvggr
```

### Step 2: Commit and Push to GitHub (for version control)

```bash
# Add the changed files
git add supabase/functions/mcp/index.ts supabase/functions/search-mcp/index.ts

# Commit
git commit -m "Fix Gemini MCP 404 errors and improve search functionality

- Add model validation for Gemini (reject non-Gemini models like gpt-4o-mini)
- Improve error messages with user-friendly feedback
- Replace DuckDuckGo Instant Answer API with HTML scraping for better general query results
- Add fallback to Instant Answer API if HTML parsing fails
- Enhanced error handling throughout"

# Push to GitHub (this will trigger Vercel frontend rebuild, but functions are separate)
git push origin main
```

**Note:** The GitHub push will trigger a Vercel build for the frontend, but the Supabase functions must be deployed separately using the commands above.

## Testing After Deployment

Once deployed, test the fixes:

### Test Gemini MCP (should now work):
```
/gemini-mcp generate_text prompt="Draft a 3-point risk summary" model=gemini-1.5-flash
```

### Test Gemini with invalid model (should show helpful error):
```
/gemini-mcp generate_text prompt="Test" model=gpt-4o-mini
```
Expected: Clear error message explaining that only Gemini models are supported.

### Test Search (should now work for general queries):
```
/search-mcp web_search query="agile project management best practices"
```

### Test Search with specific query (should still work):
```
/search-mcp web_search query="Model Context Protocol"
```

## Quick Deploy Script

You can deploy both functions at once:

```bash
npx supabase functions deploy mcp --project-ref akxdroedpsvmckvqvggr && \
npx supabase functions deploy search-mcp --project-ref akxdroedpsvmckvqvggr
```

## Verification

After deployment, the fixes should be live immediately. You can verify by:
1. Testing the commands above in your live app (https://slashmcp.vercel.app)
2. Checking Supabase dashboard → Edge Functions → Logs for any errors


