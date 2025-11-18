# Canva API `type` Field Issue - Research Document

## Problem Summary

When attempting to create a Canva design via the API, we consistently receive the error:
```
{"code":"invalid_field","message":"'type' must not be null."}
```

However, our request body clearly includes the `type` field with a non-null value.

## Current Request Body

```json
{
  "design_type": "social_post",
  "type": "social_post",
  "text": "Hello World"
}
```

## Error Details

- **API Endpoint**: `POST https://api.canva.com/rest/v1/designs`
- **HTTP Status**: 400 Bad Request
- **Error Code**: `invalid_field`
- **Error Message**: `'type' must not be null.`
- **Request Body Sent**: Includes `"type": "social_post"` (clearly not null)

## Attempted Solutions

### 1. Initial Implementation
- **Tried**: Setting `type` to match `design_type` value
- **Result**: Error persisted

### 2. Using "preset" Value
- **Tried**: Setting `type: "preset"` for preset design types
- **Request Body**:
  ```json
  {
    "design_type": "social_post",
    "type": "preset",
    "name": "social_post",
    "text": "Test"
  }
  ```
- **Result**: Same error - `'type' must not be null.`

### 3. Matching design_type Value
- **Tried**: Setting `type` to the same value as `design_type` (e.g., `"social_post"`)
- **Request Body**:
  ```json
  {
    "design_type": "social_post",
    "type": "social_post",
    "text": "Hello World"
  }
  ```
- **Result**: Same error persists

## Observations

1. **The field is clearly set**: The JSON request body shows `"type": "social_post"` is present and not null
2. **API still rejects it**: Despite the field being set, the API returns an error saying it's null
3. **Both fields present**: We're sending both `design_type` and `type` as required by the API error messages

## Possible Explanations

### 1. API Expects Different Field Structure
The API might expect:
- `type` at a different nesting level
- A different field name (e.g., `designType` vs `design_type`)
- `type` to be an object rather than a string
- `type` to be an enum value that doesn't match our string

### 2. JSON Serialization Issue
- The field might be getting stripped during serialization
- There could be a character encoding issue
- The API might be parsing the JSON incorrectly

### 3. API Documentation Mismatch
- The actual API might differ from the documented API
- The endpoint might require a different request format
- There might be version-specific requirements

### 4. Required Field Order or Structure
- The API might require fields in a specific order
- There might be a required wrapper object
- The API might expect a different root structure

### 5. Type Value Format Issue
- `type` might need to be an enum (e.g., `"PRESET"` instead of `"preset"`)
- The value might need to match a specific format (uppercase, camelCase, etc.)
- The API might expect a numeric ID instead of a string

## Research Questions

1. **What is the exact API specification for creating designs?**
   - Is there official OpenAPI/Swagger documentation?
   - What is the exact request body format?

2. **Are there working examples?**
   - Can we find curl examples in Canva's documentation?
   - Are there SDK examples (Python, JavaScript, etc.)?
   - Can we find community examples or GitHub repos?

3. **What are the valid values for `type`?**
   - Is it an enum? What are the allowed values?
   - Does it differ from `design_type`?
   - Is there a mapping between `design_type` and `type`?

4. **Is the endpoint correct?**
   - Is `POST /rest/v1/designs` the correct endpoint?
   - Are there version-specific endpoints?
   - Does the endpoint require additional path parameters?

5. **Are there required headers?**
   - Does the API require specific Content-Type headers?
   - Are there version headers needed?
   - Is there a required Accept header?

## Next Steps for Research

### 1. Review Official Canva API Documentation
- **URL**: https://www.canva.dev/docs/connect/api-reference/
- **Focus Areas**:
  - Design creation endpoint specification
  - Request body schema
  - Field requirements and formats
  - Example requests/responses

### 2. Check Canva API Examples
- Look for official SDK examples
- Search for community implementations
- Check GitHub for Canva API integrations

### 3. Test with Different Request Formats
- Try sending `type` as an object: `{"type": {"value": "social_post"}}`
- Try uppercase values: `"type": "SOCIAL_POST"`
- Try camelCase: `"type": "socialPost"`
- Try without `design_type` (only `type`)
- Try with only `design_type` (no `type`)

### 4. Inspect Network Requests
- Use browser DevTools or Postman to inspect actual API calls
- Compare our request with working examples
- Check for any differences in headers or structure

### 5. Contact Canva Support
- Reach out to Canva Developer Support
- Provide the exact error and request body
- Ask for clarification on the `type` field requirement

## Code Location

The implementation is in:
- **File**: `supabase/functions/mcp/index.ts`
- **Function**: `handleCanva`
- **Command**: `create_design`
- **Lines**: ~1420-1520

## Current Implementation Details

