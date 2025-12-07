# Facebook Marketplace Scraping

## Overview

Facebook Marketplace scraping support has been added to the playwright-wrapper, but there are important limitations to be aware of.

## Important Limitations

⚠️ **Facebook does NOT provide a public API for Marketplace access.**

### Technical Challenges:

1. **Authentication Required**: Facebook Marketplace requires users to be logged in to view listings
2. **JavaScript-Heavy**: Content is dynamically loaded via JavaScript, which our HTTP-based scraping cannot execute
3. **Terms of Service**: Facebook's ToS prohibits automated scraping without permission
4. **Rate Limiting**: Facebook may block or limit automated requests

## Current Implementation

The `browser_extract_text` command now includes Facebook Marketplace parsing support.

### How It Works:

1. Attempts to extract listing data from HTML structure
2. Looks for marketplace item URLs (`/marketplace/item/...`)
3. Tries to parse JSON-LD structured data if available
4. Extracts title, price, location, and URLs from available HTML

### Usage:

```
/playwright-wrapper browser_extract_text url=https://www.facebook.com/marketplace/desmoines/search/?query=shuttle%20bus
```

**Note:** This will likely return limited or no results because:
- Facebook requires login (you'll see a login page)
- Content is loaded via JavaScript after page load
- HTTP-based scraping cannot execute JavaScript

## Better Alternatives

### Option 1: Use a Headless Browser Service

For real Facebook Marketplace scraping, you need:
- A headless browser service (Browserless.io, ScrapingBee, etc.)
- Facebook account authentication
- JavaScript execution capability

**Example with Browser Service:**
```typescript
// This would require a real browser service
const browserServiceUrl = "https://your-browser-service.com";
// Configure BROWSER_SERVICE_URL environment variable
```

### Option 2: Use Browser Extensions

For personal use, browser extensions can help:
- **FB Marketplace Scraper** (Chrome extension)
- **Facebook Marketplace Scraper** (Chrome extension)

These work in your browser where you're already logged in.

### Option 3: Use Third-Party Services

Services like Apify offer Facebook Marketplace scrapers:
- [Apify Facebook Marketplace Scraper](https://apify.com/apify/facebook-marketplace-scraper)
- Pay-per-result pricing model

## Recommended Approach for Shuttle Bus Search

Since Facebook Marketplace scraping is limited, here's a better strategy:

### 1. Use Craigslist (Works Well)
```
/playwright-wrapper browser_extract_text url=https://desmoines.craigslist.org/search/cta?query=shuttle+bus
```

### 2. Try Facebook Marketplace Manually
- Open Facebook Marketplace in your browser (while logged in)
- Search for "shuttle bus" in Des Moines, IA
- Copy the URL and try:
```
/playwright-wrapper browser_extract_text url=[paste-the-url-here]
```
(May work if you're logged in and the page has server-rendered content)

### 3. Combine Multiple Sources
- Craigslist (✅ Works)
- Facebook Marketplace (⚠️ Limited)
- OfferUp (✅ Can try)
- eBay (✅ Works)

## Example: Multi-Source Search

```bash
# Craigslist
/playwright-wrapper browser_extract_text url=https://desmoines.craigslist.org/search/cta?query=shuttle+bus

# OfferUp
/playwright-wrapper browser_extract_text url=https://offerup.com/search?q=shuttle+bus&location=Des+Moines+IA

# eBay
/playwright-wrapper browser_extract_text url=https://www.ebay.com/sch/i.html?_nkw=shuttle+bus&_sop=15&_nkw=shuttle+bus&_from=R40&_trksid=p2334524.m570.l1313
```

## Future Enhancements

To make Facebook Marketplace scraping work better, we would need:

1. **Real Browser Service Integration**
   - Deploy a headless browser service
   - Handle authentication cookies/sessions
   - Execute JavaScript

2. **OAuth Integration**
   - Allow users to authenticate with Facebook
   - Store session tokens securely
   - Use authenticated sessions for scraping

3. **Respect Rate Limits**
   - Implement delays between requests
   - Handle CAPTCHAs if they appear
   - Monitor for blocks

## Legal Considerations

⚠️ **Important**: Always respect:
- Facebook's Terms of Service
- Rate limits
- Privacy of sellers
- Local laws regarding web scraping

For commercial use, consider:
- Contacting Facebook for API access
- Using official partnerships
- Obtaining proper permissions

## Summary

- ✅ **Parser Added**: Facebook Marketplace parsing is implemented
- ⚠️ **Limited Functionality**: HTTP-based scraping won't work well due to login/JS requirements
- 💡 **Recommendation**: Use Craigslist for reliable results, or set up a real browser service for Facebook
