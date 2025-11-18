# Canva API Endpoint Research

## Current Issue

✅ **Token is VALID** - No more 401 errors!  
❌ **Endpoint doesn't exist** - `GET /rest/v1/designs` returns "endpoint_not_found"

## What We Know

According to Canva API documentation:
- ✅ `GET /rest/v1/designs` - Lists designs (exists)
- ✅ `GET /rest/v1/designs/{designId}` - Gets specific design (exists)
- ❓ `POST /rest/v1/designs` - Creates design (unknown if exists)

## Possible Scenarios

1. **Design Creation Not Supported**: Canva API might not support creating designs directly via API
2. **Different Endpoint**: Design creation might use a different endpoint:
   - `/rest/v1/designs/create`
   - `/rest/v1/designs/new`
   - `/rest/v1/templates/{templateId}/create`
   - `/rest/v1/brands/{brandId}/designs`
3. **Different Method**: Might require a different HTTP method or format
4. **Template-Based**: Designs might need to be created from templates using a different flow

## Next Steps

1. **Check Canva API Documentation**: 
   - Visit: https://www.canva.dev/docs/connect/api-reference/
   - Look for "Create Design" or "Design Creation" endpoints
   
2. **Test Alternative Endpoints**:
   - Try `POST /rest/v1/designs` (we're already doing this)
   - Try `POST /rest/v1/templates/{templateId}/designs`
   - Try `POST /rest/v1/brands/{brandId}/designs`

3. **Check if Design Creation is Supported**:
   - Canva API might only support reading/updating designs, not creating them
   - Designs might need to be created through the Canva UI, then accessed via API

## Current Implementation

The code uses `POST /rest/v1/designs` which should be correct for REST APIs, but if Canva doesn't support design creation via API, we'll need to find an alternative approach.

## References

- [Canva API Reference](https://www.canva.dev/docs/connect/api-reference/)
- [Canva Designs API](https://www.canva.dev/docs/connect/api-reference/designs/)

