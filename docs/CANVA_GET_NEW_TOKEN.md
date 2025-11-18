# Get New Canva Access Token

## Current Status

- ✅ Client ID: `OC-AZqU_faZd5bf`
- ✅ Client Secret: `YOUR_CLIENT_SECRET` (set as Supabase secret)
- ❌ Refresh Token: Invalid/expired
- ❌ Access Token: Expired

## Steps to Get New Tokens

### Step 1: Start Callback Server

Open a **NEW PowerShell window** and run:

```powershell
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:3000/")
$listener.Start()
Write-Host "Listening on http://127.0.0.1:3000/ - Waiting for callback..." -ForegroundColor Green
$ctx = $listener.GetContext()
$code = $ctx.Request.QueryString["code"]
Write-Host "`n✅ Authorization Code: $code" -ForegroundColor Green
$ctx.Response.Close()
$listener.Stop()
```

### Step 2: Authorize

Visit this URL in your browser:

```
https://www.canva.com/api/oauth/authorize?code_challenge_method=s256&response_type=code&client_id=OC-AZqU_faZd5bf&redirect_uri=http://127.0.0.1:3000/callback&scope=design:content:write design:meta:read design:content:read design:permission:write design:permission:read&code_challenge=4-EEI2t_sHBdSV9mToiA8Cddioq0gi1gH2h3GaPZlWw
```

Click "Yes" to authorize.

### Step 3: Get Authorization Code

The callback server will display the authorization code. Copy it.

### Step 4: Exchange for Tokens

Share the authorization code and I'll exchange it for access and refresh tokens, then set them automatically.

## Code Verifier

**Important**: Save this code verifier - you'll need it:
```
iDpi3EhlkVq_zw7yvcugVyWbsqZjjdXXoq5H2Tklejk
```

## Quick Exchange Command

Once you have the authorization code, run:

```powershell
$clientId = "OC-AZqU_faZd5bf"
$clientSecret = "YOUR_CLIENT_SECRET"
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${clientId}:${clientSecret}"))
$code = "YOUR_AUTHORIZATION_CODE"
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

