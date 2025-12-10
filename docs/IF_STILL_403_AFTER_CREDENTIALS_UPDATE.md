# If Still Getting 403 After Credentials Update

## ✅ What We've Done

1. ✅ Content-Type header fix - Working
2. ✅ IAM policy added - Verified with AWS CLI
3. ✅ Supabase credentials updated - Just completed

## ⏰ Possible Issues

### 1. Edge Function Not Redeployed

**Issue:** Supabase Edge Functions cache environment variables. After updating secrets, you may need to redeploy the function.

**Fix:**
```powershell
supabase functions deploy uploads
```

This forces the Edge Function to pick up the new credentials.

### 2. Secret Propagation Delay

**Issue:** Supabase secrets can take 30-60 seconds to propagate to running Edge Functions.

**Fix:**
- Wait 1-2 minutes
- Try uploading again
- Or redeploy the function to force immediate update

### 3. Verify Secrets Were Actually Updated

**Check:**
```powershell
supabase secrets list
```

Look for:
- `AWS_ACCESS_KEY_ID` - Should show updated digest
- `AWS_SECRET_ACCESS_KEY` - Should show updated digest
- `AWS_REGION` - Should be `us-east-1`

### 4. Check IAM Policy is on Correct User

**Verify:**
1. AWS IAM Console
2. Find IAM user with access key `AKIAVYV52CKKOOF6T52C`
3. Permissions tab
4. Verify `s3:PutObject` policy is attached

### 5. Check Supabase Edge Function Logs

**Check:**
1. Supabase Dashboard → Edge Functions → `uploads` → Logs
2. Look for "Presigned URL generation details" (new logging)
3. Verify:
   - `accessKeyIdPrefix` matches `AKIAVYV5...`
   - `region` is `us-east-1`
   - No errors during URL generation

## 🛠️ Step-by-Step Fix

### Step 1: Redeploy Edge Function

```powershell
supabase functions deploy uploads
```

This ensures the function uses the new credentials.

### Step 2: Wait for Propagation

Wait 30-60 seconds after deployment.

### Step 3: Hard Refresh Browser

`Ctrl+Shift+R` to clear cache.

### Step 4: Test Upload

Try uploading a file and check console.

### Step 5: Check Logs

If still 403, check:
- Supabase Edge Function logs for presigned URL generation
- Verify credentials are being used correctly
- Check for any errors in URL generation

## 🔍 Additional Debugging

### Check Presigned URL in Console

From console logs, copy the presigned URL and check:
- Does it include `X-Amz-Credential` with `AKIAVYV52CKKOOF6T52C`?
- Does it include `X-Amz-SignedHeaders=host` (when fileType is empty)?
- Is the domain correct (`tubbyai-products-catalog.s3.amazonaws.com`)?

### Test Presigned URL Directly

```javascript
// In browser console, after getting presigned URL
const presignedUrl = 'YOUR_PRESIGNED_URL_FROM_LOGS';

fetch(presignedUrl, {
  method: 'PUT',
  // NO headers (matches signature)
  body: 'test'
})
.then(r => {
  console.log('Status:', r.status);
  console.log('Response:', r);
  return r.text();
})
.then(text => console.log('Body:', text))
.catch(e => console.error('Error:', e));
```

## 🎯 Most Likely Next Step

**Redeploy the Edge Function** to force it to use the new credentials:

```powershell
supabase functions deploy uploads
```

Then wait 30 seconds and try again.

---

**Redeploy the function and test again! 🔄**
