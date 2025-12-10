# Update Supabase AWS Credentials to Match AWS CLI

## 🎯 Goal

Update Supabase Edge Function secrets to use the same AWS credentials as your AWS CLI (which has the `s3:PutObject` policy attached).

## 📋 Manual Steps

### Step 1: Get Your AWS CLI Credentials

**Option A: From AWS Console**
1. Go to AWS IAM Console
2. Find your IAM user
3. Security credentials tab
4. Copy Access Key ID and Secret Access Key

**Option B: From Credentials File**
```powershell
# View credentials file (be careful - contains sensitive data)
notepad $env:USERPROFILE\.aws\credentials
```

### Step 2: Update Supabase Secrets

**Using Supabase CLI:**
```powershell
# Set AWS Access Key ID
supabase secrets set AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID_HERE

# Set AWS Secret Access Key
supabase secrets set AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY_HERE

# Set AWS Region (should be us-east-1)
supabase secrets set AWS_REGION=us-east-1
```

**Using Supabase Dashboard:**
1. Go to Supabase Dashboard
2. Edge Functions → Settings → Secrets
3. Click the edit icon (⋮) next to each secret
4. Update:
   - `AWS_ACCESS_KEY_ID` = (your AWS CLI access key)
   - `AWS_SECRET_ACCESS_KEY` = (your AWS CLI secret key)
   - `AWS_REGION` = `us-east-1`
5. Save each secret

### Step 3: Verify Secrets Updated

```powershell
# List secrets to verify
supabase secrets list
```

### Step 4: Test the Fix

1. **Wait 10-30 seconds** for changes to propagate
2. **Hard refresh browser** (`Ctrl+Shift+R`)
3. **Try uploading a file**
4. **Check console** - should see:
   ```
   [ChatInput] S3 upload response: {
     status: 200,  // ✅ Should be 200, not 403!
     ok: true
   }
   ```

## 🔧 Automated Script

I've created a script at `scripts/update-supabase-aws-credentials.ps1` that automates this process.

**To run it:**
```powershell
cd C:\Users\senti\OneDrive\Desktop\SlashMCP
powershell -ExecutionPolicy Bypass -File scripts\update-supabase-aws-credentials.ps1
```

**Note:** The script reads from your `~/.aws/credentials` file and updates Supabase secrets automatically.

## ✅ Verification

After updating, verify:
- [ ] `AWS_ACCESS_KEY_ID` matches your AWS CLI
- [ ] `AWS_SECRET_ACCESS_KEY` matches your AWS CLI  
- [ ] `AWS_REGION` is `us-east-1`
- [ ] Upload test returns status 200

## 🎉 Expected Result

Once credentials match:
- ✅ S3 upload should return **200 OK**
- ✅ File should appear in S3 bucket
- ✅ Upload pipeline should continue
- ✅ No more 403 Forbidden errors!

---

**Update the credentials and test! The 403 should be resolved! 🚀**
