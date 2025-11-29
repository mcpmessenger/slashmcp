# Email Authentication Setup Guide

## Issue: "No email came through"

If you're not receiving emails from Supabase (verification, password reset, etc.), here's how to fix it:

## 1. Configure Supabase Email Provider

Supabase uses its default email service, but you can configure a custom SMTP provider for better deliverability.

### Option A: Use Supabase Default Email (Quick Setup)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Ensure **Email** provider is enabled
5. Go to **Authentication** → **Email Templates**
6. Customize templates if needed (verification, password reset, etc.)

**Note:** Supabase's default email service has rate limits and may go to spam. For production, use a custom SMTP provider.

### Option B: Configure Custom SMTP (Recommended for Production)

1. Go to **Project Settings** → **Auth** → **SMTP Settings**
2. Enable **Custom SMTP**
3. Configure your SMTP provider:

#### Using Gmail SMTP:
```
Host: smtp.gmail.com
Port: 587
Username: your-email@gmail.com
Password: [App Password - see below]
Sender email: your-email@gmail.com
Sender name: MCP Messenger
```

**To get Gmail App Password:**
1. Enable 2-Step Verification on your Google Account
2. Go to [Google Account Settings](https://myaccount.google.com/apppasswords)
3. Generate an App Password for "Mail"
4. Use this 16-character password in Supabase SMTP settings

#### Using SendGrid:
```
Host: smtp.sendgrid.net
Port: 587
Username: apikey
Password: [Your SendGrid API Key]
Sender email: your-verified-sender@yourdomain.com
Sender name: MCP Messenger
```

#### Using AWS SES:
```
Host: email-smtp.[region].amazonaws.com
Port: 587
Username: [Your AWS SES SMTP Username]
Password: [Your AWS SES SMTP Password]
Sender email: your-verified-email@yourdomain.com
Sender name: MCP Messenger
```

## 2. Enable Email/Password Authentication

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Click on **Email**
3. Ensure **Enable Email provider** is toggled ON
4. Configure settings:
   - **Enable email confirmations**: Toggle ON if you want users to verify their email
   - **Secure email change**: Toggle ON for security
   - **Double confirm email changes**: Recommended for production

## 3. Configure Email Templates

1. Go to **Authentication** → **Email Templates**
2. Customize templates:
   - **Confirm signup**: Email sent when user signs up
   - **Magic Link**: Passwordless login email
   - **Change Email Address**: Email sent when changing email
   - **Reset Password**: Password reset email
   - **Invite user**: Team invitation email

3. Test email delivery:
   - Use the **Send test email** button
   - Check your spam folder if emails don't arrive

## 4. Configure Site URL and Redirect URLs

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your production domain:
   - `https://your-app.vercel.app` (or your domain)
3. Add **Redirect URLs**:
   - `https://your-app.vercel.app/**`
   - `http://localhost:5173/**` (for local development)

## 5. Add Sign-Up Functionality (If Missing)

Currently, the app only supports:
- Google OAuth sign-in (primary method)
- Email/password sign-in via `/slashmcp login email=... password=...`

To add email/password sign-up, you would need to:

1. Create a sign-up form component
2. Use `supabaseClient.auth.signUp()` method
3. Handle email verification flow

Example sign-up code:
```typescript
const { data, error } = await supabaseClient.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password',
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`
  }
});
```

## 6. Troubleshooting

### Emails not arriving?

1. **Check spam folder** - Supabase default emails often go to spam
2. **Verify SMTP settings** - Test connection in Supabase dashboard
3. **Check rate limits** - Supabase free tier has email rate limits
4. **Verify sender email** - Must be verified in your SMTP provider
5. **Check Supabase logs** - Go to **Logs** → **Auth Logs** to see email delivery status

### "Email already registered" error?

- User already exists - use password reset instead
- Or sign in with existing credentials

### Password reset not working?

1. Ensure **Email** provider is enabled
2. Check **Reset Password** email template is configured
3. Verify redirect URL is set correctly
4. Check Supabase logs for errors

## 7. Testing Email Delivery

1. Use Supabase Dashboard → **Authentication** → **Email Templates** → **Send test email**
2. Try signing up a new user (if sign-up is implemented)
3. Try password reset flow
4. Check Supabase logs: **Logs** → **Auth Logs**

## 8. Production Recommendations

1. **Use custom SMTP** (SendGrid, AWS SES, or similar) for better deliverability
2. **Set up SPF/DKIM records** for your domain
3. **Monitor email delivery rates** in your SMTP provider dashboard
4. **Implement rate limiting** to prevent abuse
5. **Use email verification** for new sign-ups
6. **Set up email monitoring/alerts** for failed deliveries

## Current App Status

The MCP Messenger app currently:
- ✅ Supports Google OAuth sign-in (primary method)
- ✅ Supports email/password sign-in via command: `/slashmcp login email=... password=...`
- ❌ Does NOT have a UI sign-up form (users must be created via Supabase Dashboard or API)
- ❌ Does NOT have password reset UI (must use Supabase Dashboard or API)

To add these features, you would need to create additional UI components and integrate with Supabase auth methods.

