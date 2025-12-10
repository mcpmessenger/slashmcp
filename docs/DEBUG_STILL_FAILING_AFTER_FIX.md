# Debug: Still Failing After Content-Type Fix

## ✅ Good News: Fix is Working!

The console logs show:
- `fileType: ''` (empty string) ✅
- `contentType: '(not included - matches presigned URL signature)'` ✅
- `headersMatchSignature: 'No Content-Type (as signed)'` ✅

This means the Content-Type header fix **IS working correctly** - the client is NOT sending Content-Type when `file.type` is empty, which matches the presigned URL signature.

## ❌ But It's Still Failing

Since the Content-Type fix is working but uploads still fail, the issue is likely:

### Most Likely: CORS Issue

**Your origin:** `http://localhost:8080` (from console logs)

**Check S3 Bucket CORS:**
1. Go to AWS S3 Console
2. Select your bucket (`tubbyai-products-catalog` based on logs)
3. Permissions → Cross-origin resource sharing (CORS)
4. Verify `http://localhost:8080` is in `AllowedOrigins`

**If missing, add it:**
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": [
      "https://slashmcp.vercel.app",
      "http://localhost:8080",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    "ExposeHeaders": [
      "ETag",
      "x-amz-server-side-encryption",
      "x-amz-request-id",
      "x-amz-id-2"
    ],
    "MaxAgeSeconds": 3000
  }
]
```

### Check Network Tab

1. Open DevTools → Network tab
2. Try uploading again
3. Look for the PUT request to S3
4. Check:
   - **Does the request appear?** (If not, browser is blocking it)
   - **Status code?** (403 = CORS/permissions, 400 = signature issue, etc.)
   - **Error message?** (Look in Response tab)
   - **Request Headers?** (Verify Content-Type is NOT present)
   - **Response Headers?** (Look for CORS error messages)

### Other Possible Issues

#### 1. S3 Bucket Policy Blocking
- Check bucket policy for IP restrictions
- Verify `s3:PutObject` permission is allowed

#### 2. Browser Extension Blocking
- Try in incognito mode
- Disable extensions one by one

#### 3. Network/Firewall
- Try from different network
- Check if VPN is interfering
- Try from different device

#### 4. Presigned URL Issue
- Check if URL is expired (should be valid for 1 hour)
- Verify URL format is correct
- Check Supabase Edge Function logs for errors

## 🔍 Diagnostic Steps

### Step 1: Check Network Tab Error

The Network tab will show the exact error. Common errors:

- **CORS error:** "Access to fetch at '...' from origin 'http://localhost:8080' has been blocked by CORS policy"
- **403 Forbidden:** Bucket policy or permissions issue
- **400 Bad Request:** Signature mismatch (but we fixed this!)
- **Network error:** Request never reaches S3 (firewall/extension)

### Step 2: Test Presigned URL Directly

In browser console, after getting the presigned URL:

```javascript
// Get the presigned URL from registerUploadJob response
// Then test it:
const presignedUrl = 'YOUR_PRESIGNED_URL_HERE';

fetch(presignedUrl, {
  method: 'PUT',
  // NO Content-Type header (matches signature)
  body: 'test content'
})
.then(r => {
  console.log('✅ Success:', r.status, r.ok);
  console.log('Response:', r);
  return r.text();
})
.then(text => console.log('Response body:', text))
.catch(e => {
  console.error('❌ Failed:', e);
  console.error('Error details:', {
    name: e.name,
    message: e.message,
    stack: e.stack
  });
});
```

### Step 3: Check S3 CORS Configuration

Run this in browser console to test CORS:

```javascript
// Test if CORS is configured for localhost:8080
fetch('https://tubbyai-products-catalog.s3.amazonaws.com/', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'http://localhost:8080',
    'Access-Control-Request-Method': 'PUT',
    'Access-Control-Request-Headers': 'content-type'
  }
})
.then(r => {
  console.log('CORS preflight:', r.status);
  console.log('CORS headers:', Object.fromEntries(r.headers.entries()));
})
.catch(e => console.error('CORS test failed:', e));
```

## 🎯 Most Likely Solution

**Add `http://localhost:8080` to S3 bucket CORS AllowedOrigins.**

The fix is working correctly - the issue is now CORS configuration for your local development environment.

## 📝 Next Steps

1. **Add localhost:8080 to S3 CORS** (most likely fix)
2. **Check Network tab** for exact error message
3. **Test presigned URL directly** in console
4. **Verify S3 bucket permissions** allow PUT requests

---

**The Content-Type fix is working - now we need to fix CORS! 🔧**
