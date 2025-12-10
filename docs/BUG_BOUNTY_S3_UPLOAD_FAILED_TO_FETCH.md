# 🐛 Bug Bounty: S3 Upload "Failed to fetch" Error

## 🎯 Bug Summary

**Status:** 🟡 PARTIALLY FIXED - Content-Type mismatch resolved, but 403 Forbidden error remains  
**Priority:** CRITICAL  
**Impact:** Users cannot upload files to the application

**Progress:**
- ✅ Content-Type header mismatch - **FIXED**
- ❌ 403 Forbidden error - **IN PROGRESS** (likely IAM permissions issue)

## 📋 Bug Description

**✅ ROOT CAUSE IDENTIFIED:** The issue is a **Content-Type header mismatch** between the presigned URL signature and the client request.

**What happens:**
- When `file.type` is empty/null, the presigned URL is signed **WITHOUT** Content-Type header
- But the client was always sending `Content-Type: "application/octet-stream"` as a fallback
- S3 rejects the request because the signature doesn't match the headers
- Result: `TypeError: Failed to fetch`

**See:** `docs/FIX_CONTENT_TYPE_HEADER_MISMATCH.md` for complete details.

### What Works ✅
- Supabase Edge Function OPTIONS handler exists
- CORS headers are configured

### What Fails ❌
- **OPTIONS preflight request fails** with `TypeError: Failed to fetch`
- Manual OPTIONS test in `api.ts` is interfering with browser's automatic CORS preflight
- Main POST request times out/aborts due to preflight failure
- Registration never completes, so we never reach S3 upload step

## 🔍 Diagnostic Information

### Console Logs (Expected)
```
[registerUploadJob] Sending POST request...
[registerUploadJob] Fetch completed in 1333ms (status: 201, ok: true)
[registerUploadJob] Success {jobId: '...', hasUploadUrl: true}
[ChatInput] Registration completed in 1379ms
[ChatInput] Uploading file to S3 presigned URL...
[ChatInput] S3 upload details: {
  fileSize: ...,
  fileType: ...,
  fileName: ...,
  uploadUrlDomain: ...,
  isLargeFile: false
}
[ChatInput] S3 upload failed: TypeError: Failed to fetch
```

### Network Tab Observations
- ✅ POST to `/functions/v1/uploads` - **SUCCEEDS (201)**
- ❌ PUT to S3 presigned URL - **FAILS (Failed to fetch)**

### Environment
- **Production URL:** `https://slashmcp.vercel.app`
- **CORS Configuration:** ✅ Verified - includes production URL
- **S3 Bucket:** ✅ Configured
- **Presigned URL:** ✅ Generated successfully

## 🧪 Test Cases

### Test Case 1: Small File Upload
- **File:** PDF, < 10MB
- **Expected:** Should upload successfully
- **Actual:** ❌ Fails with "Failed to fetch"

### Test Case 2: Different File Types
- **Files:** PDF, MD, TXT, DOCX
- **Expected:** All should upload
- **Actual:** ❌ All fail with same error

### Test Case 3: Browser Console Test
```javascript
// Test presigned URL directly
fetch('PRESIGNED_URL', {
  method: 'PUT',
  headers: { 'Content-Type': 'text/plain' },
  body: 'test'
})
```
- **Expected:** HTTP 200
- **Actual:** ❌ "Failed to fetch"

## 🔬 Root Cause Analysis

### Eliminated Causes ✅
1. ✅ **CORS Configuration** - Verified, includes production URL
2. ✅ **Presigned URL Generation** - Working, URL is valid
3. ✅ **API Registration** - Working, returns 201
4. ✅ **File Size** - Not the issue (fails on small files too)
5. ✅ **Deployment URL Mismatch** - Verified, URL matches CORS

### Potential Causes (To Investigate) 🔍

#### 1. S3 Bucket Policy / Permissions
**Hypothesis:** Bucket policy might be blocking PUT requests
**Check:**
- AWS S3 Console → Bucket → Permissions → Bucket Policy
- Verify policy allows `s3:PutObject` from presigned URLs
- Check if there are IP restrictions

