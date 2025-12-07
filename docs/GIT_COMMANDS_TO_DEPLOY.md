# Git Commands to Deploy to GitHub (Vercel Auto-Deploy)

## Quick Commands

```bash
# 1. Check what files have changed
git status

# 2. Add all changed files
git add .

# 3. Commit with descriptive message
git commit -m "Fix: DocumentsSidebar infinite loop, add summaries, always show sidebar, fix stuck loading state"

# 4. Push to GitHub (triggers Vercel deployment)
git push origin main
```

## Step-by-Step

### Step 1: Check Changes
```bash
git status
```
Shows which files have been modified.

### Step 2: Stage Changes
```bash
# Add all changes
git add .

# OR add specific files
git add src/components/DocumentsSidebar.tsx
git add src/pages/Index.tsx
git add src/hooks/useChat.ts
git add supabase/functions/playwright-wrapper/index.ts
```

### Step 3: Commit
```bash
git commit -m "Fix: DocumentsSidebar infinite loop, add summaries, always show sidebar, fix stuck loading state"
```

**Or use a more detailed message:**
```bash
git commit -m "Fix: DocumentsSidebar improvements

- Fix infinite refresh loop with debouncing
- Add document summaries display in sidebar
- Always show sidebar when authenticated
- Add query timeout and safety timeout
- Improve error handling and loading state management
- Add browser_extract_text command with Craigslist/Facebook parsing"
```

### Step 4: Push to GitHub
```bash
git push origin main
```

This will:
- Push changes to GitHub
- Trigger GitHub Actions workflow (if configured)
- Auto-deploy to Vercel production
- Take ~2-3 minutes

## Verify Deployment

After pushing:

1. **Check GitHub:**
   - Go to: https://github.com/YOUR_REPO
   - Check latest commit appears

2. **Check Vercel:**
   - Go to: https://vercel.com/dashboard
   - Look for new deployment
   - Wait for build to complete (~2-3 min)

3. **Check Production:**
   - Visit your production URL
   - Test sidebar appears
   - Test document upload

## If You Get Errors

### "Nothing to commit"
```bash
# Check if files are already committed
git status
# If all clean, changes might already be pushed
```

### "Your branch is ahead"
```bash
# Just push it
git push origin main
```

### "Authentication required"
```bash
# You may need to authenticate with GitHub
# Use GitHub CLI or set up SSH keys
```

## One-Liner (If Everything is Ready)

```bash
git add . && git commit -m "Fix: DocumentsSidebar infinite loop, add summaries, always show sidebar" && git push origin main
```

## What Gets Deployed

**Frontend (Vercel via GitHub):**
- ✅ DocumentsSidebar component fixes
- ✅ Index.tsx infinite loop fix
- ✅ useChat.ts result formatting
- ✅ All React/TypeScript changes

**Backend (Supabase - Manual):**
- ⚠️ Edge Functions need separate deployment (see `deploy-now.ps1`)
