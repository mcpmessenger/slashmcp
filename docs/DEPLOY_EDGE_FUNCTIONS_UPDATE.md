# How to Update/Deploy Edge Functions

## Quick Answer

**Edge Functions are deployed separately from your frontend code.**

## Two Separate Deployments

### 1. Frontend Code (Vite/React)
- **Location:** `src/` directory
- **Deployed to:** Vercel (or your hosting)
- **Command:** `git push` (auto-deploys) or `vercel --prod`
- **Includes:** The `api.ts` fixes we just made

### 2. Edge Functions (Deno)
- **Location:** `supabase/functions/` directory  
- **Deployed to:** Supabase Cloud (Deno Deploy)
- **Command:** `npx supabase functions deploy <function-name>`
- **Includes:** `textract-worker`, `uploads`, `chat`, etc.

## Current Status

**✅ Frontend fix applied:**
- Updated `src/lib/api.ts` to ensure `apikey` header is always included
- This fixes the "No API key found" error

**❓ Edge Functions:**
- May need to be redeployed if you made changes
- But the `apikey` error is from the API gateway, not the function code

## Do You Need to Deploy Edge Functions?

**Probably NOT needed** - The error is about the request headers, not the function code.

**Only deploy if:**
- You modified function code in `supabase/functions/`
- You want to ensure latest version is deployed
- Functions are missing or not working

## How to Deploy Edge Functions

### Option 1: Deploy All Functions

```powershell
# Set your Supabase access token
$env:SUPABASE_ACCESS_TOKEN = "your-token-here"

# Deploy all functions
npx supabase functions deploy uploads --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy textract-worker --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy doc-context --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy chat --project-ref akxdroedpsvmckvqvggr
```

### Option 2: Use Deployment Script

```powershell
# Run the PowerShell script
.\deploy-functions.ps1
```

### Option 3: Deploy via Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions
2. Click on a function
3. Click "Deploy" or "Redeploy"

## Get Supabase Access Token

1. Go to: https://supabase.com/dashboard/account/tokens
2. Click "Generate new token"
3. Copy the token
4. Use it in deployment commands

## Verify Deployment

**Check functions are deployed:**
```powershell
npx supabase functions list --project-ref akxdroedpsvmckvqvggr
```

**Should see:**
- `uploads` - Active
- `textract-worker` - Active
- `doc-context` - Active
- `chat` - Active

## Summary

**For the `apikey` error:**
- ✅ **Frontend fix:** Already applied (ensures header is sent)
- ❓ **Edge Functions:** Probably don't need redeploy (error is about headers, not function code)

**To test the fix:**
1. Restart dev server: `npm run dev`
2. Upload a document
3. Check console for `hasApikey: true`
4. Should NOT see "No API key found" error

**If you want to redeploy functions anyway:**
- Use commands above
- Or use `deploy-functions.ps1` script



