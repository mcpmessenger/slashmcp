# Verify S3 Bucket Configuration

## Current Setup

Your S3 bucket is already configured. This guide helps verify everything is set up correctly.

## Step 1: Verify Bucket Name

The bucket name is configured via the `AWS_S3_BUCKET` environment variable in Supabase Edge Functions.

**To check:**
1. Go to Supabase Dashboard
2. Edge Functions → Settings → Environment Variables
3. Look for `AWS_S3_BUCKET` - this is your bucket name

**Or check AWS S3 Console:**
- List all buckets and verify the bucket exists

## Step 2: Verify CORS Configuration

Based on your CORS config, you have:
- ✅ `AllowedOrigins`: `https://slashmcp.vercel.app`, `http://localhost:5173`, `http://localhost:3000`
- ✅ `AllowedMethods`: `GET`, `PUT`, `POST`, `HEAD`
- ✅ `AllowedHeaders`: `["*"]` (all headers allowed)

### Verify Your Actual Deployment URL

**Check your Vercel deployment:**
1. Go to Vercel Dashboard
2. Find your project
3. Check the production/preview URLs

**Important:** Make sure your actual deployment URL matches one of the `AllowedOrigins`:
- Production: `https://slashmcp.vercel.app` ✅ (already in CORS)
- Preview deployments: May have different URLs like `https://slashmcp-git-*.vercel.app`
- Local dev: `http://localhost:5173` ✅ (already in CORS)

### If Your Deployment URL Doesn't Match

**Option 1: Add your deployment URL to CORS**
```json
{
  "AllowedOrigins": [
    "https://slashmcp.vercel.app",
    "https://slashmcp-*.vercel.app",  // For preview deployments
    "http://localhost:5173",
    "http://localhost:3000"
  ]
}
```

**Note:** S3 CORS doesn't support wildcards in origins. You need to add each specific URL.

**Option 2: Use a wildcard (less secure, for development only)**
```json
{
  "AllowedOrigins": ["*"]
}
```

⚠️ **Warning:** Using `*` allows any origin. Only use for development/testing.

## Step 3: Verify AWS Credentials

**Check Supabase Edge Function Environment Variables:**
- `AWS_S3_BUCKET` - Your bucket name
- `AWS_REGION` - e.g., `us-east-1`
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_SESSION_TOKEN` - (optional, for temporary credentials)

**Verify in AWS:**
1. Go to AWS IAM Console
2. Check the IAM user/role has permissions:
   - `s3:PutObject` - For uploads
   - `s3:GetObject` - For reading files
   - `s3:DeleteObject` - (optional, for cleanup)

## Step 4: Test the Configuration

### Test 1: Check CORS from Browser Console

Open your app in the browser and run:
```javascript
// Replace with your actual presigned URL from registerUploadJob
const testPresignedUrl = 'YOUR_PRESIGNED_URL_HERE';

fetch(testPresignedUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': 'text/plain'
  },
  body: 'test content'
})
.then(r => {
  console.log('✅ S3 upload test:', r.status, r.ok);
  console.log('Response headers:', Object.fromEntries(r.headers.entries()));
})
.catch(e => {
  console.error('❌ S3 upload test failed:', e);
  console.error('This indicates a CORS or network issue');
});
```

### Test 2: Check Network Tab

1. Open DevTools → Network tab
2. Try uploading a file
3. Look for the PUT request to S3
4. Check:
   - **Status:** Should be 200
   - **Response Headers:** Should include CORS headers
   - **Request Headers:** Should include `Origin: https://slashmcp.vercel.app`

## Step 5: Common Issues

### Issue 1: CORS Error Despite Configuration

**Symptom:** Console shows CORS error, but CORS is configured
**Possible causes:**
- Origin doesn't match exactly (case-sensitive, no trailing slash)
- CORS config not saved/applied
- Browser cache (try hard refresh)

**Fix:**
1. Verify origin matches exactly (no trailing slashes)
2. Save CORS config again in AWS Console
3. Wait a few minutes for changes to propagate
4. Hard refresh browser (Ctrl+Shift+R)

### Issue 2: Preview Deployment URLs Not Working

**Symptom:** Production works, but preview deployments fail
**Cause:** Preview URLs like `https://slashmcp-git-feature-abc123.vercel.app` aren't in CORS

**Fix:** Add preview URL pattern or use a wildcard (development only)

### Issue 3: Local Development Not Working

**Symptom:** `localhost:5173` uploads fail
**Check:**
- CORS includes `http://localhost:5173` (not `https://`)
- Port matches your dev server (5173 for Vite, 3000 for others)

## Step 6: Recommended CORS Configuration

For a production app, use this configuration:

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

**For preview deployments, you have two options:**

**Option A: Add specific preview URLs** (more secure)
- Add each preview URL as it's created
- Or use a script to update CORS automatically

**Option B: Use wildcard for development** (less secure, easier)
```json
{
  "AllowedOrigins": ["*"]
}
```

## Quick Checklist

- [ ] Bucket exists in AWS S3
- [ ] `AWS_S3_BUCKET` env var set in Supabase
- [ ] CORS configured with correct origins
- [ ] Production URL (`https://slashmcp.vercel.app`) in CORS
- [ ] Local dev URLs in CORS
- [ ] AWS credentials configured in Supabase
- [ ] IAM user has `s3:PutObject` permission
- [ ] Test upload works from browser console
- [ ] Network tab shows successful PUT request

## Next Steps

1. **Verify your actual deployment URL** matches CORS configuration
2. **Test upload** from your production/preview deployment
3. **Check console logs** for detailed S3 upload diagnostics
4. **If still failing**, check Network tab for specific CORS error message

## Need Help?

If uploads still fail after verifying:
1. Check browser console for specific error
2. Check Network tab for failed request details
3. Check Supabase Edge Function logs for server-side errors
4. Verify presigned URL is valid (not expired)
