# Canva OAuth Authorization URL

## Authorization URL (Updated)

**Use this URL (with 127.0.0.1 instead of localhost):**
```
https://www.canva.com/api/oauth/authorize?client_id=OC-AZqU_faZd5bf&response_type=code&redirect_uri=http://127.0.0.1:3000/callback&scope=design:content design:meta design:permission
```

## Important: Configure Redirect URI First!

Before using the URL, you **must** add the redirect URI in your Canva Developer portal:

1. Go to: https://www.canva.com/developers/integrations/connect-api/OC-AZqU_faZd5bf
2. Find "Redirect URIs" or "OAuth Settings"
3. Add: `http://127.0.0.1:3000/callback` (NOT localhost - use 127.0.0.1)
4. Save the changes

## After Authorization

1. **Copy the authorization code** from the redirect URL:
   ```
   http://127.0.0.1:3000/callback?code=AUTHORIZATION_CODE_HERE
   ```

2. **Exchange for access token** using this command (PowerShell):
   ```powershell
   $clientId = "OC-AZqU_faZd5bf"
   $clientSecret = "YOUR_CLIENT_SECRET"
   $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${clientId}:${clientSecret}"))
   $code = "YOUR_AUTHORIZATION_CODE_HERE"
   
   $body = @{
       grant_type = "authorization_code"
       code = $code
       redirect_uri = "http://127.0.0.1:3000/callback"
   } | ConvertTo-Json
   
   Invoke-RestMethod -Uri "https://api.canva.com/rest/v1/oauth/token" `
       -Method POST `
       -Headers @{
           "Authorization" = "Basic $auth"
           "Content-Type" = "application/x-www-form-urlencoded"
       } `
       -Body "grant_type=authorization_code&code=$code&redirect_uri=http://127.0.0.1:3000/callback"
   ```

   Or using curl (if available):
   ```bash
     curl -X POST https://api.canva.com/rest/v1/oauth/token \
     -H "Authorization: Basic $(echo -n 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' | base64)" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code&code=YOUR_AUTHORIZATION_CODE_HERE&redirect_uri=http://127.0.0.1:3000/callback"
   ```

3. **Save the access token**:
   ```powershell
   npx supabase secrets set CANVA_ACCESS_TOKEN=YOUR_ACCESS_TOKEN --project-ref akxdroedpsvmckvqvggr
   ```

## One-Line Command (PowerShell)

Open the authorization URL directly:

```powershell
Start-Process "https://www.canva.com/api/oauth/authorize?client_id=OC-AZqU_faZd5bf&response_type=code&redirect_uri=http://127.0.0.1:3000/callback&scope=design:content design:meta design:permission"
```

Or copy-paste this URL into your browser:
```
https://www.canva.com/api/oauth/authorize?client_id=OC-AZqU_faZd5bf&response_type=code&redirect_uri=http://127.0.0.1:3000/callback&scope=design:content design:meta design:permission
```
