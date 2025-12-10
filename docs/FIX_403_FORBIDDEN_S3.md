# Fix: S3 Upload 403 Forbidden Error

## ✅ Content-Type Fix is Working!

The console shows:
- `contentType: '(not included - matches presigned URI signature)'` ✅
- `fileType: ''` (empty string) ✅
- Client is correctly NOT sending Content-Type header ✅

**The Content-Type header mismatch is FIXED!** 🎉

## ❌ New Issue: 403 Forbidden

The console shows:
- `[ChatInput] S3 upload response: {status: 403, statusText: 'Forbidden', ok: false}`

A **403 Forbidden** from S3 means the request reached S3, but S3 is rejecting it due to permissions or policy.

## 🔍 Root Causes of 403 Forbidden

### 1. IAM User Missing Permissions (Most Likely)

The IAM user/role used to generate the presigned URL needs `s3:PutObject` permission.

**Check:**
1. Go to AWS IAM Console
2. Find the IAM user/role used by Supabase Edge Functions
3. Check attached policies
4. Verify it has `s3:PutObject` permission for your bucket

**Fix:**
Add this policy to the IAM user:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::tubbyai-products-catalog/*"
    }
  ]
}
```

### 2. S3 Bucket Policy Blocking

The bucket policy might be blocking PUT requests.

**Check:**
1. AWS S3 Console → Your bucket → Permissions → Bucket Policy
2. Look for policies that might block PUT requests
3. Check for IP restrictions or other conditions

**Fix:**
Ensure bucket policy allows `s3:PutObject` from your IAM user:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPresignedUploads",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:user/YOUR_IAM_USER"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::tubbyai-products-catalog/incoming/*"
    }
  ]
}
```

### 3. Block Public Access Settings

S3 "Block Public Access" settings might be blocking presigned URLs.

**Check:**
1. AWS S3 Console → Your bucket → Permissions → Block Public Access
2. Presigned URLs should work even with "Block all public access" enabled
3. But verify the settings aren't too restrictive

**Note:** Presigned URLs don't require public access - they use IAM credentials.

### 4. Invalid Presigned URL Signature

Even though Content-Type is fixed, there might be other signature issues.

**Check:**
- Verify the presigned URL is not expired (should be valid for 1 hour)
- Check if URL was modified or corrupted
- Verify AWS credentials in Supabase Edge Function env vars

### 5. Bucket Region Mismatch

The presigned URL might be for a different region than the bucket.

**Check:**
1. Verify `AWS_REGION` env var in Supabase matches bucket region
2. Check presigned URL domain matches region
3. Bucket region in AWS Console

## 🛠️ Diagnostic Steps

### Step 1: Check Supabase Edge Function Environment Variables

Verify these are set correctly:
- `AWS_S3_BUCKET` - Should be `tubbyai-products-catalog`
- `AWS_REGION` - Should match bucket region
- `AWS_ACCESS_KEY_ID` - IAM user access key
- `AWS_SECRET_ACCESS_KEY` - IAM user secret key
- `AWS_SESSION_TOKEN` - (optional, for temporary credentials)

### Step 2: Test IAM Permissions

Use AWS CLI to test if IAM user can upload:

```bash
# Test with AWS CLI (using same credentials as Supabase)
aws s3 cp test.txt s3://tubbyai-products-catalog/incoming/test.txt

# If this fails, IAM user doesn't have permission
```

### Step 3: Check S3 Bucket Logs

1. Enable S3 server access logging (if not already enabled)
2. Check CloudTrail logs for S3 API calls
3. Look for `PutObject` requests and their results

### Step 4: Verify Presigned URL Format

Check the presigned URL in console logs:
- Should include `X-Amz-SignedHeaders` parameter
- Should include `X-Amz-Credential` parameter
- Should include `X-Amz-Signature` parameter
- Should not be expired (check `X-Amz-Expires`)

## 🎯 Most Likely Solution

**Add `s3:PutObject` permission to the IAM user/role used by Supabase Edge Functions.**

The 403 error typically means the IAM credentials don't have permission to upload to the bucket.

## 📝 Quick Checklist

- [ ] IAM user has `s3:PutObject` permission
- [ ] IAM user has permission for the correct bucket path (`incoming/*`)
- [ ] Bucket policy allows PUT requests (if bucket policy exists)
- [ ] `AWS_REGION` env var matches bucket region
- [ ] AWS credentials in Supabase are valid and not expired
- [ ] Presigned URL is not expired (check `X-Amz-Expires` in URL)

## 🔗 Related Documentation

- `docs/FIX_CONTENT_TYPE_HEADER_MISMATCH.md` - Content-Type fix (✅ Working!)
- `docs/VERIFY_S3_BUCKET_CONFIG.md` - Bucket configuration verification
- `docs/TROUBLESHOOT_S3_UPLOAD.md` - General S3 troubleshooting

---

**Content-Type fix is working - now fix IAM permissions! 🔧**
