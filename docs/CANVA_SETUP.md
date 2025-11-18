# Canva MCP Setup Guide

## Credentials Configured ✅

Your Canva credentials have been set up:

- **Client ID**: `YOUR_CLIENT_ID` (set as environment variable)
- **Client Secret**: `YOUR_CLIENT_SECRET` (set as environment variable)

## Usage

Now you can use Canva MCP commands:

```
/canva-mcp create_design template=social_post text="New Research Findings"
```

## Available Commands

### create_design

Creates a new design using a Canva template.

**Parameters:**
- `template` or `template_id` (required): Template ID or name (e.g., "social_post", "presentation", "poster")
- `text` or `content` (optional): Text content to add to the design
- `width` (optional): Design width in pixels
- `height` (optional): Design height in pixels
- `brand_id` (optional): Brand ID if using Canva for Teams

**Examples:**
```
/canva-mcp create_design template=social_post text="Hello World"
/canva-mcp create_design template=presentation text="My Presentation"
/canva-mcp create_design template=poster width=1080 height=1920 text="Event Poster"
```

## Authentication

The handler supports three authentication methods (in order of preference):

1. **Access Token** (if `CANVA_ACCESS_TOKEN` is set): Uses Bearer token authentication
2. **Client Credentials** (if both `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` are set): Uses Basic auth
3. **Key Manager** (if stored via `/key add`): Retrieves credentials from user's encrypted key storage

## Current Setup

✅ Client ID set as Supabase secret: `CANVA_CLIENT_ID`  
✅ Client Secret set as Supabase secret: `CANVA_CLIENT_SECRET`

## Next Steps

1. **Test the integration**: Try creating a design with `/canva-mcp create_design template=social_post text="Test"`
2. **Get Access Token** (optional): If you want to use OAuth2 flow, you'll need to exchange the client credentials for an access token. See [Canva API Documentation](https://www.canva.dev/docs/connect/api-reference/oauth/)
3. **Set Access Token** (optional): If you have an access token, set it as `CANVA_ACCESS_TOKEN` for better performance

## Troubleshooting

If you encounter errors:

1. **"Canva Client ID is not configured"**: Make sure `CANVA_CLIENT_ID` is set as a Supabase secret
2. **"Canva authentication requires..."**: Ensure both Client ID and Client Secret are configured
3. **API errors**: Check the Canva API documentation for correct endpoint and parameter formats

## References

- [Canva Developer Portal](https://www.canva.com/developers/)
- [Canva Connect API Documentation](https://www.canva.dev/docs/connect/)
- [Canva API Quickstart](https://www.canva.dev/docs/connect/quickstart/)

