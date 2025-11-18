# Canva Token Expiration Check

## Token Status

The access token might have expired. Access tokens typically expire after 1 hour.

## Check Token Expiration

To check if your token is expired, decode the JWT and check the `exp` field.

## Get a New Token with Refresh Token

When you exchange the authorization code for an access token, make sure to also get a refresh token. The response should include:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## Set Refresh Token

Once you have a refresh token, set it:

```powershell
npx supabase secrets set CANVA_REFRESH_TOKEN=YOUR_REFRESH_TOKEN --project-ref akxdroedpsvmckvqvggr
```

The handler will automatically refresh expired access tokens if a refresh token is available.

## Quick Token Refresh

If you have a refresh token, the handler will automatically refresh it. Otherwise, you'll need to go through the OAuth flow again to get a new access token.

