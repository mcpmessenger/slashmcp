# Check Scraping Logs - Debug Empty Results

## Issue
Reselling analysis completes but returns empty summary and no data.

## Check Supabase Function Logs

1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/reselling-analysis/logs

2. Look for these log messages:
   - `[reselling-analysis] Starting analysis: query="...", location="..."`
   - `[reselling-analysis] Scraping craigslist for "..." in ...`
   - `[scrapeListings] Attempting playwright-wrapper at: ...`
   - `[scrapeListings] Playwright extracted X listings from ...`
   - `[reselling-analysis] Found X listings from ...`
   - `[reselling-analysis] Analysis complete: X listings, Y opportunities`

## What to Look For

### If you see "Found 0 listings":
- Scraping is failing
- Check if playwright-wrapper is deployed and working
- Check if URLs are being constructed correctly

### If you see listings but 0 opportunities:
- Listings are being found but filtered out
- Check the `analyzeResellingOpportunities` logic
- All listings might be priced too high

### If you see errors:
- Note the error message
- Check if `PROJECT_URL` is set in Supabase secrets
- Check if `OPENAI_API_KEY` is set (for AI summary)

## Quick Test

Try this in browser console after running the scraping prompt:

```javascript
// Check what the orchestrator received
// Look in Network tab for the reselling-analysis request
// Check the response body
```

## Common Issues

1. **playwright-wrapper not deployed** - Deploy it: `npx supabase functions deploy playwright-wrapper --project-ref akxdroedpsvmckvqvggr`

2. **PROJECT_URL not set** - Set it in Supabase secrets: `npx supabase secrets set --project-ref akxdroedpsvmckvqvggr PROJECT_URL=https://akxdroedpsvmckvqvggr.supabase.co`

3. **Scraping blocked** - Websites may block automated access, need to use playwright-wrapper

