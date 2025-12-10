# Troubleshoot: S3 Upload 403 Forbidden (After IAM Policy Added)

## ✅ What's Working

- Content-Type header fix is working correctly ✅
- Presigned URL is being generated ✅
- Request reaches S3 (not a network/CORS issue) ✅
- But S3 rejects with 403 Forbidden ❌

## 🔍 Detailed Troubleshooting

### Step 1: Verify IAM Policy is Correct

**Check the policy JSON:**
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
- ✅ `Effect: "Allow"` (not "Deny")
- ✅ `Action: "s3:PutObject"` (exact action name)
- ✅ `Resource` must match your bucket name exactly
- ✅ Wildcard `/*` at the end (allows all objects in bucket)

### Step 2: Verify Policy is Attached to Correct IAM User

**Find the IAM user:**
1. Go to Supabase Dashboard
2. Edge Functions → Settings → Environment Variables
3. Note the `AWS_ACCESS_KEY_ID` value
4. Go to AWS IAM Console
5. Find the IAM user with this access key ID
6. Check "Permissions" tab
7. Verify your policy is listed under "Permissions policies"

**Common mistakes:**
- Policy attached to wrong IAM user
- Policy attached to a group instead of user
- Policy not saved/attached properly

### Step 3: Check for Conflicting Policies

**Check IAM user has:**
1. Go to IAM user → Permissions tab
2. Look for:
   - **Permissions policies** - Should include your `s3:PutObject` policy
   - **Permission boundaries** - Should not restrict S3 access
   - **Inline policies** - Check if any deny S3 access

**Check for Deny statements:**
- Any policy with `"Effect": "Deny"` for `s3:PutObject` will override Allow policies
- Deny always wins in AWS IAM

### Step 4: Verify Bucket Policy (If Exists)

**If bucket has a bucket policy:**
1. AWS S3 Console → Your bucket → Permissions → Bucket Policy
2. Check for:
   - `"Effect": "Deny"` statements that might block your IAM user
   - IP restrictions
   - Conditions that might block the request

**Test:** Temporarily remove bucket policy to see if that's the issue (remember to add it back if needed)

### Step 5: Check Resource ARN Format

**Verify the Resource ARN in your policy:**
- Correct: `arn:aws:s3:::tubbyai-products-catalog/*`
- Wrong: `arn:aws:s3:::tubbyai-products-catalog` (missing `/*`)
- Wrong: `arn:aws:s3:::tubbyai-products-catalog/incoming/*` (too specific, might not match)

**For specific path:**
If you want to restrict to `incoming/` folder only:
```json
{
  "Resource": [
    "arn:aws:s3:::tubbyai-products-catalog/incoming/*"
  ]
}
```

### Step 6: Test with AWS CLI

**Test if IAM user can upload directly:**
```bash
# Set credentials (use same as Supabase)
export AWS_ACCESS_KEY_ID="your-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="your-region"

# Test upload
aws s3 cp test.txt s3://tubbyai-products-catalog/incoming/test.txt

# If this fails with "Access Denied", IAM user doesn't have permission
# If this succeeds, the issue is with presigned URL generation
```

### Step 7: Check Presigned URL Generation

**Verify the presigned URL is using correct credentials:**
1. Check Supabase Edge Function logs
2. Look for any errors during presigned URL generation
3. Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are correct
4. Check if credentials are expired (if using temporary credentials)

### Step 8: Verify Bucket Region

**Check region mismatch:**
1. AWS S3 Console → Your bucket → Properties → Region
2. Supabase Edge Function → Environment Variables → `AWS_REGION`
3. They must match exactly!

**Common regions:**
- `us-east-1` (N. Virginia)
- `us-west-2` (Oregon)
- `eu-west-1` (Ireland)
- etc.

### Step 9: Check S3 Block Public Access

**This shouldn't affect presigned URLs, but verify:**
1. AWS S3 Console → Your bucket → Permissions → Block Public Access
2. Presigned URLs work even with "Block all public access" enabled
3. But check if any settings are unusually restrictive

## 🎯 Most Common Issues

### Issue 1: Policy Not Attached to Correct User
**Symptom:** Policy exists but 403 persists
**Fix:** Verify policy is attached to the IAM user matching `AWS_ACCESS_KEY_ID` in Supabase

### Issue 2: Resource ARN Mismatch
**Symptom:** Policy exists but bucket name doesn't match
**Fix:** Ensure Resource ARN matches bucket name exactly: `arn:aws:s3:::tubbyai-products-catalog/*`

### Issue 3: Deny Policy Override
**Symptom:** Allow policy exists but Deny policy blocks it
**Fix:** Remove or modify Deny policies that block `s3:PutObject`

### Issue 4: Bucket Policy Blocking
**Symptom:** IAM policy is correct but bucket policy denies
**Fix:** Check bucket policy for Deny statements or restrictions

### Issue 5: Region Mismatch
**Symptom:** Presigned URL for wrong region
**Fix:** Ensure `AWS_REGION` env var matches bucket region

## 🔧 Quick Fix Checklist

Run through this checklist:

- [ ] IAM policy JSON is valid (check syntax)
- [ ] Policy has `"Effect": "Allow"` (not Deny)
- [ ] Policy has `"Action": "s3:PutObject"` (exact spelling)
- [ ] Policy Resource ARN matches bucket: `arn:aws:s3:::tubbyai-products-catalog/*`
- [ ] Policy is attached to IAM user (not just created)
- [ ] IAM user matches `AWS_ACCESS_KEY_ID` in Supabase
- [ ] No Deny policies override the Allow policy
- [ ] Bucket policy (if exists) doesn't block the IAM user
- [ ] `AWS_REGION` env var matches bucket region
- [ ] AWS credentials in Supabase are not expired
- [ ] IAM user is active (not disabled)

## 🧪 Test After Each Fix

After making any change:
1. Wait 10-30 seconds for propagation
2. Hard refresh browser (`Ctrl+Shift+R`)
3. Try uploading again
4. Check console for status 200

## 📝 Debug Information to Collect

If still failing, collect:
1. **IAM Policy JSON** - Copy the exact policy
2. **IAM User ARN** - From IAM Console
3. **Bucket Policy** - If exists, copy it
4. **AWS_REGION** - From Supabase env vars
5. **Presigned URL** - From console logs (sanitize sensitive parts)
6. **AWS CLI Test Result** - Output of `aws s3 cp` test

---

**Go through this checklist systematically - one of these is likely the issue! 🔍**
