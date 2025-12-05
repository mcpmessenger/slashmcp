# Deployment Instructions - Document Upload Timeout Fixes

## ✅ Supabase Function Deployed

The `textract-worker` function has been deployed to Supabase with timeout fixes.

**Deployment Status:** ✅ Complete
- Function: `textract-worker`
- Project: `akxdroedpsvmckvqvggr`
- Changes: Timeout handling for embedding generation and overall worker execution

---

## 🚀 Frontend Deployment (Vercel)

### Option 1: Automatic Deployment (Recommended)

The frontend changes will automatically deploy to Vercel when you push to `main` branch:

```bash
# Push the committed changes
git push origin main
```

The GitHub Actions workflow (`.github/workflows/deploy.yml`) will:
1. Build the frontend
2. Deploy to Vercel production
3. Complete in ~2-3 minutes

**Check deployment status:**
- GitHub Actions: https://github.com/YOUR_REPO/actions
- Vercel Dashboard: https://vercel.com/dashboard

---

### Option 2: Manual Vercel Deployment (Faster Testing)

If you want to test immediately without waiting for GitHub Actions:

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Deploy to production
vercel --prod
```

Or deploy to preview:
```bash
vercel
```

---

## 📋 What Was Fixed

### Backend (Supabase Functions)
- ✅ **Embedding Generation Timeout**: 30s per batch, 5min total
- ✅ **Worker Overall Timeout**: 50s before Supabase's 60s limit
- ✅ **Progress Logging**: Shows progress for large documents
- ✅ **Graceful Error Handling**: Timeout errors are caught and reported

### Frontend (Vercel)
- ✅ **API Call Timeouts**: 
  - `triggerTextractJob()`: 30s timeout
  - `fetchJobStatus()`: 10s timeout
- ✅ **Error Messages**: User-friendly timeout error messages

---

## 🧪 Testing After Deployment

### Test Small Document (< 10 pages)
1. Upload a small PDF or image
2. Should complete in < 30 seconds
3. Should show "completed" status
4. Should be queryable in chat

### Test Medium Document (100 pages)
1. Upload a medium-sized document
2. Should complete in < 2 minutes
3. Should show progress updates
4. Should generate embeddings successfully

### Test Large Document (1000+ pages)
1. Upload a large document
2. Should either:
   - Complete successfully (if within timeout limits)
   - Show clear timeout error (if exceeds limits)
3. **Should NOT hang indefinitely** ✅

---

## 🔍 Monitoring

### Check Supabase Function Logs
1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions
2. Click on `textract-worker`
3. View logs for timeout events

### Check Vercel Deployment
1. Go to: https://vercel.com/dashboard
2. Find your project
3. Check latest deployment status

### Check Browser Console
- Open DevTools → Console
- Look for timeout error messages
- Should see clear error messages instead of hanging

---

## ⚠️ If Issues Persist

1. **Clear browser cache** - Old JavaScript might be cached
2. **Hard refresh** - Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. **Check function logs** - Verify timeout errors are being logged
4. **Check network tab** - Verify API calls are timing out properly

---

## 📝 Next Steps

1. **Push to GitHub** to trigger automatic Vercel deployment:
   ```bash
   git push origin main
   ```

2. **Wait for deployment** (~2-3 minutes)

3. **Test document upload** with various file sizes

4. **Monitor logs** for any timeout events

5. **Adjust timeouts if needed** based on real-world usage

---

## 🎯 Success Criteria

The fix is successful when:
- ✅ Small documents process quickly
- ✅ Large documents either complete or show timeout error
- ✅ **No indefinite hanging states**
- ✅ Clear error messages shown to users
- ✅ RAG pipeline works for successfully indexed documents


