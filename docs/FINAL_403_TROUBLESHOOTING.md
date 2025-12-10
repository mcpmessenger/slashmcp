# Final 403 Troubleshooting - All Fixes Applied

## ✅ What We've Fixed

1. ✅ Content-Type header mismatch - **WORKING** (console shows correct behavior)
2. ✅ IAM policy added - **VERIFIED** (AWS CLI test succeeded)
3. ✅ Supabase credentials updated - **DONE** (Access key configured)
4. ✅ Edge Function redeployed - **DONE**

## ❌ Still Getting 403

Even after all fixes, still seeing 403 Forbidden. Let's verify everything systematically.

## 🔍 Critical Verification Steps

### Step 1: Verify IAM Policy is on Correct User

**The access key needs the policy:**

1. Go to AWS IAM Console
2. Find IAM user with the configured access key
3. Permissions tab
4. Verify `s3:PutObject` policy is attached

**If not attached:**
- Attach the policy to this specific IAM user
- Policy should allow `s3:PutObject` on `arn:aws:s3:::tubbyai-products-catalog/*`

### Step 2: Check Supabase Edge Function Logs

**Check which credentials are actually being used:**

1. Supabase Dashboard → Edge Functions → `uploads` → Logs
2. Look for "Presigned URL generation details"
3. Verify:
   - `accessKeyIdPrefix` = `AKIA...` (should match your credentials)
   - `region` = `us-east-1`
   - No errors during URL generation

**If different access key:**
- Supabase is still using old credentials
- Wait longer for propagation (can take 1-2 minutes)
- Or redeploy function again

### Step 3: Verify IAM Policy Details

**Check the policy JSON is correct:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::tubbyai-products-catalog/*"
    }
  ]
}
```

**Critical points:**
- `Effect: "Allow"` (not Deny)
- `Action: "s3:PutObject"` (exact spelling)
- `Resource` must end with `/*` (allows all objects)
- Bucket name must match exactly: `tubbyai-products-catalog`

### Step 4: Check for Bucket Policy

**If bucket has a bucket policy, it might be blocking:**

1. AWS S3 Console → `tubbyai-products-catalog` → Permissions → Bucket Policy
2. Check for any `"Effect": "Deny"` statements
3. Check if policy restricts the IAM user

**Test:** Temporarily remove bucket policy (if exists) to see if that's the issue

### Step 5: Verify Presigned URL Credential

**From console logs, check the presigned URL:**

The presigned URL should include:
- `X-Amz-Credential=AKIA.../...` (should match your access key)

**If different:**
- Supabase is using different credentials
- Check Supabase secrets again
- Redeploy function

## 🎯 Most Likely Remaining Issues

### Issue 1: Policy Not on Correct User

**Symptom:** Policy exists but on wrong IAM user
**Fix:** Attach policy to the correct IAM user

### Issue 2: Bucket Policy Blocking

**Symptom:** IAM policy correct but bucket policy denies
**Fix:** Check/modify bucket policy

### Issue 3: Credentials Not Propagated

**Symptom:** Supabase logs show different access key
**Fix:** Wait longer or redeploy function

### Issue 4: Resource ARN Mismatch

**Symptom:** Policy Resource doesn't match bucket
**Fix:** Ensure Resource is exactly `arn:aws:s3:::tubbyai-products-catalog/*`

## 🛠️ Quick Diagnostic Commands

### Test IAM User Directly

```powershell
# Test if the IAM user can upload (using the access key)
# Replace with your actual credentials
$env:AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY_ID"
$env:AWS_SECRET_ACCESS_KEY="YOUR_SECRET_ACCESS_KEY"
$env:AWS_REGION="us-east-1"

aws s3 cp test.txt s3://tubbyai-products-catalog/incoming/test-direct.txt
```

If this works, the IAM user has permission. If it fails, the policy isn't attached correctly.

### Check Supabase Logs

After next upload attempt, check Supabase Edge Function logs for:
- Which `accessKeyIdPrefix` is being used
- Any errors during presigned URL generation
- Whether credentials are present

## 📝 Action Items

1. **Verify IAM policy is on the correct IAM user**
2. **Check Supabase logs** to see which credentials are actually being used
3. **Test IAM user directly** with AWS CLI using the exact credentials
4. **Check bucket policy** (if exists) for any restrictions

---

**Go through these verification steps - one of them will reveal the issue! 🔍**



