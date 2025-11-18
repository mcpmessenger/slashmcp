# Canva API Troubleshooting

## Current Issue: Invalid Access Token

The access token is being rejected by Canva's API. This could be due to:

1. **Token Format**: The token might not be in the correct format
2. **Token Expiration**: The token may have expired
3. **API Endpoint**: The endpoint might be incorrect
4. **OAuth Flow**: The token might need to be obtained through a different OAuth flow

## Current Configuration

- **Client ID**: `YOUR_CLIENT_ID` (set as environment variable)
- **Client Secret**: `YOUR_CLIENT_SECRET` (set as environment variable)
- **Access Token**: `YOUR_ACCESS_TOKEN` (obtained via OAuth2 flow)

## Possible Solutions

### 1. Verify Token Format
Canva access tokens typically start with specific prefixes. Verify the token format matches Canva's expected format.

### 2. Check API Endpoint
The current implementation uses: `https://api.canva.com/rest/v1/designs`

This might not be the correct endpoint. Canva's API documentation should be checked for the actual endpoint.

### 3. Verify OAuth Flow
Ensure the token was obtained through the correct OAuth2 authorization code flow with proper scopes:
- `design:read`
- `design:write`

### 4. Test Token Manually
Try making a simple API call to verify the token works:
```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  https://api.canva.com/rest/v1/designs
```

## Next Steps

1. Check Canva API documentation for correct endpoints
2. Verify the token was obtained through proper OAuth flow
3. Test the token with a simple API call
4. Consider if Canva's API requires different authentication (e.g., user-specific tokens vs app tokens)

## References

- [Canva Connect API Documentation](https://www.canva.dev/docs/connect/)
- [Canva OAuth Authentication](https://www.canva.dev/docs/apps/authenticating-users/oauth/)
- [Canva Error Responses](https://www.canva.dev/docs/connect/error-responses/)

