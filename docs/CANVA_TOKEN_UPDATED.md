# Canva Access Token Updated ✅

## Current Configuration

- **Client ID**: `YOUR_CLIENT_ID` ✅ (set as Supabase secret)
- **Client Secret**: `YOUR_CLIENT_SECRET` ✅ (set as Supabase secret)
- **Access Token**: `YOUR_ACCESS_TOKEN` ✅ (set as Supabase secret)

## Usage

You can now use Canva MCP commands:

```
/canva-mcp create_design template=social_post text="New Research Findings"
```

## Token Refresh

If you have a refresh token, you can set it for automatic token refresh:

```bash
npx supabase secrets set CANVA_REFRESH_TOKEN=YOUR_REFRESH_TOKEN --project-ref akxdroedpsvmckvqvggr
```

The handler will automatically refresh expired access tokens if a refresh token is available.

## Testing

Try your command again - it should work now with the new access token!

