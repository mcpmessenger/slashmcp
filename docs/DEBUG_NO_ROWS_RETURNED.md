# Debug: "Success. No rows returned"

## What This Means

The query is working (no RLS errors), but no documents are found. This could mean:

1. **No documents exist** for that user_id
2. **User ID mismatch** - The query is using a different user_id than the documents have
3. **Documents have different analysis_target** - Documents exist but don't match the filter

## Step 1: Check What User ID is Being Used

### In Browser Console (F12)
Look for this log:
```
[DocumentsSidebar] Query parameters: {
  userId: "...",
  ...
}
```

Copy that `userId` value.

### In Supabase SQL Editor
Run this to see ALL documents (regardless of user):
```sql
SELECT 
  id,
  file_name,
  user_id,
  analysis_target,
  status,
  created_at
FROM processing_jobs
ORDER BY created_at DESC
LIMIT 20;
```

**This will show:**
- Do documents exist at all?
- What `user_id` do they have?
- What `analysis_target` do they have?

## Step 2: Compare User IDs

### Check Your Current User ID
In Supabase SQL Editor:
```sql
-- Get your current authenticated user ID
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;
```

### Check Documents' User IDs
```sql
-- See what user_ids exist in processing_jobs
SELECT DISTINCT user_id, COUNT(*) as document_count
FROM processing_jobs
GROUP BY user_id
ORDER BY document_count DESC;
```

## Step 3: Check Analysis Target

Documents might exist but have a different `analysis_target`:

```sql
-- See all analysis_target values
SELECT DISTINCT analysis_target, COUNT(*) as count
FROM processing_jobs
GROUP BY analysis_target;
```

**Common values:**
- `document-analysis` (what the query looks for)
- `image-ocr`
- `image-generation`
- `audio-transcription`

## Step 4: Test Query with Actual User ID

If you found documents with a specific `user_id`, test the query:

```sql
-- Replace USER_ID_HERE with the actual user_id from Step 2
SELECT 
  id,
  file_name,
  user_id,
  analysis_target,
  status
FROM processing_jobs
WHERE user_id = 'USER_ID_HERE'
  AND analysis_target = 'document-analysis'
ORDER BY created_at DESC;
```

## Common Issues

### Issue 1: Documents Have NULL user_id
**Symptom:** Documents exist but `user_id` is NULL
**Fix:** Documents might have been uploaded before user authentication was set up

**Check:**
```sql
SELECT COUNT(*) 
FROM processing_jobs 
WHERE user_id IS NULL;
```

### Issue 2: Guest Mode Documents
**Symptom:** Documents uploaded in guest mode might not have a `user_id`
**Fix:** Guest users can't upload documents, so this shouldn't happen

### Issue 3: Different Analysis Target
**Symptom:** Documents exist but have `analysis_target` = 'image-ocr' instead of 'document-analysis'
**Fix:** The fallback query should catch this, but check console logs

## Next Steps

1. **Run the "see ALL documents" query** to verify documents exist
2. **Compare user_ids** - Does the query user_id match the documents' user_id?
3. **Check analysis_target** - Do documents have the right analysis_target?
4. **Check console logs** - The enhanced logging will show exactly what's happening

## If Documents Exist But Query Finds None

The fallback query should show ALL jobs for the user. Check console for:
```
[DocumentsSidebar] Fallback query loaded X total jobs
[DocumentsSidebar] Analysis targets found: [...]
```

This will tell you what analysis_target values actually exist.
