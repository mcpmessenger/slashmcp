# Deploy Updated Functions - Quick Guide

## What Changed

**Supabase Edge Functions (need deployment):**
- ✅ `reselling-analysis` - Fixed scraping, improved error handling, guest mode support
- ✅ `agent-orchestrator-v1` - Fixed command routing, guest mode email handling
- ✅ `mcp` - Guest mode email support

**Frontend (auto-deploys to Vercel via GitHub):**
- ✅ `src/lib/api.ts` - Session refresh, retry logic
- ✅ `src/components/DocumentsSidebar.tsx` - Query optimization

## Step 1: Deploy Supabase Functions

### Get Access Token
1. Go to: https://supabase.com/dashboard/account/tokens
2. Click "Generate New Token"
3. Copy the token

### Deploy Functions

```powershell
# Set your access token
$env:SUPABASE_ACCESS_TOKEN = "your-token-here"

# Deploy all updated functions
.\deploy-functions.ps1
```

**Or deploy manually:**
```powershell
$env:SUPABASE_ACCESS_TOKEN = "your-token-here"
npx supabase functions deploy reselling-analysis --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy agent-orchestrator-v1 --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy mcp --project-ref akxdroedpsvmckvqvggr
```

## Step 2: Push to GitHub (Frontend Auto-Deploys)

```powershell
git add .
git commit -m "Fix reselling analysis scraping and guest mode email support

- Fix reselling-analysis: improved scraping, better error handling
- Add guest mode email support with clear error messages
- Optimize DocumentsSidebar queries (5s timeout, better fallbacks)
- Add session refresh logic and retry for textract jobs
- Update deployment script to include reselling-analysis and mcp"

git push
```

Vercel will automatically deploy the frontend changes.

## Step 3: Verify Deployment

1. **Check Supabase Functions:**
   - Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions
   - Verify `reselling-analysis`, `agent-orchestrator-v1`, and `mcp` are deployed

2. **Check Vercel:**
   - Go to: https://vercel.com/dashboard
   - Verify new deployment is complete

3. **Test:**
   - Try the scraping prompt again
   - Should see actual scraping results instead of generic responses

## What's Fixed

✅ **Reselling Analysis:**
- Now uses `PROJECT_URL` instead of `MCP_GATEWAY_URL` for playwright-wrapper
- Better error messages when no listings found
- Improved logging for debugging

✅ **Guest Mode Email:**
- Clear error messages explaining authentication requirement
- Report content included in response for manual copying
- Better instructions for signing in

✅ **Query Performance:**
- DocumentsSidebar queries optimized (5s timeout)
- Better fallback to cached data
- Session refresh prevents expired token errors

