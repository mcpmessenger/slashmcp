# Quick Update: Supabase AWS Credentials

## 🚀 Quick Commands

Run these commands to update Supabase to use your AWS CLI credentials:

```powershell
# Get your AWS credentials (replace with your actual values)
$accessKey = "YOUR_ACCESS_KEY_ID_HERE"  # From AWS CLI or IAM Console
$secretKey = "YOUR_SECRET_KEY_HERE"      # From AWS CLI or IAM Console

# Update Supabase secrets
supabase secrets set AWS_ACCESS_KEY_ID=$accessKey
supabase secrets set AWS_SECRET_ACCESS_KEY=$secretKey
supabase secrets set AWS_REGION=us-east-1
```

## 📋 Step-by-Step

### Option 1: Get Credentials from AWS CLI Config

```powershell
# View your credentials file
notepad $env:USERPROFILE\.aws\credentials

# Copy the values for:
# - aws_access_key_id
# - aws_secret_access_key
```

### Option 2: Get Credentials from AWS Console

1. Go to AWS IAM Console
2. Users → Your IAM User → Security credentials
3. Copy Access Key ID and Secret Access Key

### Then Update Supabase

```powershell
# Replace YOUR_ACCESS_KEY_ID and YOUR_SECRET_KEY with actual values
supabase secrets set AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID
supabase secrets set AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY
supabase secrets set AWS_REGION=us-east-1
```

## ✅ Verify Update

```powershell
# List secrets to confirm
supabase secrets list
```

## 🧪 Test After Update

1. Wait 10-30 seconds
2. Hard refresh browser (Ctrl+Shift+R)
3. Try uploading a file
4. Should see status 200 instead of 403!

---

**Once credentials match, the 403 error should be resolved! 🎯**
