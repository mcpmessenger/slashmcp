# SlashMCP Quick Setup & Troubleshooting

Quick reference for getting SlashMCP running locally.

## Quick Setup (5 Steps)

### 1. Install Dependencies
```bash
npm install
```

### 2. Create `.env.local`
Create `.env.local` in project root:
```bash
VITE_SUPABASE_URL=https://<your-supabase-ref>.supabase.co
VITE_SUPABASE_FUNCTIONS_URL=https://<your-supabase-ref>.supabase.co/functions/v1
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
VITE_SUPABASE_REDIRECT_URL=http://localhost:8080
```

**For local functions testing:**
```bash
VITE_SUPABASE_FUNCTIONS_URL=http://localhost:9999
```

### 3. Set Supabase Secrets
```bash
npx supabase secrets set --project-ref <your-ref> \
  SERVICE_ROLE_KEY=<key> \
  OPENAI_API_KEY=<key> \
  AWS_REGION=<region> \
  AWS_ACCESS_KEY_ID=<key> \
  AWS_SECRET_ACCESS_KEY=<secret> \
  AWS_S3_BUCKET=tubbyai-products-catalog
```

### 4. Run Database Migrations
```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
```

### 5. Configure S3 CORS
```bash
aws s3api put-bucket-cors --bucket tubbyai-products-catalog --cors-configuration file://fix-s3-cors.json
```

## Start the App

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Local Functions (optional)
npx supabase functions serve --env-file supabase/.env
```

Access at: `http://localhost:8080`

---

## Quick Fixes

| Problem | Solution |
|--------|----------|
| **OAuth fails** | Add `http://localhost:8080/auth/callback` to Supabase Dashboard → Authentication → URL Configuration |
| **Upload fails (CORS)** | Run: `aws s3api put-bucket-cors --bucket tubbyai-products-catalog --cors-configuration file://fix-s3-cors.json` |
| **Functions not working** | Check `VITE_SUPABASE_FUNCTIONS_URL` matches your setup (local: `http://localhost:9999` or cloud: `https://.../functions/v1`) |
| **Vision/OCR fails** | Verify Supabase secrets are set: `npx supabase secrets list --project-ref <ref>` |
| **Network access (Docker/WSL)** | Add `VITE_DEV_HOST=0.0.0.0` to `.env.local` and update S3 CORS with your IP |
| **MCP workflows fail** | Set `VITE_MCP_GATEWAY_URL=http://localhost:8989/invoke` or use `/slashmcp add` in chat |

---

## Environment Variables Reference

| Variable | Required | Default/Notes |
|----------|----------|--------------|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `VITE_SUPABASE_FUNCTIONS_URL` | ⚠️ | Auto-computed if not set, but set explicitly for clarity |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Anon key (starts with `eyJ...`) |
| `VITE_SUPABASE_REDIRECT_URL` | ✅ | `http://localhost:8080` for local dev |
| `VITE_MCP_GATEWAY_URL` | ❌ | Optional, only for multi-agent workflows |
| `VITE_DEV_HOST` | ❌ | Set to `0.0.0.0` for network access |

---

## Verification Checklist

- [ ] `.env.local` exists with all required variables
- [ ] Supabase secrets are set (check with `npx supabase secrets list`)
- [ ] Database migrations applied (`npx supabase db push`)
- [ ] S3 CORS configured (`aws s3api get-bucket-cors --bucket tubbyai-products-catalog`)
- [ ] OAuth callback URL added in Supabase Dashboard
- [ ] Dev server starts without errors (`npm run dev`)
- [ ] Can upload files without CORS errors
- [ ] Can sign in with OAuth

---

## Common Commands

```bash
# Check Supabase connection
npx supabase status

# List secrets
npx supabase secrets list --project-ref <ref>

# View S3 CORS config
aws s3api get-bucket-cors --bucket tubbyai-products-catalog

# Test functions locally
npx supabase functions serve --env-file supabase/.env
```

---

## References

- [README.md](../README.md) - Full project documentation
- [LOCAL_SETUP.md](../LOCAL_SETUP.md) - Detailed local setup guide
- [YouTube Demo](https://youtu.be/VGq2Zd-qE_E?si=TxBTXegjlkLUTF2W) - Expected functionality
