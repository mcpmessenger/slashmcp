# Fix: "Failed to fetch" Error During File Upload

## Problem

File upload registration succeeds (HTTP 201), but then a "Failed to fetch" error occurs during a subsequent step.

**UPDATE:** Based on console logs, the failure is now pinpointed to **Step 2: S3 Upload**. The `registerUploadJob` succeeds, but the S3 presigned URL upload fails with `TypeError: Failed to fetch`.

## Root Cause Analysis

The upload process has multiple steps:
1. ✅ **Register upload job** - Succeeds (201) - **CONFIRMED WORKING**
2. ❌ **Upload to S3** - **FAILING HERE** - `[ChatInput] S3 upload failed: TypeError: Failed to fetch`
3. ❓ **Update job stage** - Not reached (blocked by S3 failure)
4. ❓ **Trigger vision analysis** - Not reached
5. ❓ **Trigger textract job** - Not reached
6. ❓ **Fetch job status** - Not reached

**Most likely cause:** S3 bucket CORS configuration issue or network connectivity problem.

**See:** `docs/TROUBLESHOOT_S3_UPLOAD.md` for detailed S3-specific troubleshooting.

## Fixes Applied

### 1. Better Error Handling for S3 Upload

Added try-catch around S3 upload with detailed error messages:
```typescript
try {
  uploadResp = await fetch(response.uploadUrl, {...});
} catch (uploadError) {
  // Now shows specific error message
}
```

### 2. Better Error Handling for updateJobStage

Added error handling and logging:
```typescript
try {
  response = await fetch(url, {...});
} catch (fetchError) {
  // Now shows specific error message
}
```

### 3. Better Error Handling for fetchJobStatus

Added error handling and logging:
```typescript
try {
  response = await fetch(url, {...});
} catch (fetchError) {
  // Now shows specific error message
}
```

### 4. Added Detailed Logging

All steps now log:
- When they start
- When they succeed
- When they fail (with details)

## How to Diagnose

After these fixes, check the console logs to see exactly where it fails:

### Expected Log Sequence (Success):
```
[ChatInput] Uploading file to S3 presigned URL...
[ChatInput] S3 upload response: {status: 200, ok: true}
[updateJobStage] Updating job ... to stage: uploaded
[updateJobStage] Successfully updated job ...
[ChatInput] Triggering textract job for: ...
[triggerTextractJob] Success for job ...
[ChatInput] Fetching initial job status...
[fetchJobStatus] Success for job ...: processing
```

### If It Fails, You'll See:
```
[ChatInput] S3 upload failed: ... ❌ (if S3 upload fails)
[updateJobStage] Fetch failed: ... ❌ (if updateJobStage fails)
[triggerTextractJob] Fetch error: ... ❌ (if triggerTextractJob fails)
[fetchJobStatus] Fetch failed: ... ❌ (if fetchJobStatus fails)
```

## Common Causes

### 1. CORS Issue
**Symptom:** "Failed to fetch" with CORS error in console
**Fix:** Check Supabase Edge Function CORS headers

### 2. Network Connectivity
**Symptom:** "Failed to fetch" with network error
**Fix:** Check internet connection, try again

### 3. Invalid Presigned URL (S3)
**Symptom:** S3 upload fails immediately
**Fix:** Check if presigned URL is expired or invalid

### 4. S3 Bucket CORS Configuration (MOST LIKELY)
**Symptom:** S3 upload fails with "Failed to fetch", CORS error in console
**Fix:** Configure S3 bucket CORS to allow your app's origin
**See:** `docs/TROUBLESHOOT_S3_UPLOAD.md` for detailed CORS configuration

### 5. Edge Function Down
**Symptom:** Specific endpoint fails (e.g., `/uploads` PATCH fails)
**Fix:** Check Supabase Edge Function logs

## Next Steps

1. **Check console logs** - The new logging will show exactly where it fails
2. **Check network tab** - See which request is failing
3. **Check Supabase logs** - Edge Function logs will show server-side errors
4. **Test with smaller file** - Rule out file size issues
5. **Test in incognito** - Rule out browser extension interference

## What Changed

**Files Modified:**
- `src/components/ui/chat-input.tsx` - Added S3 upload error handling
- `src/lib/api.ts` - Added error handling for `updateJobStage` and `fetchJobStatus`

**All changes are backward compatible and safe to deploy.**
