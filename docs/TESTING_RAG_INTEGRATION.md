# Testing RAG Integration Guide

**Date:** January 2025  
**Status:** 🧪 Testing Guide

---

## Prerequisites

Before testing, ensure you have:

1. ✅ **Development server running**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

2. ✅ **Supabase project configured**
   - Environment variables set in `.env` or `.env.local`:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_PUBLISHABLE_KEY`
     - `VITE_SUPABASE_FUNCTIONS_URL` (optional, auto-detected)

3. ✅ **Backend Edge Functions deployed**
   - `uploads` - For file upload registration
   - `doc-context` - For semantic search
   - `textract-worker` - For document processing
   - `job-status` - For job status polling

4. ✅ **Database migrations applied**
   - `document_embeddings` table exists
   - `processing_jobs` table exists
   - `search_document_embeddings` function exists

5. ✅ **OpenAI API Key configured** (for embeddings)
   - Set in Supabase Edge Function secrets: `OPENAI_API_KEY`

---

## Testing Checklist

### Phase 1: Component Visibility

#### Test 1.1: Components Appear When Authenticated

1. **Start the dev server**
   ```bash
   npm run dev
   ```

2. **Open the app** in your browser (usually `http://localhost:5173`)

3. **Sign in** with Google OAuth (or use guest mode)

4. **Verify components are visible:**
   - ✅ You should see "Upload Document for Semantic Search" card
   - ✅ You should see "Semantic Document Search (RAG)" card
   - ✅ Both should appear at the top of the chat area

**Expected Result:** Both components are visible and properly styled.

**If components don't appear:**
- Check browser console for errors
- Verify imports in `src/pages/Index.tsx`
- Check that `session || guestMode` is truthy

---

### Phase 2: Document Upload

#### Test 2.1: File Selection

1. **Click "Choose File"** in the DocumentUpload component

2. **Select a test document:**
   - PDF file (recommended: small PDF, < 5MB)
   - Text file (.txt)
   - Image file (.png, .jpg)
   - CSV file (.csv)

3. **Verify file is selected:**
   - ✅ File name appears below the input
   - ✅ File size is displayed
   - ✅ "Upload & Process" button is enabled

**Expected Result:** File is selected and ready to upload.

---

#### Test 2.2: Upload Process

1. **Click "Upload & Process"** button

2. **Watch for status changes:**
   - ✅ Button shows "Processing..." with spinner
   - ✅ Status changes to "uploading"
   - ✅ Status changes to "processing"
   - ✅ Job ID appears below status

3. **Check browser console:**
   ```javascript
   // Should see logs like:
   [triggerTextractJob] Calling: https://.../textract-worker
   [triggerTextractJob] Success for job <job-id>
   ```

4. **Monitor status polling:**
   - Status updates every 3 seconds
   - Should progress through: `uploading` → `processing` → `completed`

**Expected Result:** File uploads successfully and processing starts.

**Common Issues:**
- **Upload fails immediately:** Check network tab for API errors
- **Status stuck on "uploading":** Check if presigned URL upload succeeded
- **Status stuck on "processing":** Check textract-worker logs in Supabase dashboard

---

#### Test 2.3: Processing Completion

1. **Wait for processing to complete** (usually 30-60 seconds for small files)

2. **Verify completion:**
   - ✅ Status shows "completed"
   - ✅ Green success indicator appears
   - ✅ Toast notification: "Document Processing Complete"
   - ✅ Status polling stops automatically

3. **Check database** (optional, via Supabase dashboard):
   ```sql
   SELECT id, file_name, status, metadata 
   FROM processing_jobs 
   WHERE status = 'completed' 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```
   - Verify `status = 'completed'`
   - Verify `metadata->>'job_stage'` is `'extracted'` or `'indexed'`

4. **Check embeddings** (if stage is 'indexed'):
   ```sql
   SELECT COUNT(*) 
   FROM document_embeddings 
   WHERE job_id = '<your-job-id>';
   ```
   - Should have > 0 embeddings

**Expected Result:** Document is fully processed and ready for search.

**If processing fails:**
- Check Supabase Edge Function logs for `textract-worker`
- Verify AWS credentials are configured (if using Textract)
- Check OpenAI API key is set (for embeddings)

---

### Phase 3: Semantic Search

#### Test 3.1: Search Interface

1. **Verify search component is ready:**
   - ✅ Input field is enabled
   - ✅ "Search" button is enabled
   - ✅ Shows "X document(s) available for search" (where X > 0)

2. **If no documents available:**
   - Upload a document first (see Phase 2)
   - Wait for it to complete processing
   - Refresh the page or wait for auto-refresh

**Expected Result:** Search interface is ready with available documents.

---

#### Test 3.2: Query Validation

1. **Test short query** (< 10 characters):
   - Enter: "test"
   - Click "Search"
   - ✅ Should show error toast: "Query too short"
   - ✅ Should not perform search

2. **Test empty query:**
   - Leave input empty
   - Click "Search"
   - ✅ Should show error toast: "Query required"

**Expected Result:** Validation prevents invalid queries.

---

#### Test 3.3: Semantic Search Execution

1. **Enter a valid query** (≥ 10 characters):
   - Example: "What is the main topic of this document?"
   - Example: "Summarize the key points"
   - Example: "What information does this contain?"

