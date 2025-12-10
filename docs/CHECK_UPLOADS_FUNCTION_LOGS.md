# Check Uploads Function Logs for Credentials

## 🎯 What to Look For

In Supabase Dashboard → Edge Functions → `uploads` → Logs, look for:

### 1. Presigned URL Generation Details

After an upload attempt, you should see logs like:
```
Presigned URL generation details: {
  bucket: "tubbyai-products-catalog",
  region: "us-east-1",
  contentType: "" or "(empty - will not sign Content-Type)",
  hasAccessKeyId: true,
  hasSecretAccessKey: true,
  accessKeyIdPrefix: "AKIAVYV5..."  // ← CHECK THIS!
}
```

**Critical:** The `accessKeyIdPrefix` should start with `AKIAVYV5` (matching your credentials).

**If it shows a different prefix:**
- Supabase is still using old credentials
- Wait 1-2 minutes for propagation
- Or redeploy the function again

### 2. Presigned URL Generated

You should also see:
```
Presigned URL generated: {
  urlLength: ...,
  urlDomain: "tubbyai-products-catalog.s3.amazonaws.com",
  hasSignature: true,
  signedHeaders: "host only" or "content-type;host",
  duration: "...ms"
}
```

### 3. Any Errors

Look for:
- Errors during presigned URL generation
- Missing credentials warnings
- Any 500/503 errors from the `uploads` function

## 🔍 How to Filter Logs

1. In Supabase Dashboard → Edge Functions → `uploads` → Logs
2. Use the filter/search to find:
   - "Presigned URL generation details"
   - "Creating presigned URL"
   - Any errors or warnings

## 📝 What to Report

After checking the logs, note:
1. What `accessKeyIdPrefix` shows (should be `AKIAVYV5...`)
2. Any errors during URL generation
3. Whether credentials are present (`hasAccessKeyId: true`)

---

**Check the `uploads` function logs (not `textract-worker`) to see which credentials are being used! 🔍**



