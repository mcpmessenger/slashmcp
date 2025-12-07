# Deploy Sidebar and Upload Fixes to Production

## Current Issues

From the console logs:
1. ❌ **Upload registration timing out** - `uploads` Edge Function failing
2. ❌ **DocumentsSidebar stuck loading** - `documentCount: 0`, `isLoading: true`
3. ❌ **No sidebar visible** - Frontend changes not deployed

## Deployment Required

### 1. Frontend Changes (Vercel via GitHub) ✅

**Files Changed:**
- `src/components/DocumentsSidebar.tsx` - Summary display, query fixes
- `src/pages/Index.tsx` - Infinite loop fix, always show sidebar
- `src/hooks/useChat.ts` - Better result formatting

**Deploy via GitHub:**

```bash
# Commit changes
git add .
git commit -m "Fix: DocumentsSidebar infinite loop, add summaries, always show sidebar"

# Push to trigger Vercel deployment
git push origin main
```

**What this fixes:**
- ✅ Sidebar always visible when authenticated
- ✅ Summaries display in sidebar
- ✅ No more infinite refresh loops
- ✅ Better error handling

**Deployment Time:** ~2-3 minutes (automatic via GitHub Actions)

---

### 2. Supabase Edge Functions (Manual Deployment) ⚠️

**Critical Function to Deploy:**
- `uploads` - **Currently timing out** (30s timeout errors)

**Other Functions Updated:**
- `playwright-wrapper` - Added `browser_extract_text` and Facebook Marketplace parsing

**Deploy Commands:**

#### Option A: PowerShell Script (Recommended)

```powershell
# Set your Supabase access token
$env:SUPABASE_ACCESS_TOKEN='your-token-here'

# Deploy all functions
.\deploy-functions.ps1
```

#### Option B: Manual Deployment

```bash
# Get token from: https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN='your-token-here'

# Deploy critical uploads function first
npx supabase functions deploy uploads --project-ref akxdroedpsvmckvqvggr

# Deploy playwright-wrapper (with new features)
npx supabase functions deploy playwright-wrapper --project-ref akxdroedpsvmckvqvggr

# Deploy other functions if needed
npx supabase functions deploy textract-worker --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy doc-context --project-ref akxdroedpsvmckvqvggr
npx supabase functions deploy chat --project-ref akxdroedpsvmckvqvggr
```

**What this fixes:**
- ✅ Upload registration timeout (if `uploads` function was updated)
- ✅ Browser scraping improvements
- ✅ Facebook Marketplace parsing

---

## Deployment Checklist

### Step 1: Frontend (Vercel)
- [ ] Commit all changes to git
- [ ] Push to `main` branch
- [ ] Wait for GitHub Actions to complete (~2-3 min)
- [ ] Check Vercel dashboard: https://vercel.com/dashboard
- [ ] Verify deployment shows latest commit

### Step 2: Supabase Functions
- [ ] Get Supabase access token: https://supabase.com/dashboard/account/tokens
- [ ] Deploy `uploads` function (critical - fixes timeout)
- [ ] Deploy `playwright-wrapper` function (new features)
- [ ] Verify in Supabase dashboard: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions
- [ ] Check function logs for errors

### Step 3: Testing
- [ ] Open production URL
- [ ] Check if sidebar appears on left
- [ ] Upload a test document
- [ ] Verify upload doesn't timeout
- [ ] Check if document appears in sidebar
- [ ] Verify summary displays (if document processed)

---

## Why Two Separate Deployments?

| Component | Deployment Method | Why Separate? |
|-----------|------------------|---------------|
| **Frontend (React)** | Vercel (via GitHub) | Runs on Vercel's CDN |
| **Edge Functions** | Supabase CLI | Runs on Supabase infrastructure |
| **Database** | Supabase Dashboard | Already deployed (migrations) |

**Key Point:** Edge Functions are **independent** of Vercel. They must be deployed separately using Supabase CLI.

---

## Troubleshooting

### If Upload Still Times Out After Deployment

1. **Check Supabase Function Logs:**
   - Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions
   - Click on `uploads` function
   - Check "Logs" tab for errors

2. **Check Function Status:**
   - Verify function shows as "Active"
   - Check deployment timestamp is recent

3. **Verify Environment Variables:**
   - Check Supabase dashboard → Settings → Edge Functions
   - Ensure AWS credentials are set (for S3 uploads)

### If Sidebar Still Not Showing

1. **Check Vercel Deployment:**
   - Verify latest commit is deployed
   - Check build logs for errors
   - Clear browser cache

2. **Check Console Logs:**
   - Look for `[DocumentsSidebar]` logs
   - Check for query errors
   - Verify `propUserId` is set

---

## Quick Deploy Script

Save this as `quick-deploy.ps1`:

```powershell
# Quick deployment script
param(
    [Parameter(Mandatory=$true)]
    [string]$SupabaseToken
)

Write-Host "🚀 Starting deployment..." -ForegroundColor Green

# Step 1: Push to GitHub (triggers Vercel)
Write-Host "📤 Pushing to GitHub..." -ForegroundColor Yellow
git push origin main

# Step 2: Deploy Supabase Functions
Write-Host "☁️ Deploying Supabase Functions..." -ForegroundColor Yellow
$env:SUPABASE_ACCESS_TOKEN = $SupabaseToken
.\deploy-functions.ps1

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host "Check Vercel: https://vercel.com/dashboard" -ForegroundColor Cyan
Write-Host "Check Supabase: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions" -ForegroundColor Cyan
```

Usage:
```powershell
.\quick-deploy.ps1 -SupabaseToken "your-token-here"
```

---

## Expected Results After Deployment

### Frontend (Vercel)
- ✅ Sidebar appears on left when authenticated
- ✅ No infinite refresh loops
- ✅ Documents load successfully
- ✅ Summaries display below file size

### Backend (Supabase)
- ✅ Upload registration completes in < 5 seconds
- ✅ No timeout errors
- ✅ Documents process successfully
- ✅ Browser scraping works with new features

---

## Next Steps

1. **Deploy frontend** (GitHub push)
2. **Deploy `uploads` function** (critical for uploads)
3. **Deploy `playwright-wrapper`** (for new scraping features)
4. **Test in production**
5. **Monitor logs** for any issues
