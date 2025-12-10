# Fix: S3 Upload "Failed to fetch" - Content-Type Header Mismatch 🎯

## 🐛 The Real Root Cause

The "Failed to fetch" error during S3 upload was caused by a **Content-Type header mismatch** between what the presigned URL was signed with and what the client was sending.

### What Was Happening

1. **Server-side (Presigned URL Generation):**
   - In `supabase/functions/uploads/index.ts`, the presigned URL is generated with:
     ```typescript
     contentType: body.fileType  // Can be empty/null/undefined
     ```
   - If `body.fileType` is empty/null/undefined, the presigned URL is signed **WITHOUT** Content-Type header
   - Line 95: `const signedHeaders = contentType ? "content-type;host" : "host";`
   - This means the signature only includes Content-Type if it was provided

2. **Client-side (S3 Upload):**
   - In `src/components/ui/chat-input.tsx`, the PUT request was always sending:
     ```typescript
     headers: {
       "Content-Type": file.type || "application/octet-stream"  // Always sends header!
     }
     ```
   - Even when `file.type` was empty, it would send `"application/octet-stream"`

3. **The Mismatch:**
   - When `file.type` is empty → Presigned URL signed WITHOUT Content-Type
   - But client sends Content-Type: "application/octet-stream"
   - **S3 rejects the request** because the signature doesn't match
   - Result: `TypeError: Failed to fetch`

### Why This Happens

S3 presigned URLs are cryptographically signed with specific headers. If you:
- Sign WITH Content-Type → You MUST send Content-Type (and it must match exactly)
- Sign WITHOUT Content-Type → You MUST NOT send Content-Type

Sending a header that wasn't signed (or not sending a header that was signed) causes S3 to reject the request at a low level, resulting in the generic "Failed to fetch" error.

## 🔧 The Fix

### Modified: `src/components/ui/chat-input.tsx`

**Before:**
```typescript
uploadResp = await fetch(response.uploadUrl, {
  method: "PUT",
  headers: {
    "Content-Type": file.type || "application/octet-stream",  // ❌ Always sends header
  },
  body: file,
});
```

**After:**
```typescript
// CRITICAL FIX: Only include Content-Type header if file.type is present
// The presigned URL is signed with Content-Type only if contentType was provided
// If we send Content-Type when it wasn't signed, S3 will reject the request
const uploadHeaders: Record<string, string> = {};
if (file.type) {
  uploadHeaders["Content-Type"] = file.type;
}

uploadResp = await fetch(response.uploadUrl, {
  method: "PUT",
  headers: uploadHeaders,  // ✅ Only includes Content-Type if file.type exists
  body: file,
});
```

### Key Changes

1. **Conditional Header Inclusion:** Only add Content-Type to headers if `file.type` is truthy
2. **Matches Server Signature:** Client headers now exactly match what the presigned URL was signed with
3. **Removed CORS Preflight Test:** Also removed unnecessary manual OPTIONS test (browsers handle this automatically)

## ✅ Expected Behavior After Fix

1. User uploads file with `file.type = "application/pdf"` → Presigned URL signed WITH Content-Type → Client sends Content-Type → ✅ Works
2. User uploads file with `file.type = ""` → Presigned URL signed WITHOUT Content-Type → Client doesn't send Content-Type → ✅ Works
3. User uploads file with `file.type = undefined` → Presigned URL signed WITHOUT Content-Type → Client doesn't send Content-Type → ✅ Works

## 🧪 Testing

After applying the fix:

1. **Test with file that has MIME type:**
   - Upload a PDF, image, or document
   - Should work (Content-Type included in both signature and request)

2. **Test with file without MIME type:**
   - Upload a file where `file.type` is empty
   - Should work (no Content-Type in signature or request)

3. **Check console logs:**
   ```
   [ChatInput] Request details: {
     contentType: "application/pdf" or "(not included - matches presigned URL signature)",
     headersMatchSignature: "Content-Type signed" or "No Content-Type (as signed)"
   }
   ```

4. **Check Network tab:**
   - PUT request to S3 should succeed (200)
   - Request headers should match what was signed

## 📝 Key Learnings

1. **S3 Presigned URLs are strict** - Headers must exactly match the signature
2. **Empty/null values matter** - If server doesn't sign a header, client must not send it
3. **Fallback values can break signatures** - Using `|| "application/octet-stream"` broke the signature when `file.type` was empty
4. **Debug systematically** - The error was generic, but the root cause was specific header mismatch

## 🎉 Status

**FIXED!** The Content-Type header mismatch has been resolved. Client now only sends Content-Type when it was included in the presigned URL signature.

---

**Bug squashed! 🐛💥**
