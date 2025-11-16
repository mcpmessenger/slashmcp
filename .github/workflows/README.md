# GitHub Actions Workflows

## Auto-Deploy Setup

This workflow automatically deploys your SlashMCP app to production when you push to `main`.

### Setup Instructions

#### Option 1: Vercel (Recommended - Easiest)

1. **Create Vercel account** and import your GitHub repo
2. **Get tokens from Vercel Dashboard**:
   - Go to Settings → Tokens → Create Token
   - Go to Settings → General → Copy Org ID and Project ID
3. **Add GitHub Secrets** (required):
   - `VERCEL_TOKEN` - Your Vercel token
   - `VERCEL_ORG_ID` - Your Vercel org ID
   - `VERCEL_PROJECT_ID` - Your Vercel project ID
   - `VITE_SUPABASE_URL` - Your Supabase URL (required)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` - Your Supabase anon key (required)
   
   **Optional secrets** (set if you need these features):
   - `VITE_SUPABASE_FUNCTIONS_URL` - Your Supabase functions URL (falls back to `${VITE_SUPABASE_URL}/functions/v1` if not set)
   - `VITE_ALPHA_VANTAGE_API_KEY` - Alpha Vantage API key for stock quotes
   - `VITE_MCP_GATEWAY_URL` - MCP gateway proxy endpoint (e.g., `https://your-gateway.com/invoke`)
   - `VITE_SUPABASE_REDIRECT_URL` - OAuth redirect URL (defaults to deployment URL if not set)

#### Option 2: Netlify

1. **Create Netlify account** and add your site
2. **Get tokens**:
   - Go to User Settings → Applications → New access token
   - Get Site ID from Site Settings → General
3. **Add GitHub Secrets**:
   - `NETLIFY_AUTH_TOKEN` - Your Netlify access token
   - `NETLIFY_SITE_ID` - Your Netlify site ID
   - Plus all the VITE_* secrets listed in Option 1 above

#### Option 3: Render

1. **Create Render account** and create a Static Site
2. **Get deploy key** from Render dashboard
3. **Add GitHub Secrets**:
   - `RENDER_SERVICE_ID` - Your Render service ID
   - `RENDER_DEPLOY_KEY` - Your Render deploy key
   - Plus all the VITE_* secrets listed in Option 1 above

### After Setup

Once configured, every push to `main` will:
1. Build your Vite app
2. Deploy to your chosen platform
3. Make your app accessible at a public URL (e.g., `https://slashmcp.vercel.app`)

### Testing with Playwright

Once deployed, your Playwright wrapper can test the live URL:

```text
/playwright-wrapper browser_navigate url=https://slashmcp.vercel.app
/playwright-wrapper browser_snapshot
```

