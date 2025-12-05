# Quick Local Test Guide

## Steps to Test DocumentsSidebar Fix Locally

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Open browser:**
   - Go to `http://localhost:8080`
   - Open DevTools Console (F12)

3. **Sign in with Google:**
   - Click "Sign in with Google"
   - Complete OAuth (will redirect to localhost, not Vercel)
   - Make sure Supabase Dashboard has `http://localhost:8080/auth/callback` in redirect URLs

4. **Check console logs:**
   - Look for: `[DocumentsSidebar] About to call loadDocuments() after 500ms delay...`
   - Should see documents load after ~500ms
   - No more "Loading documents..." stuck state

5. **Test document upload:**
   - Upload a document
   - Check if it appears in sidebar after upload completes

## What to Look For

✅ **Success indicators:**
- Console shows: `[DocumentsSidebar] ✅ Successfully loaded X document(s)`
- Documents appear in sidebar
- No timeout errors

❌ **If still stuck:**
- Check console for errors
- Verify Supabase client is initialized
- Check network tab for failed requests

