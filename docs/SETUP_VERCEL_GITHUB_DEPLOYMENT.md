# Setup Vercel GitHub Actions Deployment

This guide will help you configure GitHub Actions to automatically deploy to Vercel when you push to the `main` branch.

## Prerequisites

- A Vercel account
- A Vercel project already created (or you'll create one)
- Admin access to your GitHub repository

## Step 1: Get Your Vercel Token

1. Go to [Vercel Account Settings](https://vercel.com/account/tokens)
2. Click **"Create Token"**
3. Give it a name (e.g., "GitHub Actions Deployment")
4. Set expiration (or leave as "No expiration" for permanent tokens)
5. Click **"Create"**
6. **Copy the token immediately** - you won't be able to see it again!

## Step 2: Get Your Vercel Org ID and Project ID

### Option A: From Vercel Dashboard (Easiest)

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (or create a new one if needed)
3. Go to **Settings** → **General**
4. Scroll down to find:
   - **Team ID** (this is your `VERCEL_ORG_ID`)
   - **Project ID** (this is your `VERCEL_PROJECT_ID`)

### Option B: Using Vercel CLI

If you have the Vercel CLI installed:

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Login to Vercel
vercel login

# Link to your project (if not already linked)
vercel link

# This will show your project details including IDs
```

### Option C: From Project Settings URL

1. Go to your project settings in Vercel
2. Look at the URL: `https://vercel.com/[org-name]/[project-name]/settings`
3. The org name is your `VERCEL_ORG_ID` (or use the Team ID from settings)
4. The project name is your project, but you'll need the actual Project ID from settings

## Step 3: Add Secrets to GitHub

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"** for each of these:

### Required Secrets:

1. **`VERCEL_TOKEN`**
   - Name: `VERCEL_TOKEN`
   - Value: The token you copied in Step 1

2. **`VERCEL_ORG_ID`**
   - Name: `VERCEL_ORG_ID`
   - Value: Your Team/Org ID from Step 2

3. **`VERCEL_PROJECT_ID`**
   - Name: `VERCEL_PROJECT_ID`
   - Value: Your Project ID from Step 2

### Existing Secrets (Verify These Are Set):

Make sure these are also set (they're used for the build):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_REDIRECT_URL` (optional)
- `VITE_SUPABASE_FUNCTIONS_URL` (optional)
- `VITE_ALPHA_VANTAGE_API_KEY` (optional)
- `VITE_MCP_GATEWAY_URL` (optional)

## Step 4: Verify Your Workflow File

The workflow file (`.github/workflows/deploy.yml`) should already be configured correctly. It uses:

```yaml
- name: Deploy to Vercel
  uses: amondnet/vercel-action@v25
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
    vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
    vercel-args: '--prod'
```

## Step 5: Test the Deployment

1. Make a small change to your code
2. Commit and push to `main`:
   ```bash
   git add .
   git commit -m "Test: Trigger Vercel deployment"
   git push origin main
   ```
3. Go to your GitHub repository → **Actions** tab
4. Watch the workflow run
5. If successful, check your Vercel dashboard to see the deployment

## Troubleshooting

### Error: "Input required and not supplied: vercel-token"

- **Cause**: The `VERCEL_TOKEN` secret is not set in GitHub
- **Fix**: Follow Step 3 above to add the secret

### Error: "Project not found"

- **Cause**: Wrong `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID`
- **Fix**: Double-check the IDs in Vercel Settings → General

### Error: "Unauthorized"

- **Cause**: Invalid or expired `VERCEL_TOKEN`
- **Fix**: Create a new token in Vercel and update the GitHub secret

### Build Fails with Missing Environment Variables

- **Cause**: Missing required secrets for the build step
- **Fix**: Add all required `VITE_*` secrets in GitHub

## Alternative: Manual Deployment

If you prefer to deploy manually instead of using GitHub Actions:

1. Install Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Deploy: `vercel --prod`

Or use the Vercel dashboard to connect your GitHub repository directly (this bypasses GitHub Actions).

## Next Steps

Once configured, every push to `main` will:
1. Run linting
2. Build your app
3. Deploy to Vercel production

You can also manually trigger deployments from the GitHub Actions tab using the "workflow_dispatch" trigger.