```typescript
// Current request body construction
const requestBody: Record<string, unknown> = {};

// Map template to design type
const designTypeValue = designTypes[normalizedTemplate] || "social_post";

// Set both fields
requestBody.design_type = designTypeValue;
requestBody.type = designTypeValue;

// Add optional fields
if (text) requestBody.text = text;
if (args.brand_id) requestBody.brand_id = args.brand_id;
if (args.width && args.height) {
  requestBody.width = parseInt(args.width, 10);
  requestBody.height = parseInt(args.height, 10);
}
```

## API Endpoint Details

- **Method**: POST
- **URL**: `https://api.canva.com/rest/v1/designs`
- **Headers**:
  - `Authorization: Bearer {access_token}`
  - `Content-Type: application/json`
- **Authentication**: OAuth2 Bearer Token
- **Scopes**: `design:content:write`, `design:meta:read`, `design:content:read`, `design:permission:write`, `design:permission:read`

## Related Documentation Files

- `docs/CANVA_SETUP.md` - Initial Canva API setup
- `docs/CANVA_OAUTH_SETUP.md` - OAuth2 setup instructions
- `docs/CANVA_TOKEN_UPDATED.md` - Token management
- `docs/CANVA_API_TROUBLESHOOTING.md` - Previous troubleshooting steps
- `docs/CANVA_PKCE_FLOW.md` - PKCE OAuth flow details

## References

- **Canva Connect API Docs**: https://www.canva.dev/docs/connect/api-reference/
- **Canva Authentication**: https://www.canva.dev/docs/apps/authenticating-users/oauth/
- **Canva API Postman Collection**: https://www.postman.com/canva-developers/canva-developers/documentation

## SOLUTION FOUND

After researching the official Canva API documentation, we found the issue:

### The Problem
We were sending `design_type` as a **string**, but the API expects it to be an **object**.

### Correct Request Structure

According to the [Canva API Documentation](https://www.canva.dev/docs/connect/api-reference/designs/create-design/), when creating a design with a preset type, the request body should be:

```json
{
  "design_type": {
    "type": "preset",
    "name": "social_post"
  },
  "title": "My Social Post"
}
```

### Key Points:
1. **`design_type` is an object**, not a string
2. The object contains:
   - `type`: Must be `"preset"` for preset design types
   - `name`: The specific design type (e.g., `"social_post"`, `"presentation"`, etc.)
3. **No top-level `type` field** - the `type` is nested inside `design_type`

### Why Our Previous Attempts Failed

We were sending:
```json
{
  "design_type": "social_post",  // ❌ String, not object
  "type": "social_post"          // ❌ Wrong location
}
```

The API was looking for `design_type.type`, which didn't exist because `design_type` was a string, not an object. This is why it reported `type` as null.

## Conclusion

The issue was a misunderstanding of the API structure. The `design_type` field must be an object with `type` and `name` properties, not a flat string value. This has been fixed in the implementation.

## UPDATE: Valid Preset Names

After fixing the structure, we discovered that the Canva API only accepts **three preset names**:
- `doc`
- `whiteboard`
- `presentation`

The API rejected `social_post` with the error:
```
{"code":"invalid_field","message":"'name' must be one of the following: doc, whiteboard, presentation, but was social_post."}
```

### Solution
We now map user-friendly template names to valid preset names:
- `social_post`, `post`, `poster`, `flyer`, `story`, `video` → `presentation`
- `doc`, `document` → `doc`
- `whiteboard`, `board` → `whiteboard`

The default preset is `presentation` if an unrecognized template name is provided.

## ✅ RESOLVED

The Canva design creation is now working successfully! 

### Successful Request Example

**Command:**
```
/canva-mcp create_design text="Hello World"
```

**Request Body:**
```json
{
  "design_type": {
    "type": "preset",
    "name": "presentation"
  },
  "title": "Hello World"
}
```

**Response:**
```json
{
  "template": "social_post",
  "design": {
    "id": "DAG5BJfZ6A4",
    "title": "Hello World",
    "owner": {
      "user_id": "oUXqG0Aw-HGnL97OYJiYrk",
      "team_id": "oBXqGfGq69E2Nz0jPpJlJA"
    },
    "urls": {
      "edit_url": "https://www.canva.com/api/design/.../edit?...",
      "view_url": "https://www.canva.com/api/design/.../view?..."
    },
    "created_at": 1763440522,
    "updated_at": 1763440522,
    "page_count": 1
  }
}
```

### Key Takeaways

1. ✅ `design_type` must be an object with `type: "preset"` and `name` (one of: `doc`, `whiteboard`, `presentation`)
2. ✅ User-friendly template names are mapped to valid preset names
3. ✅ Default template is `presentation` if none specified
4. ✅ The API returns design ID, edit/view URLs, and metadata

### Usage

- **Create with default (presentation):** `/canva-mcp create_design text="My Design"`
- **Create document:** `/canva-mcp create_design template=doc text="My Document"`
- **Create whiteboard:** `/canva-mcp create_design template=whiteboard text="My Board"`
- **Create presentation:** `/canva-mcp create_design template=presentation text="My Presentation"`

