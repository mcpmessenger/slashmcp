# OAuth Redirect URL Setup Guide

## Overview

For Google OAuth sign-in to work correctly in production, you need to configure the redirect URL in two places:

1. **GitHub Secrets** - For CI/CD builds
2. **Supabase Dashboard** - For OAuth provider configuration

## 1. GitHub Secrets Configuration

### Required Secret

Add this secret to your GitHub repository:

**Secret Name:** `VITE_SUPABASE_REDIRECT_URL`  
**Secret Value:** Your production domain (e.g., `https://your-app.vercel.app`)

### How to Add

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `VITE_SUPABASE_REDIRECT_URL`
5. Value: Your production URL (e.g., `https://slashmcp.vercel.app`)
6. Click **Add secret**

### What Happens

- During CI/CD build, this value is injected as an environment variable
- The app uses this URL for OAuth redirects in production
- If not set, the app falls back to `window.location.origin` at runtime (which works but is less explicit)

## 2. Supabase Dashboard Configuration

### Configure Redirect URLs

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (`akxdroedpsvmckvqvggr`)
3. Navigate to **Authentication** → **URL Configuration**
4. Set **Site URL:**
   - Production: `https://slashmcp.vercel.app`
   - Local: `http://localhost:5173`
5. Add **Redirect URLs:**
   - `https://slashmcp.vercel.app/auth/callback` (production callback)
   - `http://localhost:5173/auth/callback` (local callback)
   - `https://slashmcp.vercel.app` (base URL, optional)

### Configure Google OAuth Provider

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Click on **Google**
3. Ensure **Enabled** is toggled on
4. Add your **Authorized redirect URIs**:
   - `https://your-project-ref.supabase.co/auth/v1/callback`
   - This is automatically handled by Supabase, but verify it's present

## 3. Local Development

For local development, use `.env.local`:

```bash
VITE_SUPABASE_REDIRECT_URL=http://localhost:5173
```

This allows OAuth to redirect back to your local dev server.

## 4. How It Works

### Code Flow

```typescript
// In useChat.ts and Workflows.tsx (WORKING IMPLEMENTATION)
const baseUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL || window.location.origin;
// Remove trailing slash if present, then append /auth/callback
const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/callback`;

await supabaseClient.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo, // e.g., 'https://slashmcp.vercel.app/auth/callback'
    queryParams: {
      access_type: "offline",
      prompt: "consent",
      scope: "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar",
    },
  },
});
```

### Redirect Flow (Updated with Dedicated Callback Route)

1. User clicks "Sign in with Google"
2. App redirects to Google OAuth
3. User authorizes
4. Google redirects to Supabase callback URL (`https://your-project.supabase.co/auth/v1/callback`)
5. Supabase processes the OAuth response
6. Supabase redirects to your app's callback route (`https://slashmcp.vercel.app/auth/callback`)
7. OAuthCallback component processes the session:
   - Waits for Supabase to process URL hash (DOES NOT clear hash immediately)
   - Verifies session is persisted to localStorage
   - Captures OAuth tokens (Gmail, Calendar scopes)
   - Clears URL hash
   - Navigates to main app (`/`)
8. User is signed in and ready to use the app

## 5. Troubleshooting

### Issue: Redirects to wrong URL

**Solution:**
- Verify `VITE_SUPABASE_REDIRECT_URL` GitHub secret matches your production domain
- Check Supabase Dashboard → Authentication → URL Configuration
- Ensure the URL is added to allowed redirect URLs

### Issue: OAuth works locally but not in production

**Solution:**
- Check that `VITE_SUPABASE_REDIRECT_URL` is set in GitHub Secrets
- Verify the production URL is added in Supabase Dashboard
- Check browser console for OAuth errors
- Verify the redirect URL matches exactly (including `https://`)

### Issue: "Redirect URI mismatch" error

**Solution:**
- The redirect URL in GitHub Secrets must match exactly what's configured in Supabase
- Check for trailing slashes (should not have one)
- Verify protocol (`https://` not `http://` in production)

## 6. Best Practices

1. **Always set `VITE_SUPABASE_REDIRECT_URL` in GitHub Secrets** for production
2. **Use environment-specific URLs**:
   - Local: `http://localhost:5173`
   - Production: `https://your-app.vercel.app`
3. **Test OAuth flow** after each deployment
4. **Keep Supabase redirect URLs updated** when changing domains

## 7. Verification

After setup, test the OAuth flow:

1. Visit your production site
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Verify you're redirected back to your production site (not localhost)
5. Verify you're signed in successfully

---

**Last Updated:** January 2025  
**Status:** ✅ WORKING - Dedicated callback route implementation successful  
**Related:** [GitHub Workflows README](../.github/workflows/README.md), [OAuth Loop Investigation](./Google%20OAuth%20Login%20and%20Logout%20Loop%20Investigation%20for%20mcpmessenger_slashmcp.md)

