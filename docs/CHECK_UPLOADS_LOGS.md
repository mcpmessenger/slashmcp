# How to Check Uploads Edge Function Logs

## Quick Link
**Direct link to uploads function logs:**
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/uploads/logs

## Steps

1. **Go to Supabase Dashboard:**
   - Navigate to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr
   - Click **"Edge Functions"** in left sidebar
   - Click on **"uploads"** function
   - Click the **"Logs"** tab

2. **Filter for Recent Logs:**
   - Set time filter to **"Last 5 minutes"** or **"Last hour"**
   - Look for logs with timestamp around your upload attempt (22:39:06)

3. **What to Look For:**

   **If you see logs:**
   - `=== Uploads Edge Function Request Start ===` - Request reached the function
   - `Processing POST request - parsing body...` - Body parsing started
   - `Creating presigned URL for storage path: ...` - Presigned URL creation started
   - `Presigned URL created in Xms` - How long presigned URL took
   - `Inserting job into database...` - Database insert started
   - `Job inserted in Xms, jobId: ...` - Database insert completed
   - `=== Uploads Edge Function Request Complete in Xms ===` - Total time

   **If you DON'T see any logs:**
   - The request isn't reaching the Edge Function
   - Check network tab in browser DevTools
   - Check if FUNCTIONS_URL is configured correctly
   - Check for CORS errors

4. **Check Invocations Tab:**
   - Click **"Invocations"** tab (next to "Logs")
   - This shows if the function was called at all
   - Look for recent invocations around 22:39:06

5. **Check Browser Network Tab:**
   - Open DevTools (F12) → Network tab
   - Try uploading again
   - Look for request to `/functions/v1/uploads`
   - Check:
     - Status code (should be 201 if successful)
     - Response time
     - Response body (should show error if failed)
     - Request headers (should include Authorization)

## Common Issues

### Issue 1: No Logs at All
**Symptom:** No logs appear in Supabase
**Possible causes:**
- Request not reaching Edge Function
- Wrong FUNCTIONS_URL
- Network/CORS issue
- Function not deployed

**Fix:**
- Check browser Network tab for the actual request
- Verify FUNCTIONS_URL in environment variables
- Check browser console for errors

### Issue 2: Logs Show Timeout
**Symptom:** Logs show request started but timed out
**Possible causes:**
- Presigned URL creation is slow (AWS S3)
- Database insert is slow
- Network latency

**Fix:**
- Check which step is slow (presigned URL vs database)
- Consider increasing timeout in frontend
- Check AWS credentials/region configuration

### Issue 3: Error in Logs
**Symptom:** Logs show error message
**Possible causes:**
- Missing environment variables
- Database error
- AWS credentials issue

**Fix:**
- Check error message in logs
- Verify all required environment variables are set
- Check Supabase Edge Function settings

