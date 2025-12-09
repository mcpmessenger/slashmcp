# Local Development Setup Guide

This guide helps you set up local testing **without affecting your Vercel deployment**.

## Quick Start

### 1. Create `.env.local` File

Copy the example file:
```bash
cp .env.local.example .env.local
```

Then edit `.env.local` and fill in your values (see `.env.local.example` for template).

### 2. Configure Vite Dev Server

**Default (Recommended):** The dev server binds to `localhost` to avoid CORS issues:
- Access at: `http://localhost:8080`
- S3 CORS is already configured for `localhost:8080`

**If you need network access** (Docker/WSL/remote access):
- Add to `.env.local`: `VITE_DEV_HOST=0.0.0.0`
- Access at: `http://172.27.64.1:8080` or your network IP
- **Note:** You'll need to add your specific IP to S3 CORS (see below)

### 3. Update S3 CORS (One-Time Setup)

The S3 bucket needs to allow requests from your local origin.

**Option A: Use localhost (Recommended)**
- Already configured in `fix-s3-cors.json`
- Just apply it: `aws s3api put-bucket-cors --bucket tubbyai-products-catalog --cors-configuration file://fix-s3-cors.json`

**Option B: If using network IP (Docker/WSL)**
- Add your specific IP to S3 CORS:
  1. Edit `fix-s3-cors.json`
  2. Add `"http://172.27.64.1:8080"` (or your IP) to `AllowedOrigins`
  3. Apply: `aws s3api put-bucket-cors --bucket tubbyai-products-catalog --cors-configuration file://fix-s3-cors.json`

**Option C: Development wildcard (Less secure, for testing only)**
```json
{
  "AllowedOrigins": ["*"]
}
```
⚠️ **Warning:** Only use for development. Never use `*` in production.

### 4. Start Development Server

```bash
npm install
npm run dev
```

The app will start at `http://localhost:8080` (or check console for actual URL).

## Environment Variables

### Local Development (`.env.local`)
- ✅ **Gitignored** - Won't affect production
- ✅ **Loaded by Vite** - Automatically available in app
- ✅ **Local only** - Vercel uses its own env vars

### Production (Vercel)
- ✅ **Separate config** - Vercel Dashboard → Settings → Environment Variables
- ✅ **Not affected** - Local `.env.local` doesn't change production
- ✅ **Auto-deployed** - Vercel uses its own env vars on deploy

## Common Issues

### Issue: "Failed to fetch" on file upload

**Cause:** CORS issue - your origin isn't in S3 CORS config

**Fix:**
1. Check your origin in browser console (should be `http://localhost:8080`)
2. Verify S3 CORS includes your origin
3. Apply CORS config: `aws s3api put-bucket-cors --bucket tubbyai-products-catalog --cors-configuration file://fix-s3-cors.json`

### Issue: Accessing from network IP (172.27.64.1)

**Cause:** Vite is binding to `0.0.0.0` but S3 CORS doesn't include your IP

**Fix:**
1. Add your IP to S3 CORS (see Option B above)
2. Or use `localhost` and access via `http://localhost:8080` instead

### Issue: OAuth redirect fails locally

**Fix:**
1. Add `http://localhost:8080/auth/callback` to Supabase Dashboard → Authentication → URL Configuration
2. Set `VITE_SUPABASE_REDIRECT_URL=http://localhost:8080` in `.env.local`

## Verification

After setup, verify everything works:

1. **Start dev server:** `npm run dev`
2. **Open browser:** `http://localhost:8080`
3. **Check console:** Should see `[api.ts] FUNCTIONS_URL configured: ...`
4. **Test upload:** Try uploading a file - should work without CORS errors

## Production Safety

✅ **Your Vercel deployment is safe:**
- `.env.local` is gitignored - never committed
- Vercel uses its own environment variables
- Local changes don't affect production
- Production URLs are separate from local URLs

## Next Steps

- See `README.md` for full setup instructions
- See `docs/LOCAL_TESTING_OAUTH.md` for OAuth setup
- See `docs/TROUBLESHOOT_S3_UPLOAD.md` for upload troubleshooting

