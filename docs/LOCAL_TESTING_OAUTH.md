# Local Testing with OAuth

## Can You Test Locally?

**Yes!** You can test locally, but you need to configure OAuth redirect URLs properly.

## How OAuth Redirect Works

The OAuth redirect URL is determined at **runtime** based on:
1. `VITE_SUPABASE_REDIRECT_URL` environment variable (if set)
2. Falls back to `window.location.origin` (your current URL)

So if you're running locally on `http://localhost:8080`, it will redirect to `http://localhost:8080/auth/callback` automatically.

## Setup for Local Testing

### Step 1: Create `.env.local` File

Create a `.env.local` file in the project root:

```bash
# .env.local
VITE_SUPABASE_REDIRECT_URL=http://localhost:8080
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

**Note:** The port should match your Vite dev server (default is 8080 based on `vite.config.ts`).

### Step 2: Configure Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (`akxdroedpsvmckvqvggr`)
3. Navigate to **Authentication** → **URL Configuration**
4. Add **Redirect URLs:**
   - `http://localhost:8080/auth/callback` (for local testing)
   - `https://slashmcp.vercel.app/auth/callback` (for production)
   - `http://localhost:8080` (base URL, optional)

### Step 3: Start Local Dev Server

```bash
npm run dev
```

The app will start on `http://localhost:8080` (or check the console for the actual port).

### Step 4: Test OAuth Flow

1. Open `http://localhost:8080` in your browser
2. Click "Sign in with Google"
3. Complete OAuth flow
4. You should be redirected back to `http://localhost:8080/auth/callback`
5. Then redirected to `http://localhost:8080` (main app)

## Important Notes

### ✅ What Works Locally

- OAuth sign-in will redirect to localhost (not Vercel)
- All Supabase queries work locally
- Document upload/processing works locally
- Edge functions are called from localhost (they're hosted on Supabase, not Vercel)

### ⚠️ What to Watch Out For

1. **Supabase Redirect URLs**: Make sure `http://localhost:8080/auth/callback` is added in Supabase Dashboard
2. **Port Mismatch**: If Vite uses a different port, update `.env.local` accordingly
3. **Environment Variables**: Make sure `.env.local` has all required Supabase variables

## Code Flow

The redirect URL is determined like this:

```typescript
// In useChat.ts
const baseUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL || window.location.origin;
const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/callback`;

await supabaseClient.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo, // Will be http://localhost:8080/auth/callback when running locally
    // ...
  },
});
```

When running locally:
- `window.location.origin` = `http://localhost:8080`
- `redirectTo` = `http://localhost:8080/auth/callback`

When deployed to Vercel:
- `window.location.origin` = `https://slashmcp.vercel.app`
- `redirectTo` = `https://slashmcp.vercel.app/auth/callback`

## Testing DocumentsSidebar Locally

Once OAuth is working locally, you can test the DocumentsSidebar fix:

1. Sign in with Google (will redirect to localhost)
2. Upload a document
3. Check if documents appear in sidebar after 500ms delay
4. Check console for: `[DocumentsSidebar] About to call loadDocuments() after 500ms delay...`

## Troubleshooting

### Issue: OAuth redirects to Vercel instead of localhost

**Solution:**
- Check that `.env.local` has `VITE_SUPABASE_REDIRECT_URL=http://localhost:8080`
- Verify Supabase Dashboard has `http://localhost:8080/auth/callback` in redirect URLs
- Restart dev server after creating/updating `.env.local`

### Issue: "Redirect URI mismatch" error

**Solution:**
- Ensure Supabase Dashboard has the exact localhost URL: `http://localhost:8080/auth/callback`
- Check for typos in the URL
- Make sure port matches your dev server (check console output)

### Issue: OAuth works but documents don't load

**Solution:**
- This is the issue we're fixing! Check console for the 500ms delay log
- Verify Supabase client is initialized
- Check browser console for errors

## Quick Start

```bash
# 1. Create .env.local
echo "VITE_SUPABASE_REDIRECT_URL=http://localhost:8080" > .env.local
echo "VITE_SUPABASE_URL=your-url" >> .env.local
echo "VITE_SUPABASE_PUBLISHABLE_KEY=your-key" >> .env.local

# 2. Start dev server
npm run dev

# 3. Open http://localhost:8080
# 4. Test OAuth sign-in
```

---

**Summary:** Yes, you can test locally! OAuth will redirect to localhost, not Vercel, as long as you configure the redirect URLs in Supabase Dashboard.

