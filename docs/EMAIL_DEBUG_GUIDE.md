# Email Debugging Guide

## Issue: "Email sending requires Gmail OAuth setup" despite being logged in

If you're seeing this error even though you're logged in, here's how to diagnose and fix it:

## Step 1: Verify You're Signed In with Google OAuth

**Important:** You must sign in with **Google OAuth** (not email/password) to send emails.

1. **Check your current sign-in method:**
   - Look at the top right corner of the app
   - If you see your email/name, you're logged in
   - But you need to verify you signed in with **Google**, not email/password

2. **Sign out and sign back in with Google:**
   - Click your profile/name in the top right
   - Click "Sign out"
   - Click "Sign in with Google"
   - **Important:** When Google asks for permissions, make sure you grant **Gmail** permissions
   - You should see a permission request like "SlashMCP wants to send emails on your behalf"

## Step 2: Check Supabase Edge Function Logs

The logs will now show detailed information about OAuth token retrieval:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `akxdroedpsvmckvqvggr`
3. Navigate to **Edge Functions** → **mcp** → **Logs**
4. Look for messages like:
   - `"OAuth token retrieval:"` - Shows if token was found
   - `"No auth header provided"` - Means you're not logged in
   - `"Gmail API failed:"` - Shows the specific error

## Step 3: Verify Gmail API is Enabled

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create one if needed)
3. Navigate to **APIs & Services** → **Library**
4. Search for "Gmail API"
5. Make sure it's **Enabled**

## Step 4: Check OAuth Consent Screen

1. In Google Cloud Console, go to **APIs & Services** → **OAuth consent screen**
2. Make sure your app is configured
3. Under **Scopes**, verify that `https://www.googleapis.com/auth/gmail.send` is listed
4. If not, add it:
   - Click "Add or Remove Scopes"
   - Search for "Gmail API"
   - Add `https://www.googleapis.com/auth/gmail.send`
   - Save

## Step 5: Re-authenticate

After making changes:

1. **Sign out completely** from the app
2. **Sign out from Google** (optional, but recommended)
3. **Sign back in** with Google OAuth
4. **Grant all permissions** when prompted
5. Try sending an email again

## Common Issues

### Issue: "No auth header provided"
**Solution:** You're not logged in. Sign in with Google OAuth.

### Issue: "hasToken: false" in logs
**Solution:** Supabase isn't storing the OAuth token. This can happen if:
- You signed in with email/password instead of Google
- The OAuth flow didn't complete properly
- Try signing out and signing back in with Google

### Issue: "Gmail API failed: 401 Unauthorized"
**Solution:** 
- Your OAuth token has expired
- You didn't grant Gmail permissions
- Sign out and sign back in, making sure to grant Gmail permissions

### Issue: "Gmail API failed: 403 Forbidden"
**Solution:**
- Gmail API is not enabled in Google Cloud Console
- The OAuth consent screen isn't configured properly
- Follow Steps 3 and 4 above

## Alternative: Use Supabase SMTP (No OAuth Required)

If Gmail OAuth continues to be problematic, you can configure SMTP in Supabase:

1. Go to **Project Settings** → **Auth** → **SMTP Settings**
2. Enable **Custom SMTP**
3. Configure with your email provider (Gmail, SendGrid, etc.)
4. The email handler will automatically use SMTP if Gmail API fails

**Note:** This requires setting up SMTP credentials, but doesn't require OAuth.

## Still Not Working?

Share the logs from Supabase Edge Functions (Step 2) and we can diagnose further.