**Test:**
```bash
# Test with AWS CLI
aws s3api put-object \
  --bucket YOUR_BUCKET \
  --key test.txt \
  --body test.txt \
  --presigned-url YOUR_PRESIGNED_URL
```

#### 2. Presigned URL Signature Issue
**Hypothesis:** Presigned URL signature might be invalid or malformed
**Check:**
- Verify presigned URL format in console logs
- Check if URL contains special characters that need encoding
- Verify signature algorithm matches AWS expectations

**Test:**
- Log the full presigned URL (sanitized) to verify format
- Check if URL is being modified before use

#### 3. Browser Security / Content Security Policy (CSP)
**Hypothesis:** Browser CSP might be blocking S3 requests
**Check:**
- Browser console for CSP violations
- Network tab for blocked requests
- Check if `connect-src` CSP directive allows S3 domains

**Test:**
- Check browser console for CSP errors
- Try in different browser
- Check Vercel CSP headers

#### 4. S3 Region / Endpoint Mismatch
**Hypothesis:** Presigned URL might be for wrong region/endpoint
**Check:**
- Verify `AWS_REGION` env var matches bucket region
- Check if presigned URL uses correct S3 endpoint format
- Verify bucket exists in specified region

**Test:**
- Log `AWS_REGION` from Edge Function
- Verify bucket region in AWS Console
- Check presigned URL domain matches region

#### 5. Network / Firewall / Proxy
**Hypothesis:** Network layer blocking S3 requests
**Check:**
- Corporate firewall blocking S3
- VPN interference
- Browser extension blocking
- ISP blocking

**Test:**
- Try from different network
- Try in incognito mode
- Disable browser extensions
- Try from different device

#### 6. Presigned URL Expiration / Timing
**Hypothesis:** URL expires before upload starts
**Check:**
- Time between URL generation and upload attempt
- Presigned URL expiration time (should be 1 hour default)
- Clock skew between systems

**Test:**
- Log timestamp of URL generation
- Log timestamp of upload attempt
- Verify system clocks are synchronized

#### 7. Request Headers / Content-Type Mismatch
**Hypothesis:** Presigned URL expects specific headers that aren't being sent
**Check:**
- Presigned URL generation includes `Content-Type` in signature
- Upload request includes matching `Content-Type` header
- Any additional headers required by presigned URL

**Test:**
- Log headers sent with presigned URL
- Compare with headers expected by presigned URL
- Verify `Content-Type` matches exactly

#### 8. S3 Bucket CORS Not Applied
**Hypothesis:** CORS config exists but not actually applied
**Check:**
- CORS config is saved (not just visible)
- Wait time for CORS propagation (can take a few minutes)
- Verify CORS config syntax is valid JSON

**Test:**
- Re-save CORS configuration
- Wait 5 minutes
- Try upload again
- Check Network tab for CORS preflight (OPTIONS request)

## 🛠️ Debugging Steps

### Step 1: Enhanced Logging
Add detailed logging to capture:
- Full presigned URL (sanitized, no query params)
- Request headers being sent
- Response from S3 (if any)
- Network error details

### Step 2: Test Presigned URL Directly
```javascript
// In browser console, after getting presigned URL from registerUploadJob
const presignedUrl = 'YOUR_PRESIGNED_URL_HERE';
console.log('Testing presigned URL:', presignedUrl);

fetch(presignedUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': 'text/plain'
  },
  body: 'test content'
})
.then(r => {
  console.log('✅ Success:', r.status, r.ok);
  console.log('Headers:', Object.fromEntries(r.headers.entries()));
  return r.text();
})
.then(text => console.log('Response:', text))
.catch(e => {
  console.error('❌ Failed:', e);
  console.error('Error name:', e.name);
  console.error('Error message:', e.message);
  console.error('Error stack:', e.stack);
});
```

### Step 3: Check Network Tab Details
1. Open DevTools → Network tab
2. Try upload
3. Look for:
   - **OPTIONS request** (CORS preflight) - Does it appear?
   - **PUT request** - Does it appear? What's the status?
   - **Request Headers** - What's in the `Origin` header?
   - **Response Headers** - Any CORS headers?
   - **Error Details** - What's the exact error message?

