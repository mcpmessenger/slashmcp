# Local Testing Guide: Document Context Auto-Inclusion

This guide shows you how to test the document context fix locally before deploying.

## Prerequisites

1. **Supabase CLI** installed
   ```bash
   npm install -g supabase
   # or
   npx supabase --version
   ```

2. **Node.js 18+** and npm/pnpm

3. **Supabase Project** with:
   - Database migrations applied
   - Edge functions deployed (at least `chat` and `doc-context`)
   - Environment variables configured

## Step 1: Set Up Environment Variables

Create or update `.env.local` in your project root:

```bash
# Frontend (required)
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key

# Backend Functions (for local testing)
PROJECT_URL=https://your-project-ref.supabase.co
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=your-openai-key
```

**OR** create `supabase/.env` for function testing:

```bash
PROJECT_URL=https://your-project-ref.supabase.co
SUPABASE_URL=https://your-project-ref.supabase.co
SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=your-openai-key
```

## Step 2: Start Local Development

### Option A: Test with Remote Functions (Recommended)

This is the easiest way - uses your deployed Supabase functions:

```bash
# Terminal 1: Start frontend dev server
npm run dev
# or
pnpm dev
```

Your app will run at `http://localhost:5173` (or another port if 5173 is busy).

The frontend will connect to your **remote** Supabase functions, so any changes you made to `supabase/functions/chat/index.ts` need to be deployed first.

### Option B: Test with Local Functions (Advanced)

For testing code changes before deployment:

```bash
# Terminal 1: Start Supabase functions locally
supabase functions serve chat doc-context --env-file supabase/.env --no-verify-jwt

# Terminal 2: Start frontend dev server
npm run dev
```

**Note:** The functions will run on `http://localhost:54321/functions/v1/` by default. You may need to update your frontend to point to this URL for local testing, or use a proxy.

## Step 3: Test Document Context Auto-Inclusion

### Test Scenario 1: Upload and Query (No Explicit Attachment)

1. **Open the app** in your browser (`http://localhost:5173`)

2. **Sign in** (required - document context needs a user ID)

3. **Upload a test document:**
   - Click "Upload Files" or use the document upload interface
   - Upload a PDF or DOCX file
   - Wait for processing to complete
   - Check the Documents Sidebar - status should be "completed" with stage "indexed" or "extracted"

4. **Test without attaching:**
   - **DO NOT** click on the document in the sidebar
   - Just send a chat message like:
     - "What does my document say?"
     - "Summarize my uploaded file"
     - Ask about specific content from your document

5. **Verify it works:**
   - Check browser console (F12) for logs:
     ```
     [useChat] Document context payload length: 0
     ```
   - If using local functions, check terminal logs for:
     ```
     No document context provided, auto-querying for available documents
     Auto-queried X available document(s) for user <user-id>
     Auto-retrieved context for X document(s)
     ```
   - The chat response should include information from your document

### Test Scenario 2: Verify Backward Compatibility

1. Upload a document
2. **Explicitly click/attach** the document from the sidebar
3. Ask a question about it
4. Should still work as before (backward compatible)

### Test Scenario 3: Multiple Documents

1. Upload 2-3 documents
2. Wait for all to process
3. Ask a question that should match content from multiple documents
4. Verify all relevant documents are included

## Step 4: Check Logs

### Browser Console (F12)
Look for:
- `[useChat] Document context payload length: 0` - means no docs explicitly attached
- Network tab: Check `/functions/v1/chat` request payload - `documentContext` should be `[]` or missing

### Local Function Logs (if using Option B)
Check the terminal where you ran `supabase functions serve`:
- Should see "No document context provided, auto-querying..."
- Should see "Auto-queried X available document(s)"
- Should see "Auto-retrieved context for X document(s)"

### Remote Function Logs (if using Option A)
Check Supabase Dashboard → Edge Functions → `chat` → Logs:
- Look for the same messages as above

## Step 5: Test Edge Cases

### Test 1: Document Still Processing
1. Upload a document
2. Immediately ask about it (before processing completes)
3. Should get message saying document is processing

### Test 2: No Documents
1. Make sure you have no uploaded documents
2. Send a normal chat message
3. Should work normally without document context

### Test 3: Guest Mode (May Not Work)
- Document auto-query requires a user ID
- Guest mode may not have a user ID
- This is expected behavior

## Troubleshooting

### Functions Not Running Locally?

```bash
# Make sure you're in the project root
cd /path/to/SlashMCP

# Check Supabase CLI version
supabase --version

# Link to your project (if needed)
supabase link --project-ref your-project-ref

# Try serving with verbose output
supabase functions serve chat --env-file supabase/.env --debug
```

### Document Context Not Being Included?

1. **Check document status:**
   - Must be `status = 'completed'`
   - Must have stage: `extracted`, `indexed`, or `injected`

2. **Check authentication:**
   - Must be logged in (not guest mode)
   - User ID must exist

3. **Check environment variables:**
   - Verify `PROJECT_URL` and `SUPABASE_URL` are set correctly
   - Verify `SERVICE_ROLE_KEY` is set for admin queries

4. **Check function logs:**
   - Look for errors in console/terminal
   - Check if `DOC_CONTEXT_URL` is configured

### Code Changes Not Reflecting?

If you made changes to `supabase/functions/chat/index.ts`:

- **Option A (Remote):** You need to deploy first:
  ```bash
  supabase functions deploy chat --project-ref your-project-ref
  ```

- **Option B (Local):** Make sure you're serving functions locally and frontend points to local URL

## Quick Test Checklist

- [ ] Environment variables set up
- [ ] Dev server running (`npm run dev`)
- [ ] Functions running (local or remote)
- [ ] User is logged in
- [ ] Document uploaded and processed
- [ ] Document status is "completed" with stage "indexed"/"extracted"
- [ ] Sent chat message WITHOUT clicking document
- [ ] Checked console for auto-query logs
- [ ] Chat response includes document content
- [ ] Tested explicit attachment (backward compatibility)
- [ ] Tested edge cases

## Deployment After Testing

Once you've verified it works locally:

1. **Deploy the chat function:**
   ```bash
   supabase functions deploy chat --project-ref your-project-ref
   ```

2. **Verify deployment:**
   - Check Supabase dashboard → Functions → chat → Logs
   - Test again on production/staging

3. **Monitor logs:**
   - Watch for any errors in production
   - Check that auto-query is working

## Alternative: Test with Remote Functions Only

If you just want to verify the fix works without setting up local functions:

1. Deploy your changes:
   ```bash
   supabase functions deploy chat --project-ref your-project-ref
   ```

2. Run frontend locally:
   ```bash
   npm run dev
   ```

3. Test in browser - it will use deployed functions but you can test quickly without full local setup
