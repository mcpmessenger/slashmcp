# Deployment Summary - RAG Orchestrator Integration

## What Needs Deployment

### ✅ Frontend Changes → GitHub/Vercel (Auto-deploy)

**Files to commit:**
- `src/lib/ragService.ts` - Fixed upload/process
- `src/pages/Index.tsx` - Removed separate RAG components, added sidebar
- `src/components/DocumentsSidebar.tsx` - New documents sidebar component
- `eslint.config.js` - Updated to ignore docs folder

**Deployment method:**
- Commit and push to GitHub `main` branch
- Vercel will **automatically deploy** via GitHub Actions workflow
- Takes ~2-3 minutes

### ⚠️ Backend Changes → Supabase (Manual deployment required)

**Edge Functions to deploy:**
- `supabase/functions/_shared/orchestration/tools.ts` - Added RAG tools
- `supabase/functions/_shared/orchestration/agents.ts` - Updated orchestrator instructions
- `supabase/functions/_shared/orchestration/index.ts` - Exported new tools
- `supabase/functions/agent-orchestrator-v1/index.ts` - Added RAG tools to orchestrator

**Deployment method:**
- **NOT via GitHub/Vercel** - Edge Functions deploy separately to Supabase
- Must deploy manually using Supabase CLI

---

## Deployment Steps

### Step 1: Commit Frontend Changes (for Vercel)

```bash
# Stage frontend files
git add src/lib/ragService.ts
git add src/pages/Index.tsx
git add src/components/DocumentsSidebar.tsx
git add eslint.config.js

# Optional: Add documentation
git add docs/RAG_ORCHESTRATOR_*.md

# Commit
git commit -m "Integrate RAG into orchestrator and add documents sidebar

- Fix upload/process functionality
- Add RAG tools to orchestrator (search_documents, list_documents, get_document_status)
- Create DocumentsSidebar component with thumbnails
- Remove separate RAG components, unify into single chat
- Add /help command to orchestrator
- Update orchestrator to automatically use document search"

# Push to GitHub (triggers Vercel auto-deployment)
git push origin main
```

**Result:** Vercel will automatically build and deploy the frontend in ~2-3 minutes.

---

### Step 2: Deploy Edge Functions (for Supabase)

**Option A: Using PowerShell Script (if you have one)**

```powershell
# Set access token
$env:SUPABASE_ACCESS_TOKEN = "your-access-token-here"

# Deploy orchestrator function
npx supabase functions deploy agent-orchestrator-v1 --project-ref akxdroedpsvmckvqvggr
```

**Option B: Manual Deployment**

```bash
# Get Supabase access token from: https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN="your-token-here"

# Deploy the orchestrator function
npx supabase functions deploy agent-orchestrator-v1 --project-ref akxdroedpsvmckvqvggr
```

**Why separate deployment?**
- Edge Functions run on Supabase infrastructure, not Vercel
- They're deployed independently of the frontend
- Changes to Edge Functions don't trigger Vercel rebuilds

---

## What Gets Deployed Where

| Component | Deployment Method | Trigger |
|-----------|------------------|---------|
| **Frontend (React)** | Vercel (via GitHub) | Push to `main` branch |
| **Edge Functions** | Supabase CLI | Manual `supabase functions deploy` |
| **Database** | Supabase Dashboard | SQL migrations (already applied) |

---

## Verification

### After Frontend Deployment (Vercel):
1. Check Vercel dashboard: https://vercel.com/dashboard
2. Verify new deployment appears
3. Test in production:
   - Documents sidebar appears on left
   - File upload works
   - Chat interface unified

### After Edge Function Deployment (Supabase):
1. Check Supabase dashboard: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions
2. Verify `agent-orchestrator-v1` shows as "Active"
3. Test in production:
   - Ask: "What documents do I have?" → Should list documents
   - Ask: "What does my document say about X?" → Should search automatically
   - Type: `/help` → Should show comprehensive help

---

## Quick Deployment Commands

**Frontend (one-liner):**
```bash
git add src/ eslint.config.js docs/RAG_ORCHESTRATOR_*.md && \
git commit -m "Integrate RAG into orchestrator" && \
git push origin main
```

**Backend (one-liner):**
```bash
npx supabase functions deploy agent-orchestrator-v1 --project-ref akxdroedpsvmckvqvggr
```

---

*Deployment guide created: January 2025*