### Step 4: Verify S3 Bucket Configuration
1. AWS S3 Console → Your Bucket
2. **Permissions tab:**
   - ✅ CORS configuration (already verified)
   - ❓ Bucket Policy - Check for restrictions
   - ❓ Block Public Access - Should allow presigned URLs
   - ❓ Access Control List (ACL) - Check permissions

### Step 5: Test from Different Environments
- [ ] Production (`https://slashmcp.vercel.app`)
- [ ] Local dev (`http://localhost:5173`)
- [ ] Different browser
- [ ] Incognito mode
- [ ] Different network

### Step 6: Check Supabase Edge Function Logs
1. Supabase Dashboard → Edge Functions → `uploads`
2. Check logs for:
   - Presigned URL generation
   - Any errors during URL creation
   - Request/response details

### Step 7: Verify Presigned URL Generation Code
Check `supabase/functions/uploads/index.ts`:
- `createPresignedPutUrl` function
- Signature algorithm
- URL format
- Headers included in signature

## 🔧 Fixes Applied

1. ✅ **Content-Type Header Fix** - Only send Content-Type if `file.type` is present (matches presigned URL signature) - **WORKING!**
2. ✅ **Removed Manual OPTIONS Test** - Browsers handle CORS preflight automatically
3. ✅ **Enhanced Error Handling** - Added try-catch around S3 upload
4. ✅ **Detailed Logging** - Logs file details, URL domain, error info
5. ✅ **Improved Edge Function OPTIONS Handler** - Returns 204 status with caching headers

## 🆕 Current Issue: 403 Forbidden

After fixing Content-Type mismatch, uploads now get **403 Forbidden** from S3. This indicates:
- Request reaches S3 successfully ✅
- Content-Type header matches signature ✅
- But S3 rejects due to permissions ❌

**Most likely cause:** IAM user missing `s3:PutObject` permission.

**See:** `docs/FIX_403_FORBIDDEN_S3.md` for detailed troubleshooting.

## 🎯 Next Steps to Try

### Immediate Actions
1. **Check Network Tab** - Look for OPTIONS preflight request
2. **Test Presigned URL in Console** - Use the test script above
3. **Check Browser Console for CSP Errors** - Look for Content Security Policy violations
4. **Verify S3 Bucket Policy** - Check for any restrictions
5. **Test in Incognito** - Rule out browser extensions

### Code Changes to Try
1. **Add OPTIONS Preflight Test** - Test CORS before PUT
2. **Log Full Presigned URL** - (sanitized) to verify format
3. **Add Request/Response Interceptors** - Capture exact request being sent
4. **Test with Different Content-Type** - Verify header matching
5. **Add Retry Logic** - In case of transient failures

### AWS Configuration to Check
1. **Bucket Policy** - Verify no restrictions
2. **Block Public Access** - Should allow presigned URLs
3. **Bucket Region** - Verify matches `AWS_REGION` env var
4. **IAM Permissions** - Verify `s3:PutObject` permission
5. **CORS Propagation** - Re-save CORS config and wait

## 📊 Success Criteria

Bug is fixed when:
- ✅ S3 PUT request succeeds (HTTP 200)
- ✅ File appears in S3 bucket
- ✅ Upload pipeline continues to next step
- ✅ No "Failed to fetch" errors in console
- ✅ Network tab shows successful PUT request

## 🏆 Bug Bounty Rewards

**First to identify root cause:** 🎉 Recognition + Bug fix credit  
**First to provide working fix:** 🚀 Implementation credit  
**Best debugging approach:** 💡 Methodology credit

## 📝 Notes

- URL matches CORS configuration ✅
- Presigned URL is generated successfully ✅
- Error occurs synchronously (before network request) ⚠️
- This suggests browser-level blocking or invalid URL format

## 🔗 Related Documentation

- `docs/TROUBLESHOOT_S3_UPLOAD.md` - General S3 troubleshooting
- `docs/VERIFY_S3_BUCKET_CONFIG.md` - Bucket configuration verification
- `docs/FIX_UPLOAD_FAILED_TO_FETCH.md` - Previous fixes applied

---

**Let's squash this bug! 🐛💥**
