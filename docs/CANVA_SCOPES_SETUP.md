# Canva Scopes Configuration

## Yes, You Need to Enable Scopes! ✅

For Canva API to work properly, you **must** configure OAuth scopes in the Canva Developer portal. Scopes determine what permissions your integration has.

## Required Scopes for Design Creation

To use the `create_design` command, you need at least these scopes:

- **`design:read`** - Read access to designs
- **`design:write`** - Write/create access to designs

## How to Enable Scopes

1. **Go to Canva Developer Portal**: https://www.canva.com/developers/
2. **Navigate to Your Integration**: Click on "Your integrations" → Select your integration
3. **Go to OAuth Settings**: Look for "OAuth" or "Scopes" section
4. **Enable Required Scopes**: 
   - Check `design:read`
   - Check `design:write`
5. **Save Changes**

## Updated Credentials

Based on the Canva Developer portal screenshot:

- **Client ID**: `OC-AZqU_faZd5bf` (Note: This is different from the previous one)
- **Client Secret**: `YOUR_CLIENT_SECRET` (set as Supabase secret)

## Important Notes

1. **Scopes Must Match**: The access token you obtain must include the scopes you've enabled
2. **User Authorization**: When users authorize your app, they'll see what permissions you're requesting
3. **Token Scope**: The access token will only have permissions for the scopes that were:
   - Enabled in your integration settings
   - Requested during the OAuth authorization flow
   - Approved by the user

## OAuth Authorization URL

When requesting authorization, make sure to include the scopes:

```
https://www.canva.com/api/oauth/authorize?
  client_id=OC-AZqU_faZd5bf&
  response_type=code&
  redirect_uri=YOUR_REDIRECT_URI&
  scope=design:read design:write
```

## Next Steps

1. ✅ Update Client Secret (done)
2. ⏳ Enable scopes in Canva Developer portal
3. ⏳ Get a new access token with the proper scopes
4. ⏳ Test the create_design command

## References

- [Canva OAuth Scopes Documentation](https://www.canva.dev/docs/apps/authenticating-users/oauth/)
- [Canva API Permissions](https://www.canva.dev/docs/connect/api-reference/)