2. **Click "Search"** or press Enter

3. **Watch for loading state:**
   - ✅ Button shows "Searching..." with spinner
   - ✅ Input is disabled during search

4. **Check browser console:**
   ```javascript
   // Should see:
   // Network request to: /functions/v1/doc-context
   // Response with contexts array
   ```

5. **Verify results appear:**
   - ✅ "RAG Response" textarea shows results
   - ✅ "Retrieved Context Chunks" section appears
   - ✅ Chunks show file name and similarity scores
   - ✅ Chunk content is displayed

**Expected Result:** Search returns relevant chunks with similarity scores.

**If search fails:**
- Check browser console for errors
- Verify `doc-context` Edge Function is deployed
- Check Supabase Edge Function logs
- Verify OpenAI API key is configured (for query embeddings)

---

#### Test 3.4: Search Results Quality

1. **Review retrieved chunks:**
   - ✅ Chunks are relevant to the query
   - ✅ Similarity scores are displayed (0-100%)
   - ✅ Higher similarity = more relevant
   - ✅ Chunks are from the correct document

2. **Test different queries:**
   - Try specific questions about document content
   - Try broad questions
   - Try questions about content that might not exist

3. **Verify search mode:**
   - Check console logs for `searchMode: "vector"` or `"legacy"`
   - Vector mode = uses embeddings (better)
   - Legacy mode = fallback to text search

**Expected Result:** Search returns relevant, high-quality results.

---

### Phase 4: Integration with Chat

#### Test 4.1: Document Context in Chat

1. **Upload a document** (if not already done)

2. **Wait for processing to complete**

3. **Send a chat message** that references the document:
   - "What can you tell me about the uploaded document?"
   - "Summarize the document I just uploaded"

4. **Check chat response:**
   - ✅ Chat includes document context
   - ✅ Response references document content
   - ✅ Context is relevant to the query

5. **Check browser console:**
   ```javascript
   // Should see in chat function logs:
   // "Found X queryable documents"
   // "Including document context"
   ```

**Expected Result:** Chat automatically includes document context when available.

---

## Advanced Testing

### Test Multiple Documents

1. **Upload 2-3 different documents**

2. **Wait for all to complete processing**

3. **Perform search:**
   - ✅ Search should search across all documents
   - ✅ Results should show which document each chunk came from
   - ✅ Results should be ranked by relevance

### Test Large Documents

1. **Upload a large PDF** (> 10MB)

2. **Monitor processing:**
   - ✅ Status updates regularly
   - ✅ Processing completes (may take several minutes)
   - ✅ Embeddings are generated for all chunks

3. **Search the large document:**
   - ✅ Search still works
   - ✅ Returns relevant chunks
   - ✅ Performance is acceptable

### Test Error Handling

1. **Network failure during upload:**
   - Disconnect internet
   - Try to upload
   - ✅ Should show error message
   - ✅ Should not crash

2. **Invalid file type:**
   - Try uploading an executable (.exe) or unsupported format
   - ✅ Should show appropriate error

3. **Search with no documents:**
   - Clear all documents (or use fresh account)
   - Try to search
   - ✅ Should show "No documents available" message

---

## Debugging Tips

### Check Browser Console

Open DevTools (F12) and look for:
- ✅ No red errors
- ✅ Network requests to Edge Functions succeed
- ✅ Status polling logs appear

### Check Network Tab

1. **Upload request:**
   - `POST /functions/v1/uploads` - Should return 200
   - Check request/response bodies

2. **Search request:**
   - `POST /functions/v1/doc-context` - Should return 200
   - Check response contains `contexts` array

3. **Status polling:**
   - `GET /functions/v1/job-status?jobId=...` - Should return 200
   - Check response contains job status

### Check Supabase Dashboard

1. **Edge Function Logs:**
   - Go to: Supabase Dashboard → Edge Functions → Logs
   - Check `textract-worker` logs for processing errors
   - Check `doc-context` logs for search errors

2. **Database:**
   - Check `processing_jobs` table for job status
   - Check `document_embeddings` table for embeddings
   - Check `analysis_results` table for extracted text

### Common Issues and Solutions

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Components don't appear | Import error | Check `Index.tsx` imports |
| Upload fails immediately | API not configured | Check environment variables |
| Status stuck on "processing" | Textract worker not triggered | Check `triggerTextractJob` logs |
| Search returns no results | No embeddings generated | Check if stage is "indexed" |
| Search times out | OpenAI API key missing | Check Edge Function secrets |
| Chunks not relevant | Low similarity threshold | Adjust threshold in `ragService.ts` |

---

## Success Criteria

✅ **All tests pass** when:
- Components are visible and functional
- Documents upload successfully
- Processing completes and creates embeddings
- Semantic search returns relevant results
- Search results have reasonable similarity scores (> 70%)
- Chat includes document context automatically
- Error handling works gracefully

---

## Next Steps After Testing

Once testing is complete:

1. **Performance optimization** (if needed)
   - Optimize chunk display for large result sets
   - Add debouncing to search queries
   - Cache document job lists

2. **LLM integration** (for full RAG)
   - Connect search results to chat LLM
   - Generate final answers from retrieved context

3. **UI enhancements**
   - Add document list view
   - Show processing progress bars
   - Add document deletion

---

*Testing guide created: January 2025*

