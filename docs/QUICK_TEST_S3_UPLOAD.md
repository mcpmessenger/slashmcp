# Quick Test: S3 Upload Debugging

## 🚀 Quick Test Script

After uploading fails, run this in browser console to test the presigned URL directly:

```javascript
// Get the last error details
const lastError = window.__lastS3UploadError;
if (!lastError) {
  console.error("No error stored. Try uploading a file first.");
} else {
  console.log("Last S3 upload error:", lastError);
}

// Or manually test with a presigned URL from registerUploadJob
// (Check console logs for the presigned URL after registration succeeds)

// Test 1: Simple PUT request
async function testS3Upload(presignedUrl) {
  console.log("🧪 Testing S3 upload with presigned URL...");
  console.log("URL domain:", new URL(presignedUrl).hostname);
  
  try {
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: 'test content from console'
    });
    
    console.log('✅ SUCCESS!', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    const text = await response.text();
    console.log('Response body:', text);
    
    return { success: true, response };
  } catch (error) {
    console.error('❌ FAILED!', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return { success: false, error };
  }
}

// Test 2: Check CORS preflight
async function testCORSPreflight(presignedUrl) {
  console.log("🧪 Testing CORS preflight (OPTIONS)...");
  
  try {
    const response = await fetch(presignedUrl, {
      method: 'OPTIONS',
      headers: {
        'Origin': window.location.origin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    
    console.log('CORS preflight result:', {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    return { success: true, response };
  } catch (error) {
    console.error('CORS preflight failed:', error);
    return { success: false, error };
  }
}

// Usage:
// 1. Get presigned URL from console logs after registerUploadJob succeeds
// 2. Run: testCORSPreflight('YOUR_PRESIGNED_URL')
// 3. Run: testS3Upload('YOUR_PRESIGNED_URL')
```

## 🔍 What to Look For

### If CORS Preflight Fails
- **Symptom:** OPTIONS request fails or returns non-200
- **Cause:** S3 bucket CORS not configured correctly
- **Fix:** Check S3 bucket CORS configuration

### If CORS Preflight Succeeds but PUT Fails
- **Symptom:** OPTIONS returns 200, but PUT fails
- **Cause:** Different issue (not CORS)
- **Check:** 
  - Presigned URL signature
  - Request headers match presigned URL expectations
  - Network/firewall blocking

### If Both Fail with "Failed to fetch"
- **Symptom:** Both OPTIONS and PUT fail immediately
- **Cause:** Network-level blocking
- **Check:**
  - Browser extensions
  - Firewall/VPN
  - ISP blocking
  - Browser security settings

## 📊 Network Tab Checklist

When testing, check Network tab for:

- [ ] **OPTIONS request appears** - CORS preflight
  - Status: Should be 200 or 204
  - Response headers: Should include `Access-Control-Allow-Origin`
  
- [ ] **PUT request appears** - Actual upload
  - Status: Should be 200
  - Request headers: Should include `Origin` and `Content-Type`
  - Response headers: Should include CORS headers

- [ ] **No requests appear** - Browser blocking before network
  - Check browser console for CSP errors
  - Check browser extensions
  - Try incognito mode

## 🎯 Quick Diagnosis

Run this after a failed upload:

```javascript
// Quick diagnosis
console.log("=== S3 Upload Diagnosis ===");
console.log("Current origin:", window.location.origin);
console.log("User agent:", navigator.userAgent);
console.log("Last error:", window.__lastS3UploadError);

// Check if we can reach S3 at all
fetch('https://s3.amazonaws.com')
  .then(() => console.log("✅ Can reach S3"))
  .catch(e => console.error("❌ Cannot reach S3:", e));
```

## 💡 Pro Tips

1. **Check Browser Console First** - Look for CSP errors or other security warnings
2. **Network Tab is Your Friend** - See exactly what requests are being made
3. **Test in Incognito** - Rules out browser extensions
4. **Check Presigned URL Format** - Should be valid URL with query params
5. **Verify Content-Type** - Must match what was used to generate presigned URL

---

**Ready to squash that bug! 🐛💥**
