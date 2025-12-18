# Testing Document Context Auto-Inclusion

This guide helps you test that uploaded documents are automatically included in chat context.

## Quick Test Steps

### 1. Upload a Document
1. Open your app
2. Upload a document (PDF, DOCX, etc.) via the document upload interface
3. Wait for it to process (check status in Documents Sidebar)
   - Status should be "completed"
   - Stage should be one of: "extracted", "indexed", or "injected"

### 2. Test Without Explicitly Attaching Document
1. **IMPORTANT**: Send a chat message WITHOUT clicking/selecting the document in the sidebar
2. Ask a question that should be answerable from your document
   - Example: "What does my document say?"
   - Example: "Summarize the key points from my uploaded file"
   - Example: Ask about specific content you know is in the document

### 3. Verify It's Working

#### What to Look For:

✅ **Success Indicators:**
- Chat response includes information from your document
- The response references content that's in your uploaded document
- You see document context being included automatically

✅ **In Browser Console (F12):**
Look for these log messages:
```
[useChat] Document context payload length: 0
No document context provided, auto-querying for available documents
Auto-queried X available document(s) for user <user-id>
Auto-retrieved context for X document(s)
```

✅ **In Network Tab:**
- Check the `/functions/v1/chat` request
- Verify `documentContext` field in the request payload (should be empty array `[]` or missing)
- The server should automatically query documents server-side

### 4. Test Edge Cases

#### Test Case 1: Multiple Documents
1. Upload 2-3 documents
2. Ask a question that should match content from all of them
3. Verify all relevant documents are included

#### Test Case 2: Document Still Processing
1. Upload a document
2. Immediately ask a question about it (before processing completes)
3. Should get a message saying document is still processing

#### Test Case 3: No Documents
1. Make sure you have no uploaded documents
2. Ask a question
3. Should work normally without document context

#### Test Case 4: Explicit Document Attachment
1. Upload a document
2. **Explicitly select/attach** the document from sidebar
3. Ask a question
4. Should still work (backward compatibility)

## Manual Verification in Database

If you want to verify documents are being queried correctly:

```sql
-- Check your documents
SELECT 
  id,
  file_name,
  status,
  metadata->>'job_stage' as stage,
  created_at
FROM processing_jobs
WHERE user_id = '<your-user-id>'
  AND status = 'completed'
  AND metadata->>'job_stage' IN ('extracted', 'indexed', 'injected')
ORDER BY created_at DESC;
```

## Expected Behavior

### Before Fix:
- ❌ Documents only included if explicitly attached
- ❌ Chat not aware of uploaded documents unless manually selected
- ❌ Need to click document in sidebar before asking questions

### After Fix:
- ✅ Documents automatically queried and included
- ✅ Chat is aware of all uploaded documents
- ✅ Can ask questions immediately after upload completes
- ✅ Explicit attachment still works (backward compatible)

## Troubleshooting

### Documents Not Being Included?

1. **Check Document Status:**
   - Must be `status = 'completed'`
   - Must have stage: `extracted`, `indexed`, or `injected`

2. **Check Console Logs:**
   - Look for error messages about document context retrieval
   - Check if `DOC_CONTEXT_URL` is configured correctly

3. **Check Authentication:**
   - Must be logged in (has `user.id`)
   - Guest mode may not work (needs user ID)

4. **Check Database:**
   - Verify documents exist in `processing_jobs` table
   - Check RLS policies allow access

### Still Not Working?

Check the server logs (Supabase Edge Function logs):
- Look for "No document context provided, auto-querying for available documents"
- Look for "Auto-queried X available document(s)"
- Look for any errors in document context retrieval
