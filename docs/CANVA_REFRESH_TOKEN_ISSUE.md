# Canva Refresh Token Issue

## Problem

The refresh token request is returning 400 Bad Request.

## Possible Causes

1. **Refresh Token Format**: The token might not be a valid refresh token
2. **Token Already Used**: Refresh tokens can only be used once
3. **Request Format**: The request body format might be incorrect
4. **Token Expired**: Refresh tokens can also expire

## Solution

You'll need to get a new access token through the OAuth2 flow:

1. **Authorize again** using the authorization URL
2. **Get a new authorization code**
3. **Exchange for new tokens** (both access and refresh)
4. **Set both tokens** as Supabase secrets

## Current Status

- ✅ Refresh Token: Set (but may be invalid/expired)
- ❌ Access Token: Expired
- ⏳ Need: New access token via OAuth flow

## Next Steps

Go through the OAuth authorization flow again to get fresh tokens.

