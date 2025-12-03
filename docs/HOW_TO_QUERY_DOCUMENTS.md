# How to Query Documents in MCP Messenger

## Document Processing Pipeline

Documents must go through several stages before they can be queried:

1. **Registered** → Job created in database
2. **Uploaded** → File uploaded to S3
3. **Processing** → Text extraction in progress
4. **Extracted** → Text extracted and stored
5. **Indexed** → Embeddings generated (for RAG)
6. **Ready for Query** → Document can be used in chat

## Current Status Requirements

For a document to be queryable, it must have:
- **Status:** `completed`
- **Stage:** `extracted` OR `injected` OR `indexed`

## How to Query Documents

### Method 1: Automatic Context (Recommended)

Once a document reaches `extracted` or `indexed` stage:

1. **Upload your document** (PDF, image, CSV, etc.)
2. **Wait for processing** - Watch the status in "File Uploads" section
3. **Status should show:** `completed` with stage `extracted` or `indexed`
4. **Ask questions naturally:**
   - "What can you tell me about the documents?"
   - "Summarize the uploaded PDF"
   - "What are the key points in the document?"

The system will automatically:
- Include document context in your query
- Use vector search (if indexed) or full text (if extracted)
- Provide relevant information from the document

### Method 2: Explicit Reference

You can also reference specific documents:

- "What does Architecture and Core Components.pdf say about..."
- "Based on the uploaded document, explain..."

## Troubleshooting

### Document Stuck at "Uploaded" Stage

If your document shows `STAGE: Uploaded` but never processes:

1. **Check console for errors:**
   - Look for "Textract worker failed" errors
   - Check for "Failed to fetch" errors

2. **Manual trigger (if needed):**
   - The system should auto-retry, but you can refresh the page
   - Or wait for the polling mechanism (every 3 seconds)

3. **Check job status:**
   - Open browser console
   - Look for `[Index] Polling X job(s)` logs
   - Check if status updates

### Document Context Payload Length: 0

This means no documents are ready for querying. Check:

1. **Document status** - Must be `completed`
2. **Document stage** - Must be `extracted`, `injected`, or `indexed`
3. **Processing errors** - Check console for worker failures

### "Failed to fetch" Error

This indicates the textract-worker function call is failing:

**Possible causes:**
- Network/CORS issue
- Function not deployed
- Authentication issue
- Function timeout

**Solutions:**
1. Check Supabase function logs
2. Verify function is deployed: `npx supabase functions list --project-ref akxdroedpsvmckvqvggr`
3. Check browser network tab for failed requests
4. Try refreshing the page

## Expected Behavior

### Successful Processing Flow:

```
1. Upload file → "Registering upload..."
2. File uploaded → "STAGE: Uploaded"
3. Processing starts → "STAGE: Processing"
4. Text extracted → "STAGE: Extracted"
5. Embeddings generated → "STAGE: Indexed" (optional)
6. Ready for query → Status: "completed"
```

### Query Flow:

```
1. User asks: "What can you tell me about the documents?"
2. System checks: Are there completed documents?
3. If yes: Retrieves document context (vector search or full text)
4. If no: Responds that documents are still processing
5. LLM generates response with document context
```

## Best Practices

1. **Wait for processing** - Don't query immediately after upload
2. **Check status** - Look for "completed" status before querying
3. **Use specific questions** - More specific queries get better results
4. **Multiple documents** - System can query multiple documents at once
5. **Large documents** - May take longer to process (5+ minutes for 1000+ pages)

## Status Indicators

| Status | Stage | Queryable? | What It Means |
|--------|-------|------------|---------------|
| `queued` | `registered` | ❌ No | Job created, waiting to start |
| `uploading` | `uploaded` | ❌ No | File uploading to S3 |
| `processing` | `processing` | ❌ No | Text extraction in progress |
| `completed` | `extracted` | ✅ Yes | Text extracted, ready for query |
| `completed` | `indexed` | ✅ Yes | Embeddings generated, RAG ready |
| `failed` | `failed` | ❌ No | Processing failed, check errors |

## Example Queries

Once your document is processed, try:

- **General:** "What is this document about?"
- **Specific:** "What does it say about architecture?"
- **Summary:** "Give me a summary of the key points"
- **Extraction:** "What are the main components mentioned?"
- **Comparison:** "Compare this with [another document]"

## Debugging

To see what's happening:

1. **Open browser console** (F12)
2. **Look for logs:**
   - `[Index] Polling X job(s)` - Background polling
   - `[Upload] Polling job X` - Upload polling
   - `[useChat] Document context payload length: X` - Context included
3. **Check network tab:**
   - `/functions/v1/textract-worker` - Processing requests
   - `/functions/v1/job-status` - Status checks
   - `/functions/v1/doc-context` - Context retrieval

## Next Steps

If your document is stuck:
1. Check the console errors
2. Verify the textract-worker function is working
3. Check Supabase function logs
4. Try uploading a smaller test document first

