# Canva OAuth2 with PKCE Flow

## Canva Requires PKCE

Canva uses OAuth2 with PKCE (Proof Key for Code Exchange) for enhanced security. This requires:

1. **Code Verifier**: A random string you generate
2. **Code Challenge**: SHA256 hash of the code verifier (base64url encoded)
3. **Code Challenge Method**: `s256` (SHA256)

## Authorization URL

Use this URL (you'll need to generate the `code_challenge`):

```
https://www.canva.com/api/oauth/authorize?
  code_challenge_method=s256&
  response_type=code&
  client_id=OC-AZqU_faZd5bf&
  redirect_uri=http://127.0.0.1:3000/callback&
  scope=design:content:write design:meta:read design:content:read design:permission:write design:permission:read&
  code_challenge=YOUR_CODE_CHALLENGE
```

## Generate PKCE Parameters (PowerShell)

```powershell
# Generate code verifier (43-128 characters, URL-safe)
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$codeVerifier = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')

# Generate code challenge (SHA256 hash, base64url encoded)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hash = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($codeVerifier))
$codeChallenge = [Convert]::ToBase64String($hash).TrimEnd('=').Replace('+', '-').Replace('/', '_')

Write-Host "Code Verifier (save this!): $codeVerifier" -ForegroundColor Green
Write-Host "Code Challenge: $codeChallenge" -ForegroundColor Yellow
```

## Complete Flow

### 1. Generate PKCE Parameters
Run the PowerShell script above to get `codeVerifier` and `codeChallenge`.

### 2. Authorize
Visit the authorization URL with your `codeChallenge`:
```
https://www.canva.com/api/oauth/authorize?code_challenge_method=s256&response_type=code&client_id=OC-AZqU_faZd5bf&redirect_uri=http://127.0.0.1:3000/callback&scope=design:content:write design:meta:read design:content:read design:permission:write design:permission:read&code_challenge=YOUR_CODE_CHALLENGE
```

### 3. Get Authorization Code
After authorization, you'll be redirected to:
```
http://127.0.0.1:3000/callback?code=AUTHORIZATION_CODE
```

### 4. Exchange Code for Token
Use the authorization code AND the code verifier:

```powershell
$clientId = "OC-AZqU_faZd5bf"
$clientSecret = "YOUR_CLIENT_SECRET"
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${clientId}:${clientSecret}"))
$code = "YOUR_AUTHORIZATION_CODE"
$codeVerifier = "YOUR_CODE_VERIFIER" # From step 1

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

### 5. Save the Tokens
```powershell
npx supabase secrets set CANVA_ACCESS_TOKEN=$($response.access_token) --project-ref akxdroedpsvmckvqvggr
npx supabase secrets set CANVA_REFRESH_TOKEN=$($response.refresh_token) --project-ref akxdroedpsvmckvqvggr
```

## Important Notes

- **Save the code verifier** - You need it to exchange the authorization code
- **Code challenge** is derived from code verifier - don't generate them separately
- **Redirect URI** must match exactly: `http://127.0.0.1:3000/callback`
- **Scopes** are granular: `design:content:write`, `design:content:read`, etc.

