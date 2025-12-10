# Debug: Presigned URL 403 (But AWS CLI Works)

## ✅ Good News

AWS CLI test succeeded:
```bash
aws s3 cp test.txt s3://tubbyai-products-catalog/incoming/test.txt
# ✅ Success - file uploaded!
```

This confirms:
- ✅ IAM user has `s3:PutObject` permission
- ✅ Bucket is accessible
- ✅ Credentials work for direct uploads

## ❌ The Problem

Presigned URLs still return 403, even though:
- Content-Type header fix is working ✅
- IAM permissions are correct ✅
- Direct AWS CLI upload works ✅

## 🔍 Possible Causes

### 1. Different Credentials in Supabase

**Issue:** Supabase Edge Function might be using different AWS credentials than your AWS CLI.

**Check:**
1. Supabase Dashboard → Edge Functions → Settings → Environment Variables
2. Compare `AWS_ACCESS_KEY_ID` with your AWS CLI credentials
3. They should match!

**Fix:** Ensure Supabase uses the same IAM user that has the policy attached.

### 2. Presigned URL Signature Issue

**Issue:** The signature calculation might have a subtle bug.

**Check:**
- Look at Supabase Edge Function logs for presigned URL generation
- Check the `X-Amz-SignedHeaders` parameter in the presigned URL
- Should be `host` when `fileType` is empty
- Should be `content-type;host` when `fileType` is present

### 3. Session Token Issue

**Issue:** If using temporary credentials (`AWS_SESSION_TOKEN`), it might be expired.

**Check:**
- Supabase env vars → `AWS_SESSION_TOKEN`
- If present, verify it's not expired
- Temporary credentials expire after a set time

### 4. Region Mismatch in Presigned URL

**Issue:** Presigned URL might be generated for wrong region.

**Check:**
- Presigned URL domain should match bucket region
- `us-east-1` → `bucket.s3.amazonaws.com`
- Other regions → `bucket.s3.REGION.amazonaws.com`

### 5. Key Encoding Issue

**Issue:** The S3 key (file path) might be encoded incorrectly in presigned URL.

**Check:**
- Presigned URL path should match the storage path
- Special characters should be properly encoded
- Check if `encodeRfc3986` function is working correctly

## 🛠️ Diagnostic Steps

### Step 1: Compare Credentials

**In Supabase:**
- `AWS_ACCESS_KEY_ID` = ?
- `AWS_SECRET_ACCESS_KEY` = ? (first 8 chars)
- `AWS_REGION` = ?
- `AWS_SESSION_TOKEN` = ? (if present)

**In AWS CLI:**
```bash
aws configure list
# Compare with Supabase values
```

### Step 2: Check Supabase Edge Function Logs

1. Go to Supabase Dashboard
2. Edge Functions → `uploads` → Logs
3. Look for:
   - "Creating presigned URL for storage path"
   - "Presigned URL generation details" (new logging)
   - Any errors during URL generation

### Step 3: Inspect Presigned URL

From console logs, check the presigned URL:
- Does it include `X-Amz-Signature`?
- Does it include `X-Amz-SignedHeaders`?
- What's the value of `X-Amz-SignedHeaders`?
- Does the domain match the bucket region?

### Step 4: Test Presigned URL Manually

Copy the presigned URL from console logs and test it:

```javascript
// In browser console
const presignedUrl = 'YOUR_PRESIGNED_URL_FROM_LOGS';

fetch(presignedUrl, {
  method: 'PUT',
  // NO headers if fileType was empty
  body: 'test content'
})
.then(r => {
  console.log('Status:', r.status);
  console.log('Response:', r);
  return r.text();
})
.then(text => console.log('Body:', text))
.catch(e => console.error('Error:', e));
```

## 🎯 Most Likely Issue

**Different AWS credentials in Supabase vs AWS CLI.**

The AWS CLI is using credentials that have permission, but Supabase Edge Function might be using different credentials that don't have the policy attached.

## 📝 Action Items

1. **Verify Supabase credentials match AWS CLI:**
   - Check `AWS_ACCESS_KEY_ID` in Supabase
   - Compare with `aws configure list` output
   - They must match!

2. **Check Supabase Edge Function logs:**
   - Look for the new diagnostic logs
   - Verify credentials are present
   - Check for any errors

3. **Test presigned URL directly:**
   - Copy URL from console
   - Test in browser console
   - See exact error response

---

**The IAM policy is correct - now verify Supabase is using the right credentials! 🔍**
