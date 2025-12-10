# Troubleshoot: S3 Upload "Failed to fetch" Error

## Problem

The `registerUploadJob` succeeds (HTTP 201), but the S3 upload using the presigned URL fails with `TypeError: Failed to fetch`.

## What This Means

The presigned URL from Supabase is valid, but the browser cannot upload the file to S3. This is typically a **CORS issue** or **network connectivity problem**.

## Diagnostic Steps

### Step 1: Check Console Logs

After the fix, you should see detailed S3 upload diagnostics:
```
[ChatInput] S3 upload details: {
  fileSize: ...,
  fileType: ...,
  fileName: ...,
  uploadUrlDomain: ...,
  isLargeFile: true/false
}
[ChatInput] S3 upload failed: {
  error: ...,
  name: ...,
  fileSize: ...,
  possibleCauses: [...]
}
```

### Step 2: Check Network Tab

1. Open DevTools → Network tab
2. Try uploading a file
3. Look for:
   - **PUT request** to S3 domain (e.g., `s3.amazonaws.com` or `s3.*.amazonaws.com`)
   - **Status code** - Should be 200 for success
   - **CORS errors** - Red text indicating CORS failure

**If request appears but fails with CORS error:**
- S3 bucket CORS configuration issue
- Presigned URL doesn't include CORS headers

**If no request appears:**
- Browser extension blocking
- Network connectivity issue
- Request blocked before network layer

### Step 3: Check S3 Bucket CORS Configuration

The S3 bucket **must** allow CORS from your application's origin.

**Your Current CORS Configuration (from image):**
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": [
      "https://slashmcp.vercel.app",
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

**⚠️ IMPORTANT:** Verify your actual deployment URL matches one of the `AllowedOrigins`:
- Production: `https://slashmcp.vercel.app` ✅
- Preview deployments: May have different URLs (e.g., `https://slashmcp-git-*.vercel.app`)
- Local dev: `http://localhost:5173` ✅

**How to Check:**
1. Go to AWS S3 Console
2. Select your bucket
3. Go to **Permissions** → **Cross-origin resource sharing (CORS)**
4. Verify the configuration matches above
5. **Check your actual Vercel deployment URL** - it must match an origin in `AllowedOrigins`

**See:** `docs/VERIFY_S3_BUCKET_CONFIG.md` for complete verification steps.

### Step 4: Test Presigned URL Directly

Open browser console and run:
```javascript
// Get the presigned URL from the registerUploadJob response
// Then test it:
fetch('PRESIGNED_URL_HERE', {
  method: 'PUT',
  headers: {
    'Content-Type': 'text/plain'
  },
  body: 'test content'
})
.then(r => console.log('S3 test:', r.status, r.ok))
.catch(e => console.error('S3 test failed:', e));
```

**Expected:** Should return 200
**If fails:** CORS or network issue

### Step 5: Check File Size

Large files (>100MB) may cause issues:
- Browser timeout
- Network timeout
- Memory issues

**Check console logs for:**
```
isLargeFile: true
```

**If file is large:**
- Consider chunked upload
- Or increase timeout limits

### Step 6: Test in Incognito Mode

1. Open browser in incognito/private mode
2. Try uploading again
3. If it works → Browser extension is blocking

## Common Causes & Fixes

### 1. S3 Bucket CORS Not Configured

**Symptom:** CORS error in console, request fails with CORS-related status
**Fix:** Add CORS configuration to S3 bucket (see Step 3)

### 2. Wrong Origin in CORS Configuration

**Symptom:** CORS error, but CORS is configured
**Check:** Verify your app's origin matches CORS `AllowedOrigins`
**Fix:** Add your production domain to `AllowedOrigins`

### 3. Presigned URL Expired

**Symptom:** Upload fails immediately, no network activity
**Check:** Presigned URLs typically expire after 1 hour
**Fix:** Ensure upload happens soon after getting presigned URL

### 4. Network Connectivity

**Symptom:** All S3 requests fail, no network activity
**Fix:** Check internet connection, try different network

### 5. Browser Extension Blocking

**Symptom:** Works in incognito, fails in normal mode
**Fix:** Disable extensions one by one to find the culprit

### 6. File Too Large

**Symptom:** Upload starts but times out or fails
**Check:** Console shows `isLargeFile: true`
**Fix:** 
- Use chunked upload for large files
- Or increase timeout limits
- Or compress file before upload

### 7. Invalid Presigned URL Format

**Symptom:** URL looks wrong in console logs
**Check:** `uploadUrlDomain` should be S3 domain
**Fix:** Verify Supabase Edge Function generates correct presigned URLs

## Quick Test

Run this in browser console to test S3 connectivity:

```javascript
// Test 1: Can we reach S3?
fetch('https://s3.amazonaws.com')
  .then(() => console.log('✅ S3 reachable'))
  .catch(e => console.error('❌ S3 unreachable:', e));

// Test 2: Test with a simple presigned URL (if you have one)
// Replace with actual presigned URL from registerUploadJob response
fetch('YOUR_PRESIGNED_URL', {
  method: 'PUT',
  headers: { 'Content-Type': 'text/plain' },
  body: 'test'
})
  .then(r => console.log('✅ S3 upload test:', r.status))
  .catch(e => console.error('❌ S3 upload test failed:', e));
```

## What the Fix Does

1. **Logs file details** - Size, type, name, URL domain
2. **Better error messages** - Shows exactly what failed
3. **More diagnostics** - Logs possible causes and file size warnings
4. **Response headers** - Shows S3 response headers for debugging

## Next Steps

1. **Refresh page** - New diagnostics should load
2. **Try upload again** - Check console for detailed S3 upload logs
3. **Check Network tab** - See the actual S3 PUT request
4. **Verify S3 CORS** - Ensure bucket allows your app's origin
5. **Test in incognito** - Rule out browser extensions
6. **Check file size** - Large files may need special handling

## AWS S3 CORS Configuration

If you need to configure CORS on your S3 bucket:

1. **AWS Console:**
   - S3 → Your Bucket → Permissions → CORS
   - Paste the JSON configuration from Step 3

2. **AWS CLI:**
   ```bash
   aws s3api put-bucket-cors \
     --bucket YOUR_BUCKET_NAME \
     --cors-configuration file://cors.json
   ```

3. **Terraform:**
   ```hcl
   resource "aws_s3_bucket_cors_configuration" "example" {
     bucket = aws_s3_bucket.example.id
     cors_rule {
       allowed_headers = ["*"]
       allowed_methods = ["PUT", "POST", "GET"]
       allowed_origins = ["https://your-app.vercel.app"]
       expose_headers  = ["ETag"]
       max_age_seconds = 3000
     }
   }
   ```

