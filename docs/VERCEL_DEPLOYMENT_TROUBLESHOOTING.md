# Vercel Deployment Troubleshooting

## Issue: Vercel Build Stuck/Stale After GitHub Actions Workflow

If the GitHub Actions workflow runs but Vercel deployment is stuck or stale, try these solutions:

## Quick Fixes

### 1. Check Vercel Dashboard Directly
1. Go to: https://vercel.com/dashboard
2. Find your `slashmcp` project
3. Check the "Deployments" tab
4. Look for:
   - Recent deployments (should show GitHub commits)
   - Build status (Building, Ready, Error)
   - Build logs (click on a deployment to see logs)

### 2. Verify GitHub Integration
1. In Vercel dashboard → Project Settings → Git
2. Ensure GitHub repo is connected
3. Check if "Production Branch" is set to `main`
4. Verify "Auto-deploy" is enabled

### 3. Check GitHub Actions Workflow Logs
1. Go to: https://github.com/mcpmessenger/slashmcp/actions
2. Click on the latest workflow run
3. Expand "Deploy to Vercel" step
4. Check for errors in the logs

### 4. Common Issues and Solutions

#### Issue A: Missing Vercel Secrets
**Symptoms:** Workflow fails at "Deploy to Vercel" step
**Fix:**
1. Go to: https://github.com/mcpmessenger/slashmcp/settings/secrets/actions
2. Verify these secrets exist:
   - `VERCEL_TOKEN` - Get from: Vercel Dashboard → Settings → Tokens
   - `VERCEL_ORG_ID` - Get from: Vercel Dashboard → Settings → General
   - `VERCEL_PROJECT_ID` - Get from: Project Settings → General

#### Issue B: Vercel Action Version Outdated
**Symptoms:** Workflow runs but deployment doesn't appear in Vercel
**Fix:** Update the action version in `.github/workflows/deploy.yml`:
```yaml
uses: amondnet/vercel-action@v25  # Try v26 or latest
```

#### Issue C: Build Failing in Vercel
**Symptoms:** Deployment shows "Error" status
**Fix:**
1. Check Vercel build logs for specific errors
2. Common issues:
   - Missing environment variables
   - Build timeout
   - Dependency installation failures
   - TypeScript/linting errors

#### Issue D: Duplicate Deployments
**Symptoms:** Both GitHub Actions and Vercel auto-deploy creating duplicates
**Fix:**
- Option 1: Disable Vercel auto-deploy (let GitHub Actions handle it)
  - Vercel Dashboard → Project Settings → Git → Disable "Auto-deploy"
- Option 2: Remove GitHub Actions deployment (let Vercel handle it)
  - Comment out the "Deploy to Vercel" step in `.github/workflows/deploy.yml`

## Manual Deployment Options

### Option 1: Deploy via Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy to production
vercel --prod
```

### Option 2: Trigger Vercel Deploy via API
```bash
# Get your Vercel token from dashboard
curl -X POST "https://api.vercel.com/v1/deployments?projectId=YOUR_PROJECT_ID" \
  -H "Authorization: Bearer YOUR_VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gitSource":{"type":"github","repo":"mcpmessenger/slashmcp","ref":"main"}}'
```

### Option 3: Use Vercel Dashboard
1. Go to Vercel Dashboard
2. Click "Deployments" → "Redeploy"
3. Select the latest commit
4. Click "Redeploy"

## Verify Deployment

After deployment:
1. Check production URL: https://slashmcp.vercel.app (or your custom domain)
2. Open browser DevTools → Network tab
3. Check console for errors
4. Test chat functionality
5. Test OAuth login

## Next Steps

If deployment is still stuck:
1. Check Vercel status page: https://www.vercel-status.com
2. Check GitHub Actions status: https://www.githubstatus.com
3. Review Vercel build logs for specific error messages
4. Try redeploying from Vercel dashboard directly

