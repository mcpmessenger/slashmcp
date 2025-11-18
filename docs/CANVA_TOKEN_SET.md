# Canva Access Token Set ✅

## Token Configured

The Canva access token has been set as a Supabase secret.

## Token Details (from JWT payload)

- **Client ID**: `OC-AZqU_faZd5bf` ✅
- **Scopes**: 
  - `design:content:write` ✅
  - `design:meta:read` ✅
  - `design:content:read` ✅
  - `design:permission:write` ✅
  - `design:permission:read` ✅
- **Expires**: Token expires in 1 hour (exp: 1763437751)
- **Brand**: Configured ✅
- **User**: Authenticated ✅

## Test the Integration

Now you can test the Canva MCP command:

```
/canva-mcp create_design template=social_post text="New Research Findings"
```

## Token Refresh

The token expires in 1 hour. If you have a refresh token, set it as `CANVA_REFRESH_TOKEN` and the handler will automatically refresh expired tokens.

## Current Configuration

✅ Client ID: `OC-AZqU_faZd5bf`  
✅ Client Secret: `YOUR_CLIENT_SECRET` (set as Supabase secret)  
✅ Access Token: Set (JWT with all required scopes)  
⏳ Refresh Token: Not set (optional, for automatic refresh)

## Next Steps

1. **Test the command**: Try `/canva-mcp create_design template=social_post text="Test"`
2. **If token expires**: Get a new access token or set a refresh token for automatic renewal
3. **Check API endpoint**: Verify the Canva API endpoint format if you encounter errors

