# Email OAuth Setup Guide

## Overview

The email-mcp server now supports sending emails through multiple providers using OAuth:
- **Gmail** (Google) - ✅ Fully Implemented
- **Google Calendar** - ✅ OAuth scopes added (ready for calendar features)
- **Outlook** (Microsoft/Azure) - ✅ Implemented
- **iCloud** - ⏳ Infrastructure ready (requires Apple Developer setup)

## Current Implementation

### Gmail Integration

The email handler now:
1. **First tries Gmail API** if user has Google OAuth with Gmail scope
2. **Falls back to Supabase email** if Gmail OAuth isn't available

### OAuth Scopes Added

When users sign in with Google, the app now requests these scopes:
- `openid email profile` - Basic user info
- `https://www.googleapis.com/auth/gmail.send` - Send emails via Gmail
- `https://www.googleapis.com/auth/calendar` - Access Google Calendar (for future features)

## Setup Steps

### 1. Update Google OAuth Configuration

The OAuth scopes are automatically requested when users sign in. However, you need to:

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Select your project** (or create one)
3. **Enable APIs**:
   - Go to **APIs & Services** → **Library**
   - Search for "Gmail API" → **Enable**
   - Search for "Google Calendar API" → **Enable**
4. **Configure OAuth Consent Screen**:
   - Go to **APIs & Services** → **OAuth consent screen**
   - Add scopes:
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/calendar`
   - Save and continue

### 2. Update Supabase OAuth Settings

1. Go to **Supabase Dashboard** → **Authentication** → **Providers** → **Google**
2. Ensure your **Client ID** and **Client Secret** are set
3. The scopes are automatically included in the OAuth request

### 3. User Flow

1. User signs in with Google
2. Google shows consent screen with requested permissions:
   - View your email address
   - Send email on your behalf
   - Manage your calendars
3. User grants permissions
4. User can now send emails via `/email-mcp send_test_email`

## Testing

### Test Gmail Email Sending

```bash
/email-mcp send_test_email
```

Or in natural language:
```
send a test email
```

The system will:
1. Try to use Gmail API (if OAuth token available)
2. Fall back to Supabase email if Gmail isn't available

## Outlook Support ✅

### Microsoft OAuth Setup

1. **Register App in Azure Portal**: https://portal.azure.com/
2. **Add API Permissions**:
   - `Mail.Send` - Send emails
   - `Calendars.ReadWrite` - Calendar access
3. **Get Client ID and Secret**
4. **Add to Supabase**:
   - Go to **Authentication** → **Providers** → **Azure**
   - Add Client ID and Secret

### Implementation ✅

- Outlook OAuth provider support added
- `handleEmail` function supports `provider=outlook`
- Uses Microsoft Graph API: `https://graph.microsoft.com/v1.0/me/sendMail`
- See [OUTLOOK_ICLOUD_OAUTH_SETUP.md](./OUTLOOK_ICLOUD_OAUTH_SETUP.md) for detailed setup instructions

## Adding iCloud Support

### Apple OAuth Setup

1. **Register App in Apple Developer Portal**: https://developer.apple.com/
2. **Configure Services**:
   - Enable "Mail" service
   - Enable "Calendar" service
3. **Get Client ID and Secret**
4. **Note**: Apple OAuth requires additional setup (not directly supported by Supabase)

### Implementation Steps

1. May need custom OAuth flow (Apple doesn't support standard OAuth2)
2. Use iCloud Mail API (requires Apple Developer account)
3. Consider using IMAP/SMTP instead of OAuth for iCloud

## Current Status

1. **Gmail**: ✅ Fully working - Requires user to sign in with Google and grant Gmail permissions
2. **Outlook**: ✅ Fully working - Requires user to sign in with Microsoft/Azure and grant Mail.Send permissions
3. **iCloud**: ⏳ Infrastructure ready - See [OUTLOOK_ICLOUD_OAUTH_SETUP.md](./OUTLOOK_ICLOUD_OAUTH_SETUP.md) for details
4. **Calendar**: OAuth scope added but calendar features not yet implemented

## Troubleshooting

### "Failed to send email" Error

**Possible causes:**
1. User hasn't signed in with Google
2. User hasn't granted Gmail permissions
3. Gmail API not enabled in Google Cloud Console
4. OAuth scopes not configured in Google Cloud Console

**Solutions:**
1. Sign out and sign back in with Google
2. Grant all requested permissions
3. Enable Gmail API in Google Cloud Console
4. Verify OAuth consent screen has Gmail scope

### Email Goes to Spam

- Gmail API emails should have better deliverability
- Supabase magic link emails may go to spam
- Consider configuring SPF/DKIM records for your domain

## Next Steps

1. ✅ Gmail OAuth scopes added
2. ✅ Gmail API integration implemented
3. ✅ Outlook OAuth support added
4. ✅ Microsoft Graph API integration implemented
5. ⏳ Add iCloud support (or IMAP/SMTP)
6. ⏳ Implement Google Calendar features
7. ⏳ Implement Microsoft Calendar features
8. ⏳ Add email templates and rich content support

## Deployment

### Frontend Changes (Vercel)
- `src/hooks/useChat.ts` - Added OAuth scopes
- `src/lib/mcp/registry.ts` - Added email-mcp to registry

### Backend Changes (Supabase)
- `supabase/functions/mcp/index.ts` - Gmail API integration
- Already deployed ✅

### Required Actions
1. **Deploy frontend** (push to GitHub → Vercel auto-deploys)
2. **Enable Gmail API** in Google Cloud Console
3. **Configure OAuth consent screen** with Gmail scope
4. **Test** by signing in with Google and sending test email

