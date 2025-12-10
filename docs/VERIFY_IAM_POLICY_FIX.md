# Verify IAM Policy Fix for S3 Upload

## ✅ IAM Policy Added

You've added the IAM policy with `s3:PutObject` permission. Let's verify it's working!

## 🧪 Testing Steps

### Step 1: Hard Refresh Browser

Clear any cached errors:
- **Windows:** `Ctrl+Shift+R`
- **Mac:** `Cmd+Shift+R`
- Or: DevTools → Right-click refresh → "Empty Cache and Hard Reload"

### Step 2: Test File Upload

1. Try uploading a file again
2. Check the console logs
3. Look for the S3 upload response

### Step 3: Check Console Logs

**Success indicators:**
```
[ChatInput] S3 upload response: {
  status: 200,  // ✅ Should be 200, not 403!
  statusText: 'OK',
  ok: true,
  duration: '...ms'
}
```

**If still 403:**
- Check IAM policy was saved correctly
- Verify policy is attached to the correct IAM user
- Check if policy propagation delay (can take a few seconds)

### Step 4: Check Network Tab

1. Open DevTools → Network tab
2. Try uploading
3. Look for PUT request to S3
4. Check status code:
   - **200** = Success! ✅
   - **403** = Still permission issue ❌
   - **Other** = Different issue

## 🔍 If Still Getting 403

### Check 1: Policy Propagation

IAM policy changes can take a few seconds to propagate. Wait 10-30 seconds and try again.

### Check 2: Verify Policy Details

Ensure the policy includes:
- **Action:** `s3:PutObject` (and optionally `s3:GetObject`)
- **Resource:** `arn:aws:s3:::tubbyai-products-catalog/*` (or specific path like `incoming/*`)
- **Effect:** `Allow`

### Check 3: Verify IAM User

Make sure:
- Policy is attached to the IAM user used by Supabase
- The IAM user matches `AWS_ACCESS_KEY_ID` in Supabase env vars
- IAM user is active (not disabled)

### Check 4: Check Bucket Policy

If bucket has a bucket policy, it might be overriding IAM permissions:
1. AWS S3 Console → Your bucket → Permissions → Bucket Policy
2. Check if there are any `Deny` statements
3. Verify bucket policy allows your IAM user

## 🎯 Expected Result

After the fix:
- ✅ S3 upload should return **200 OK**
- ✅ File should appear in S3 bucket (`incoming/` folder)
- ✅ Upload pipeline should continue to next step
- ✅ No 403 errors in console

## 📝 Next Steps After S3 Upload Works

Once S3 upload succeeds, you might see:
- `[ChatInput] Triggering textract job for: ...`
- If this fails with "Failed to fetch", that's a separate issue with the `textract-worker` Edge Function (likely CORS or network issue)

---

**Test the upload now and let me know the result! 🧪**
