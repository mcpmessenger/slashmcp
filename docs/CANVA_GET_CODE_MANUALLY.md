# How to Get Canva Authorization Code Manually

## Problem
The redirect URI `http://127.0.0.1:3000/callback` doesn't have a server running, so you get `ERR_CONNECTION_REFUSED`.

## Solution: Copy Code from URL

### Step 1: Authorize
Click "Yes" on the Canva authorization page.

### Step 2: Copy Code from URL
Before the page fully loads/errors, look at the browser address bar. You'll see:
```
http://127.0.0.1:3000/callback?code=AUTHORIZATION_CODE_HERE&state=...
```

**Quickly copy the `code` value** from the URL before the connection error appears.

### Step 3: Exchange Code for Token
Use this PowerShell command (replace `YOUR_CODE` and `YOUR_CODE_VERIFIER`):

```powershell
$clientId = "OC-AZqU_faZd5bf"
$clientSecret = "YOUR_CLIENT_SECRET"
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${clientId}:${clientSecret}"))
$code = "YOUR_CODE_FROM_URL"
$codeVerifier = "iDpi3EhlkVq_zw7yvcugVyWbsqZjjdXXoq5H2Tklejk"

$body = "grant_type=authorization_code&code=$code&redirect_uri=http://127.0.0.1:3000/callback&code_verifier=$codeVerifier"

$response = Invoke-RestMethod -Uri "https://api.canva.com/rest/v1/oauth/token" `
    -Method POST `
    -Headers @{
        "Authorization" = "Basic $auth"
        "Content-Type" = "application/x-www-form-urlencoded"
    } `
    -Body $body

Write-Host "Access Token: $($response.access_token)" -ForegroundColor Green
Write-Host "Refresh Token: $($response.refresh_token)" -ForegroundColor Green
```

### Step 4: Save Tokens
```powershell
npx supabase secrets set CANVA_ACCESS_TOKEN=$($response.access_token) --project-ref akxdroedpsvmckvqvggr
npx supabase secrets set CANVA_REFRESH_TOKEN=$($response.refresh_token) --project-ref akxdroedpsvmckvqvggr
```

## Alternative: Use a Public Redirect URI

If you have a public URL, you can:
1. Add it to Canva redirect URIs (e.g., `https://your-domain.com/callback`)
2. Use that in the authorization URL
3. Set up a simple page that displays the code

## Alternative: Use ngrok/Cloudflare Tunnel

Expose localhost temporarily:
```powershell
# Using Cloudflare Tunnel (if you have it)
C:\Users\senti\tools\cloudflared.exe tunnel --url http://127.0.0.1:3000

# Or use ngrok
ngrok http 3000
```

Then use the public URL as your redirect URI.

