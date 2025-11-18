# Canva API Endpoint Issue

## Problem

The access token is being rejected with 401, even though:
- ✅ Token was just obtained through OAuth2
- ✅ Token includes all required scopes
- ✅ Token format appears correct (JWT)

## Possible Causes

1. **Wrong API Endpoint**: The endpoint `https://api.canva.com/rest/v1/designs` might not be correct
2. **Wrong Request Format**: The request body format might be incorrect
3. **Missing Headers**: Additional headers might be required
4. **API Version**: The API version or base URL might be different

## Next Steps

1. **Check Canva API Documentation**: 
   - Visit: https://www.canva.dev/docs/connect/api-reference/
   - Find the correct endpoint for creating designs
   - Verify the request format

2. **Test Token with Simple Endpoint**:
   Try calling a simpler endpoint first to verify the token works:
   ```bash
   curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     https://api.canva.com/rest/v1/me
   ```

3. **Check API Endpoint Format**:
   The endpoint might be:
   - `/rest/v1/designs` (current)
   - `/v1/designs`
   - `/designs/create`
   - `/designs/new`
   - Or require a different base URL

4. **Verify Request Body**:
   The request might need:
   - `template_id` instead of `template`
   - Different parameter names
   - Form data instead of JSON
   - Additional required fields

## Current Implementation

The code now:
- ✅ Verifies token with `/rest/v1/me` endpoint first
- ✅ Tries both `template` and `template_id` in request body
- ✅ Includes proper error handling

## References

- [Canva Connect API Reference](https://www.canva.dev/docs/connect/api-reference/)
- [Canva API Authentication](https://www.canva.dev/docs/connect/api-reference/authentication/)

