# How to Get a Canva Access Token

## Current Status

✅ Scopes enabled:
- `design:content` (read + write)
- `design:meta` (read)
- `design:permission` (read + write)

✅ Credentials configured:
- Client ID: `OC-AZqU_faZd5bf`
- Client Secret: `YOUR_CLIENT_SECRET` (set as Supabase secret)

## Step-by-Step: Get Access Token

### 1. Set Up Redirect URI

In your Canva Developer portal:
- Go to your integration settings
- Add a redirect URI (e.g., `http://localhost:3000/callback` or `https://your-domain.com/callback`)
- Save the changes

### 2. Authorize Your App

Visit this URL (replace `YOUR_REDIRECT_URI` with the one you configured):

```
https://www.canva.com/api/oauth/authorize?
  client_id=OC-AZqU_faZd5bf&
  response_type=code&
  redirect_uri=YOUR_REDIRECT_URI&
  scope=design:content design:meta design:permission
```

### 3. Get Authorization Code

After authorization, Canva will redirect to your redirect URI with a `code` parameter:
```
YOUR_REDIRECT_URI?code=AUTHORIZATION_CODE
```

Copy the `code` value.

### 4. Exchange Code for Access Token

Make a POST request to exchange the authorization code:

```bash
curl -X POST https://api.canva.com/rest/v1/oauth/token \
  -H "Authorization: Basic $(echo -n 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=AUTHORIZATION_CODE&redirect_uri=YOUR_REDIRECT_URI"
```

### 5. Save the Access Token

The response will include:
```json
{
  "access_token": "cnvca...",
  "refresh_token": "cnvca...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Set the access token:
```bash
npx supabase secrets set CANVA_ACCESS_TOKEN=YOUR_ACCESS_TOKEN --project-ref akxdroedpsvmckvqvggr
```

Optionally set the refresh token:
```bash
npx supabase secrets set CANVA_REFRESH_TOKEN=YOUR_REFRESH_TOKEN --project-ref akxdroedpsvmckvqvggr
```

## Testing

Once you have the new access token, try:
```
/canva-mcp create_design template=social_post text="Test"
```

## References

- [Canva OAuth Guide](https://www.canva.dev/docs/apps/authenticating-users/oauth/)
- [Canva API Authentication](https://www.canva.dev/docs/connect/api-reference/authentication/)

