# Verify Supabase Credentials Match AWS CLI

## 🔍 Current AWS CLI Configuration

From your terminal:
- **Access Key ID:** Ends with `T52C`
- **Secret Key:** Ends with `SiLA`
- **Region:** `us-east-1`

## ✅ Verification Steps

### Step 1: Check Supabase Access Key ID Prefix

Since Supabase shows SHA256 digests, we can't see the full value, but we can verify:

1. **In Supabase Dashboard:**
   - Edge Functions → Settings → Secrets
   - Find `AWS_ACCESS_KEY_ID`
   - The digest starts with `04815004...`

2. **Compare with AWS CLI:**
   - Your AWS CLI access key ends with `T52C`
   - We need to check if Supabase is using the same key

### Step 2: Verify Region Matches

**Supabase:** `AWS_REGION` should be `us-east-1` (matches your AWS CLI ✅)

### Step 3: Check IAM User

**Critical:** The IAM user with access key ending in `T52C` needs the `s3:PutObject` policy attached.

**To verify:**
1. Go to AWS IAM Console
2. Find the IAM user with access key ending in `T52C`
3. Check Permissions tab
4. Verify `s3:PutObject` policy is attached

### Step 4: If Credentials Don't Match

**Option A: Update Supabase to Use AWS CLI Credentials**
1. Get full access key ID from AWS CLI (see command below)
2. Get full secret key from AWS CLI
3. Update Supabase Edge Function secrets:
   - `AWS_ACCESS_KEY_ID` = (from AWS CLI)
   - `AWS_SECRET_ACCESS_KEY` = (from AWS CLI)
   - `AWS_REGION` = `us-east-1`

**Option B: Attach Policy to Supabase's IAM User**
1. Find which IAM user Supabase is using (from Supabase secrets)
2. Attach the `s3:PutObject` policy to that user

## 🛠️ Commands to Get Full Credentials

```powershell
# Get full access key ID (first 8 chars shown, rest hidden)
aws configure get aws_access_key_id

# Note: Secret key cannot be retrieved (security), you'll need to re-enter it
# But you can verify the first few characters match Supabase digest
```

## 🎯 Most Likely Solution

Since AWS CLI works, your local credentials have the policy. **Update Supabase to use the same credentials:**

1. Copy your AWS CLI access key ID (full value)
2. Copy your AWS CLI secret key (full value)
3. Update Supabase Edge Function secrets with these values
4. Ensure `AWS_REGION` is `us-east-1`

## 📝 Quick Checklist

- [ ] AWS CLI access key ends with `T52C` ✅
- [ ] AWS CLI region is `us-east-1` ✅
- [ ] IAM user with key `...T52C` has `s3:PutObject` policy ✅ (AWS CLI works)
- [ ] Supabase `AWS_ACCESS_KEY_ID` matches AWS CLI
- [ ] Supabase `AWS_SECRET_ACCESS_KEY` matches AWS CLI
- [ ] Supabase `AWS_REGION` is `us-east-1`

---

**Once Supabase uses the same credentials as AWS CLI, the 403 should be resolved! 🎯**
