# Testing the Content-Type Header Fix

## ✅ Fix Applied

The fix has been applied to `src/components/ui/chat-input.tsx`. The code now:
- Only sends Content-Type header if `file.type` is present and non-empty
- Trims whitespace to ensure exact match with server signature
- Matches what the presigned URL was signed with

## 🧪 Testing Steps

### Step 1: Hard Refresh Browser

**Important:** The browser may be caching old JavaScript. Do a hard refresh:

- **Chrome/Edge:** `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- **Firefox:** `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
- **Or:** Open DevTools → Right-click refresh button → "Empty Cache and Hard Reload"

### Step 2: Check Console Logs

After refreshing, try uploading a file and check the console for:

```
[ChatInput] Request details: {
  contentType: "application/pdf" or "(not included - matches presigned URL signature)",
  headersMatchSignature: "Content-Type signed" or "No Content-Type (as signed)"
}
```

**Expected:** Should show the Content-Type value or indicate it's not included.

### Step 3: Check Network Tab

1. Open DevTools → Network tab
2. Try uploading a file
3. Look for the PUT request to S3 (should be to `s3.amazonaws.com` or similar)
4. Check:
   - **Status:** Should be 200 (success) or show specific error
   - **Request Headers:** Check if Content-Type is present and matches
   - **Response Headers:** Look for CORS headers or error messages
   - **Error Details:** If it fails, check the exact error message

### Step 4: Test Different File Types

1. **File with MIME type (PDF, image, etc.):**
   - Should have `file.type = "application/pdf"` or similar
   - Should send Content-Type header
   - Should work ✅

2. **File without MIME type:**
   - Should have `file.type = ""` or empty
   - Should NOT send Content-Type header
   - Should work ✅

## 🔍 If Still Failing

### Check 1: Verify Fix is Loaded

In browser console, check if the new code is running:
```javascript
// This should show the new logging format
// Look for "headersMatchSignature" in console logs
```

### Check 2: CORS Issue

If Network tab shows CORS error:
- Check S3 bucket CORS configuration
- Verify your origin (`http://localhost:8080` for local dev) is in AllowedOrigins
- See `docs/VERIFY_S3_BUCKET_CONFIG.md`

### Check 3: Content-Type Value Mismatch

If Content-Type is being sent but still failing:
- Check if the value matches exactly (case-sensitive, no extra whitespace)
- Server signs with: `body.fileType` (from request)
- Client sends: `file.type.trim()` (from File object)
- They must match exactly!

### Check 4: Presigned URL Signature

The presigned URL signature includes:
- `X-Amz-SignedHeaders` query parameter
- Should be `content-type;host` if Content-Type was provided
- Should be `host` if Content-Type was NOT provided

Check the presigned URL in console logs to verify.

## 📊 Expected Success Indicators

After the fix works, you should see:

1. ✅ Console: `[ChatInput] S3 upload response: {status: 200, ok: true}`
2. ✅ Network tab: PUT request to S3 returns 200
3. ✅ No "Failed to fetch" errors
4. ✅ Upload pipeline continues to next step
5. ✅ File appears in S3 bucket

## 🐛 If Still Not Working

1. **Check Supabase Edge Function logs:**
   - Verify presigned URL is being generated correctly
   - Check what `body.fileType` value is being used

2. **Compare server vs client:**
   - Server uses: `body.fileType` (from API request)
   - Client uses: `file.type` (from File object)
   - These should match!

3. **Check for other headers:**
   - S3 presigned URLs are strict - only send headers that were signed
   - Don't add any extra headers

4. **Verify S3 bucket permissions:**
   - IAM user needs `s3:PutObject` permission
   - Bucket policy should allow uploads

---

**The fix is applied - now test it! 🧪**
