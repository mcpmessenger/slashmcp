# Canva Client Secret Mismatch

## Issue

The client secret we have doesn't match the Client ID `OC-AZqU_faZd5bf`.

**Error**: `{"code":"invalid_client","message":"Client secret is invalid for OC-AZqU_faZd5bf"}`

## Current Configuration

- **Client ID**: `OC-AZqU_faZd5bf` ✅
- **Client Secret**: `YOUR_CLIENT_SECRET` ❌ (doesn't match - needs to be updated)

## Solution

You need to provide the **correct Client Secret** that matches `OC-AZqU_faZd5bf`.

### How to Find It

1. Go to Canva Developer Portal: https://www.canva.com/developers/
2. Navigate to "Your integrations"
3. Find the integration with Client ID `OC-AZqU_faZd5bf`
4. Go to "Credentials" section
5. Copy the Client Secret

**Note**: If you've already generated a new secret, the old one won't work. You'll need to use the current secret shown in the portal.

## Once You Have the Correct Secret

Share it and I'll:
1. Update the client secret in Supabase secrets
2. Use it to refresh the access token
3. Set the new access token

## Alternative

If you have a fresh access token from the OAuth flow, you can provide that directly instead.

