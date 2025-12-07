# Improved Browser Results Formatting

## Overview

Enhanced the browser automation results to display in plain English with better formatting, especially for Craigslist searches.

## Changes Made

### 1. Added `browser_extract_text` Command

**Location:** `supabase/functions/playwright-wrapper/index.ts`

- Extracts text content from web pages
- **Special handling for Craigslist:** Automatically parses search results into structured listings
- Returns formatted data with title, price, location, and URL for each listing

**Usage:**
```
/playwright-wrapper browser_extract_text url=https://chicago.craigslist.org/search/cta?query=shuttle+bus
```

### 2. Craigslist Listing Parser

**New Functions:**
- `parseCraigslistListings()` - Extracts structured listing data from Craigslist HTML
- `extractPlainText()` - Converts HTML to readable plain text

**Features:**
- Extracts title, price, location, URL, and date from listings
- Handles multiple Craigslist HTML formats
- Limits results to 50 listings for performance

### 3. Improved Result Formatting

**Location:** `src/hooks/useChat.ts` - `formatMcpResult()` function

**Improvements:**
- **Craigslist Listings:** Displays as numbered list with:
  - Title (bold)
  - Price (if available)
  - Location (if available)
  - Clickable URL
- **Browser Navigation:** Shows user-friendly status messages instead of raw JSON
- **Helpful Tips:** Suggests search URLs when navigating to Craigslist homepage

## Example Output

### Before (Raw JSON):
```json
{
  "url": "https://chicago.craigslist.org/search/cta?query=shuttle+bus",
  "status": 200,
  "pageInfo": {
    "title": "...",
    "links": [...]
  }
}
```

### After (Formatted):
```
Found 15 listings

1. **2015 Ford E-350 Shuttle Bus** - **$12,500** (Chicago, IL)
   🔗 https://chicago.craigslist.org/cta/d/...

2. **2018 Chevy Express Shuttle** - **$18,000** (Naperville, IL)
   🔗 https://chicago.craigslist.org/cta/d/...
```

## How to Use for Shuttle Bus Search

### Step 1: Navigate to Craigslist Search
```
/playwright-wrapper browser_navigate url=https://chicago.craigslist.org/search/cta?query=shuttle+bus
```

### Step 2: Extract Listings
```
/playwright-wrapper browser_extract_text url=https://chicago.craigslist.org/search/cta?query=shuttle+bus
```

The results will be automatically formatted in plain English with all the key details.

## Supported Cities

For Midwest searches, use these Craigslist URLs:
- Chicago: `https://chicago.craigslist.org/search/cta?query=shuttle+bus`
- Detroit: `https://detroit.craigslist.org/search/cta?query=shuttle+bus`
- Milwaukee: `https://milwaukee.craigslist.org/search/cta?query=shuttle+bus`
- Minneapolis: `https://minneapolis.craigslist.org/search/cta?query=shuttle+bus`
- Indianapolis: `https://indianapolis.craigslist.org/search/cta?query=shuttle+bus`

## Technical Details

- **HTML Parsing:** Uses regex patterns to extract listing data (works with HTTP-based fetching)
- **Fallback:** If structured parsing fails, returns plain text extraction
- **Performance:** Limits to 50 listings and 10,000 characters of text
- **Error Handling:** Gracefully handles invalid URLs and parsing errors

## Future Enhancements

- Support for other marketplaces (eBay, OfferUp, Facebook Marketplace)
- Price comparison across multiple sources
- Filtering and sorting options
- Image extraction from listings
