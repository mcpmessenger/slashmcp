# Supabase Edge Functions: Local vs Cloud

## Two Different Environments

### 🏠 **Local Development** (What you're doing now)

When you run:
```powershell
npx supabase functions serve --env-file supabase/.env
```

**What happens:**
- Functions run on **YOUR local machine** (your computer)
- They're accessible at `http://localhost:9999`
- They're **NOT** running in the cloud
- This is a **local emulator** for testing

**Architecture:**
```
Your Computer (localhost:9999)
├── uploads function (running locally)
├── textract-worker function (running locally)
├── chat function (running locally)
└── ... other functions
```

**Database:**
- Still connects to **production Supabase database** (cloud)
- But functions themselves run locally

---

### ☁️ **Production** (Deployed)

When you deploy:
```powershell
npx supabase functions deploy textract-worker --project-ref akxdroedpsvmckvqvggr
```

**What happens:**
- Functions run on **Supabase's cloud infrastructure** (Deno Deploy)
- They're accessible at `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/...`
- They're running in **Supabase's cloud servers**
- This is the **production environment**

**Architecture:**
```
Supabase Cloud (Deno Deploy)
├── uploads function (running in cloud)
├── textract-worker function (running in cloud)
├── chat function (running in cloud)
└── ... other functions
```

**Database:**
- Connects to the same **production Supabase database**

---

## Key Differences

| Aspect | Local (`functions serve`) | Production (Deployed) |
|--------|-------------------------|----------------------|
| **Where it runs** | Your computer | Supabase cloud (Deno Deploy) |
| **URL** | `http://localhost:9999` | `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1` |
| **Environment** | `.env.local` + `supabase/.env` | Supabase Dashboard → Secrets |
| **Database** | Production (shared) | Production (shared) |
| **Purpose** | Development/testing | Live production |
| **Logs** | Your terminal | Supabase Dashboard → Logs |

---

## What You're Seeing

Based on your logs showing `localhost:9999`, you're running **locally**:

```
Listening on http://localhost:9999/
=== Uploads Edge Function Request Start ===
```

This means:
- ✅ Functions are running on **your local machine**
- ✅ They're **NOT** in the cloud
- ✅ This is for **local testing**

---

## Why This Matters for RAG

### Local Testing:
1. **Frontend** (`npm run dev`) → Runs on `localhost:8080`
2. **Edge Functions** (`supabase functions serve`) → Run on `localhost:9999`
3. **Database** → Still production (cloud)
4. **S3** → Still production (cloud)

**Configuration:**
- `.env.local` should have: `VITE_SUPABASE_FUNCTIONS_URL=http://localhost:9999`
- `supabase/.env` should have: `OPENAI_API_KEY`, `SUPABASE_URL`, etc.

### Production:
1. **Frontend** (Vercel) → Runs on your production domain
2. **Edge Functions** (Supabase) → Run on `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
3. **Database** → Production (cloud)
4. **S3** → Production (cloud)

**Configuration:**
- Vercel env vars: `VITE_SUPABASE_FUNCTIONS_URL=https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
- Supabase secrets: `OPENAI_API_KEY`, `PROJECT_URL`, etc.

---

## Checking Which Environment You're Using

### In Browser Console:

**Local:**
```javascript
// Should show:
[triggerTextractJob] Calling: http://localhost:9999/textract-worker
```

**Production:**
```javascript
// Should show:
[triggerTextractJob] Calling: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker
```

### In Terminal:

**Local:**
```
Listening on http://localhost:9999/
booted (time: 27ms)
```

**Production:**
- No terminal output (functions run in cloud)
- Check Supabase Dashboard → Edge Functions → Logs

---

## Summary

**You asked:** "Isn't Supabase running on a cloud terminal or microservice edge function?"

**Answer:**
- **When deployed:** Yes, functions run in Supabase's cloud (Deno Deploy microservices)
- **When running locally:** No, functions run on your local machine (`localhost:9999`)

**Right now:** You're running locally, so functions are on your computer, not in the cloud.

**To use cloud functions:** Deploy them with `npx supabase functions deploy ...`



