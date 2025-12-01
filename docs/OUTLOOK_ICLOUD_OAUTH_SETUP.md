# Outlook and iCloud OAuth Setup

## Overview

The email system now supports multiple OAuth providers:
- ✅ **Gmail** (Google) - Fully implemented
- ✅ **Outlook** (Microsoft/Azure) - Implemented
- ⏳ **iCloud** - Infrastructure ready (requires Apple Developer setup)

## Microsoft/Outlook OAuth Setup

### 1. Configure Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: Your app name (e.g., "SlashMCP")
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: 
     - Type: Web
     - URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
5. Click **Register**

### 2. Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Delegated permissions**
5. Add these permissions:
   - `Mail.Send` - Send mail as the user
   - `Calendars.ReadWrite` - Read and write calendars
   - `User.Read` - Read user profile
   - `email` - View user's email address
   - `openid` - Sign users in
   - `profile` - View users' basic profile
6. Click **Add permissions**
7. Click **Grant admin consent** (if you have admin rights)

### 3. Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add description and expiration
4. Click **Add**
5. **Copy the secret value immediately** (you won't see it again)

### 4. Configure Supabase

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Authentication** → **Providers**
3. Find **Azure** (or **Microsoft**)
4. Enable the provider
5. Add:
   - **Client ID**: From Azure app registration (Application ID)
   - **Client Secret**: The secret you just created
6. Save

### 5. Update Redirect URIs in Azure

1. Go back to Azure Portal → Your app registration
2. Go to **Authentication**
3. Under **Redirect URIs**, add:
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. Save

## Using Outlook Email

### Sign In with Microsoft

Users can now sign in with Microsoft to use Outlook email:

```typescript
// In the app, users can sign in with Microsoft
signInWithMicrosoft()
```

### Send Email via Outlook

```javascript
// Via chat
"Send me an email via Outlook"

// Or specify provider
"/email-mcp send_test_email provider=outlook subject='Hello' body='Test email'"
```

## iCloud OAuth (Future Implementation)

### Current Status

iCloud email sending is not yet fully implemented because:

1. **Apple doesn't provide standard OAuth2** for email sending
2. **iCloud Mail API** requires:
   - Apple Developer account
   - Special app registration
   - Different authentication flow

### Implementation Options

#### Option 1: IMAP/SMTP with App-Specific Passwords

Users can:
1. Enable 2FA on their Apple ID
2. Generate an app-specific password
3. Use IMAP/SMTP to send emails

**Pros:**
- Works immediately
- No special API setup needed

**Cons:**
- Requires user to manually set up
- Less secure than OAuth
- App-specific passwords are long and hard to manage

#### Option 2: Apple Mail API (Future)

If Apple releases a Mail API:
1. Register app in Apple Developer Portal
2. Configure OAuth (if available)
3. Use API to send emails

### Current Implementation

The email handler recognizes `provider=icloud` but returns an informative error:

```javascript
// This will return an error explaining iCloud isn't fully implemented yet
"/email-mcp send_test_email provider=icloud"
```

## Testing

### Test Outlook Email

1. Sign in with Microsoft/Azure OAuth
2. Grant Mail.Send permissions
3. Send test email:
   ```
   Send me an email via Outlook
   ```

### Verify Token Storage

Check Supabase logs to verify tokens are stored:
- Look for "Stored OAuth token from request body for azure"
- Check `user.app_metadata.oauth_tokens.azure`

## Troubleshooting

### "Outlook OAuth tokens not available"

**Causes:**
1. User hasn't signed in with Microsoft
2. Mail.Send permission not granted
3. Azure app not configured correctly

**Solutions:**
1. Sign out and sign back in with Microsoft
2. Grant all requested permissions
3. Verify Azure app registration has Mail.Send permission
4. Check Supabase Azure provider configuration

### "Microsoft Graph API failed"

**Causes:**
1. Token expired
2. Insufficient permissions
3. API not enabled

**Solutions:**
1. Sign out and sign back in
2. Verify Mail.Send permission is granted
3. Check Azure app registration permissions

## Files Modified

1. `src/hooks/useChat.ts` - Added `signInWithMicrosoft()` function
2. `supabase/functions/capture-oauth-tokens/index.ts` - Supports Azure provider
3. `supabase/functions/mcp/index.ts` - Added Outlook email sending via Microsoft Graph API
4. `supabase/functions/_shared/oauth.ts` - Supports "azure" provider token retrieval

## Next Steps

- ✅ Gmail OAuth working
- ✅ Outlook OAuth implemented
- ⏳ iCloud - Waiting for Apple Mail API or implementing IMAP/SMTP fallback
- ⏳ Token refresh for expired tokens
- ⏳ Calendar integration for both Google and Microsoft

