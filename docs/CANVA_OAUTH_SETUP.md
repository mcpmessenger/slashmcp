# Canva OAuth2 Setup Complete ✅

## Credentials Configured

Your Canva credentials are now fully configured:

- **Client ID**: `YOUR_CLIENT_ID` ✅ (set as environment variable)
- **Client Secret**: `YOUR_CLIENT_SECRET` ✅ (set as environment variable)
- **Access Token**: `YOUR_ACCESS_TOKEN` ✅ (obtained via OAuth2 flow)

## Usage

You can now use Canva MCP commands:

```
/canva-mcp create_design template=social_post text="New Research Findings"
```

## How It Works

The Canva handler will:
1. Check for `CANVA_ACCESS_TOKEN` first (fastest)
2. Fall back to Key Manager if not found in environment
3. Use the access token with Bearer authentication for all API calls

## Token Management

**Important Notes:**
- Access tokens expire after a certain period (typically 1 hour)
- When a token expires, you'll need to refresh it using the refresh token
- The handler currently uses the access token directly - refresh token support can be added if needed

## Troubleshooting

If you get authentication errors:

1. **Token Expired**: Get a new access token through OAuth2 flow
2. **Invalid Token**: Verify the token is correct and hasn't been revoked
3. **API Errors**: Check Canva API documentation for correct endpoint formats

## References

- [Canva Developer Portal](https://www.canva.com/developers/)
- [Canva Connect API Documentation](https://www.canva.dev/docs/connect/)
- [OAuth2 Authentication Guide](https://www.canva.dev/docs/connect/api-reference/authentication/)

