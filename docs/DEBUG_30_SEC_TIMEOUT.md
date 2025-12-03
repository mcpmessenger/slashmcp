# Debugging 30-Second Timeout

## Status: Request is Being Sent ✅

The fact that you're seeing a 30-second timeout (instead of 15) means:
- ✅ New code is deployed
- ✅ Request is being sent (fetch() is executing)
- ❌ Edge Function is not responding within 30 seconds

## Next Steps

### Step 1: Check Network Tab

1. **Open Network tab** in DevTools
2. **Filter by:** `uploads` or `functions`
3. **Look for request to:** `/functions/v1/uploads`
4. **Check:**
   - **Status:** What is it? (pending, 200, 400, 500?)
   - **Time:** How long did it take?
   - **Response:** What does it say?

### Step 2: Check Supabase Logs

The request is being sent, so it should appear in Supabase logs:

1. **Go to:** https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/uploads/logs
2. **Filter for:** "Last 5 minutes"
3. **Look for logs around:** 23:01:02 (your upload time)

**What to look for:**
- `=== Uploads Edge Function Request Start ===` - Request reached function
- `Processing POST request - parsing body...` - Body parsing
- `Creating presigned URL for storage path: ...` - Presigned URL creation
- `Presigned URL created in Xms` - How long this took
- `Inserting job into database...` - Database insert
- `Job inserted in Xms` - Database insert time
- Any error messages

### Step 3: Check Which Step is Slow

If you see logs, check which step takes the longest:
- **Presigned URL creation:** AWS S3 operation (can be slow)
- **Database insert:** Supabase operation (usually fast)
- **No logs at all:** Request not reaching function (network/CORS issue)

## Common Causes

### Cause 1: AWS Presigned URL Generation is Slow
**Symptom:** Logs show "Creating presigned URL" but takes >30 seconds
**Fix:** Check AWS credentials, region, and S3 bucket configuration

### Cause 2: Network Latency
**Symptom:** Request takes 30+ seconds to reach Edge Function
**Fix:** Check network connection, firewall, or proxy

### Cause 3: Edge Function Not Deployed
**Symptom:** No logs appear in Supabase
**Fix:** Redeploy the uploads function

### Cause 4: CORS Issue
**Symptom:** Request appears in Network tab but fails with CORS error
**Fix:** Check Edge Function CORS headers (should already be set)

## What to Share

Please share:
1. **Network tab:** Status code and response (if any)
2. **Supabase logs:** Do you see any logs? Which step is slow?
3. **Console logs:** Do you see `[registerUploadJob] About to call fetch()...` and `[registerUploadJob] Sending fetch request to: ...`?

This will help identify if it's:
- Network issue (request not reaching function)
- AWS issue (presigned URL generation slow)
- Database issue (insert slow)
- Or something else

