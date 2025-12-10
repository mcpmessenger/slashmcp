import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

interface Invocation {
  command?: string;
  args?: Record<string, string>;
  positionalArgs?: string[];
}

interface Listing {
  title: string;
  price: number;
  url: string;
  location?: string;
  condition?: string;
}

interface MarketData {
  ebayUsedRange: { min: number; max: number } | null;
  amazonNewPrice: number | null;
  productName: string;
}

interface Opportunity {
  listing: Listing;
  marketData: MarketData;
  potentialProfit: number;
  profitMargin: number;
  isStrongOpportunity: boolean;
}

type AnalysisResult =
  | {
      type: "text" | "markdown";
      content: string;
    }
  | {
      type: "json";
      data: unknown;
      summary?: string;
    }
  | {
      type: "error";
      message: string;
      details?: unknown;
    };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// MCP Gateway URL for calling other MCP tools
const MCP_GATEWAY_URL = Deno.env.get("MCP_GATEWAY_URL") || "";

/**
 * Scrape listings from Craigslist or OfferUp
 */
async function scrapeListings(
  source: "craigslist" | "offerup",
  location: string,
  query: string,
): Promise<Listing[]> {
  const listings: Listing[] = [];

  try {
    let url = "";
    if (source === "craigslist") {
      // Format: https://[city].craigslist.org/search/ela?query=[query]
      const cityCode = location.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "");
      url = `https://${cityCode}.craigslist.org/search/ela?query=${encodeURIComponent(query)}`;
    } else if (source === "offerup") {
      // Format: https://www.offerup.com/search?q=[query]&lat=[lat]&lon=[lon]
      // For simplicity, we'll use a general search
      url = `https://www.offerup.com/search?q=${encodeURIComponent(query)}`;
    }

    // Use playwright-wrapper if available, otherwise fallback to HTTP fetch
    // Try to get PROJECT_URL first, then fallback to MCP_GATEWAY_URL
    const PROJECT_URL = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL") || "";
    const FUNCTIONS_BASE = PROJECT_URL ? `${PROJECT_URL.replace(/\/+$/, "")}/functions/v1` : "";
    
    if (FUNCTIONS_BASE) {
      try {
        // Construct the playwright-wrapper URL using Supabase functions
        const playwrightUrl = `${FUNCTIONS_BASE}/playwright-wrapper`;
        console.log(`[scrapeListings] Attempting playwright-wrapper at: ${playwrightUrl}`);
        
        const response = await fetch(playwrightUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
            apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
          },
          body: JSON.stringify({
            command: "browser_extract_text",
            args: { url },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          // Parse the extracted text for listings
          const text = typeof result === "string" ? result : JSON.stringify(result);
          const parsed = parseListingsFromText(text, source, url);
          console.log(`[scrapeListings] Playwright extracted ${parsed.length} listings from ${source}`);
          listings.push(...parsed);
        } else {
          const errorText = await response.text().catch(() => "");
          console.warn(`[scrapeListings] Playwright-wrapper returned ${response.status}: ${errorText.slice(0, 200)}`);
        }
      } catch (error) {
        console.warn(`[scrapeListings] Failed to use playwright-wrapper, falling back to HTTP:`, error);
      }
    }

    // Fallback to direct HTTP fetch
    if (listings.length === 0) {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const html = await response.text();
      listings.push(...parseListingsFromHTML(html, source, url));
    }
  } catch (error) {
    console.error(`Error scraping ${source}:`, error);
  }

  return listings;
}

/**
 * Parse listings from HTML content - Improved parsing logic
 */
function parseListingsFromHTML(html: string, source: string, baseUrl: string): Listing[] {
  const listings: Listing[] = [];

  if (source === "craigslist") {
    // Improved Craigslist parsing - try multiple patterns
    const listingPatterns = [
      /<li[^>]*class="[^"]*cl-search-result[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
      /<li[^>]*class="[^"]*result-row[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
    ];

    for (const pattern of listingPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const listingHtml = match[1];
        
        // Try multiple title/URL patterns
        const titleMatch = listingHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/i) ||
                          listingHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*class="[^"]*cl-app-anchor[^"]*"[^>]*>([^<]+)<\/a>/i) ||
                          listingHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
        
        if (titleMatch) {
          let href = titleMatch[1];
          const title = titleMatch[2].trim().replace(/\s+/g, " ");
          
          // Make URL absolute
          if (href.startsWith("/")) {
            const urlObj = new URL(baseUrl);
            href = `${urlObj.protocol}//${urlObj.host}${href}`;
          } else if (!href.startsWith("http")) {
            href = `${baseUrl}${href}`;
          }
          
          // Extract price - try multiple patterns
          const priceMatch = listingHtml.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>([^<]+)<\/span>/i) ||
                            listingHtml.match(/\$(\d+(?:\.\d{2})?)/);
          const priceStr = priceMatch ? (priceMatch[1]?.trim() || priceMatch[0]) : "";
          const price = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
          
          // Extract location
          const locationMatch = listingHtml.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([^<]+)<\/span>/i) ||
                               listingHtml.match(/<span[^>]*class="[^"]*result-hood[^"]*"[^>]*>([^<]+)<\/span>/i);
          const location = locationMatch ? locationMatch[1].trim() : undefined;
          
          if (title && !isNaN(price) && price > 0 && href) {
            listings.push({ title, price, url: href, location });
          }
        }
      }
      if (listings.length > 0) break; // Use first pattern that finds results
    }
  } else if (source === "offerup") {
    // Improved OfferUp parsing
    // OfferUp uses React/JS, so HTML parsing is limited, but we can try
    const listingPatterns = [
      /<div[^>]*class="[^"]*[Ll]isting[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<article[^>]*>([\s\S]*?)<\/article>/gi,
    ];

    for (const pattern of listingPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const listingHtml = match[1];
        
        // Extract title
        const titleMatch = listingHtml.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i) ||
                          listingHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
        
        if (titleMatch) {
          const title = (titleMatch[2] || titleMatch[1]).trim();
          
          // Extract price
          const priceMatch = listingHtml.match(/\$(\d+(?:\.\d{2})?)/);
          const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
          
          // Extract URL
          const urlMatch = listingHtml.match(/href=["']([^"']+)["']/i);
          let url = "";
          if (urlMatch) {
            url = urlMatch[1].startsWith("http") ? urlMatch[1] : `https://www.offerup.com${urlMatch[1]}`;
          }
          
          // Extract location
          const locationMatch = listingHtml.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*[A-Z]{2}/);
          const location = locationMatch ? locationMatch[0] : undefined;
          
          if (title && !isNaN(price) && price > 0 && url) {
            listings.push({ title, price, url, location });
          }
        }
      }
      if (listings.length > 0) break;
    }
  }

  return listings;
}

/**
 * Parse listings from extracted text (fallback) - Improved parsing
 */
function parseListingsFromText(text: string, source: string, baseUrl: string): Listing[] {
  const listings: Listing[] = [];
  
  // For Craigslist, look for patterns like "Product Name $Price Location"
  if (source === "craigslist") {
    // Pattern: Title $Price Location
    const listingPattern = /([A-Z][^$]+?)\s+\$(\d+(?:\.\d{2})?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
    let match;
    while ((match = listingPattern.exec(text)) !== null) {
      const title = match[1].trim();
      const price = parseFloat(match[2]);
      const location = match[3].trim();
      
      if (title && !isNaN(price) && price > 0) {
        // Try to find URL in nearby text or construct from title
        const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 50);
        listings.push({
          title,
          price,
          url: `${baseUrl}#${titleSlug}`,
          location,
        });
      }
    }
    
    // Fallback: simpler pattern for titles with prices
    if (listings.length === 0) {
      const lines = text.split(/\n|\./).filter(line => line.trim().length > 10);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const priceMatch = line.match(/\$(\d+(?:\.\d{2})?)/);
        
        if (priceMatch && line.length > 10) {
          const price = parseFloat(priceMatch[1]);
          const title = line.replace(/\$[\d.]+.*$/, "").trim();
          
          // Extract location if present
          const locationMatch = line.match(/(Des Moines|West Des Moines|Urbandale|Clive|Ames|Ankeny)/i);
          const location = locationMatch ? locationMatch[1] : undefined;
          
          if (title && title.length > 5 && !isNaN(price) && price > 0) {
            listings.push({
              title,
              price,
              url: `${baseUrl}#listing-${i}`,
              location,
            });
          }
        }
      }
    }
  } else if (source === "offerup") {
    // For OfferUp, look for product names with prices and locations
    const lines = text.split(/\n|•/).filter(line => line.trim().length > 5);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const priceMatch = line.match(/\$(\d+(?:\.\d{2})?)/);
      
      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);
        // Extract title (text before price)
        const title = line.substring(0, priceMatch.index).trim();
        // Extract location (text after price, look for city names)
        const locationMatch = line.match(/\$[\d.]+.*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*[A-Z]{2}/);
        const location = locationMatch ? locationMatch[1] : undefined;
        
        if (title && title.length > 5 && !isNaN(price) && price > 0) {
          listings.push({
            title,
            price,
            url: `${baseUrl}#listing-${i}`,
            location,
          });
        }
      }
    }
  }

  return listings;
}

/**
 * Get market data from eBay Sold listings and Amazon
 */
async function getMarketData(productName: string): Promise<MarketData> {
  const marketData: MarketData = {
    ebayUsedRange: null,
    amazonNewPrice: null,
    productName,
  };

  try {
    // Search eBay Sold listings
    const PROJECT_URL = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL") || "";
    const FUNCTIONS_BASE = PROJECT_URL ? `${PROJECT_URL.replace(/\/+$/, "")}/functions/v1` : "";
    
    if (FUNCTIONS_BASE) {
      try {
        // Use playwright-wrapper to search eBay
        const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(productName)}&_sop=13&LH_Sold=1&LH_Complete=1`;
        const playwrightUrl = `${FUNCTIONS_BASE}/playwright-wrapper`;
        console.log(`[getMarketData] Searching eBay via playwright-wrapper: ${ebayUrl}`);
        
        const response = await fetch(playwrightUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
            apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
          },
          body: JSON.stringify({
            command: "browser_extract_text",
            args: { url: ebayUrl },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const text = typeof result === "string" ? result : JSON.stringify(result);
          const prices = extractPricesFromText(text);
          
          if (prices.length > 0) {
            marketData.ebayUsedRange = {
              min: Math.min(...prices),
              max: Math.max(...prices),
            };
          }
        }
      } catch (error) {
        console.warn("Failed to get eBay data via playwright:", error);
      }
    }

    // Search Amazon
    try {
      const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(productName)}`;
      const response = await fetch(amazonUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const html = await response.text();
      const priceMatch = html.match(/\$\s*(\d+(?:\.\d{2})?)/);
      
      if (priceMatch) {
        marketData.amazonNewPrice = parseFloat(priceMatch[1]);
      }
    } catch (error) {
      console.warn("Failed to get Amazon data:", error);
    }
  } catch (error) {
    console.error("Error getting market data:", error);
  }

  return marketData;
}

/**
 * Extract prices from text
 */
function extractPricesFromText(text: string): number[] {
  const prices: number[] = [];
  const priceMatches = text.matchAll(/\$(\d+(?:\.\d{2})?)/g);
  
  for (const match of priceMatches) {
    const price = parseFloat(match[1]);
    if (!isNaN(price) && price > 0 && price < 10000) {
      // Reasonable price range filter
      prices.push(price);
    }
  }

  return prices;
}

/**
 * Analyze reselling opportunities
 */
function analyzeResellingOpportunities(
  listings: Listing[],
  marketDataMap: Map<string, MarketData>,
): Opportunity[] {
  const opportunities: Opportunity[] = [];

  for (const listing of listings) {
    // Try to match listing to market data by product name
    let marketData: MarketData | null = null;
    
    // Simple matching: check if any market data product name appears in listing title
    for (const [productName, data] of marketDataMap.entries()) {
      const productWords = productName.toLowerCase().split(/\s+/);
      const listingWords = listing.title.toLowerCase().split(/\s+/);
      
      // Check if at least 2 significant words match
      const matchingWords = productWords.filter(word => 
        word.length > 3 && listingWords.some(lw => lw.includes(word) || word.includes(lw))
      );
      
      if (matchingWords.length >= 2) {
        marketData = data;
        break;
      }
    }

    // If no match found, create generic market data for this listing
    if (!marketData) {
      marketData = marketDataMap.get(listing.title) || {
        ebayUsedRange: null,
        amazonNewPrice: null,
        productName: listing.title,
      };
    }

    // Calculate potential profit
    let potentialProfit = 0;
    let profitMargin = 0;
    let isStrongOpportunity = false;

    if (marketData.ebayUsedRange) {
      const lowEnd = marketData.ebayUsedRange.min;
      const listingPrice = listing.price;
      
      // Strong opportunity if listing price is at least 25% below low end
      const threshold = lowEnd * 0.75;
      
      if (listingPrice <= threshold) {
        potentialProfit = lowEnd - listingPrice;
        profitMargin = ((lowEnd - listingPrice) / listingPrice) * 100;
        isStrongOpportunity = true;
      } else {
        // Still calculate profit even if not "strong"
        potentialProfit = lowEnd - listingPrice;
        profitMargin = ((lowEnd - listingPrice) / listingPrice) * 100;
      }
    }

    opportunities.push({
      listing,
      marketData,
      potentialProfit,
      profitMargin,
      isStrongOpportunity,
    });
  }

  // Sort by potential profit (descending)
  return opportunities.sort((a, b) => b.potentialProfit - a.potentialProfit);
}

/**
 * Generate AI-powered conversational summary using OpenAI
 */
async function generateAISummary(opportunities: Opportunity[]): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return generateVoiceSummary(opportunities).summary; // Fallback to basic summary
  }

  try {
    const strongOpps = opportunities.filter(opp => opp.isStrongOpportunity);
    const otherOpps = opportunities.filter(opp => !opp.isStrongOpportunity);
    
    // Build context for AI
    const context = {
      strongOpportunities: strongOpps.slice(0, 5).map(opp => ({
        product: opp.listing.title,
        price: opp.listing.price,
        url: opp.listing.url,
        location: opp.listing.location,
        profit: opp.potentialProfit,
        margin: opp.profitMargin,
        ebayRange: opp.marketData.ebayUsedRange,
        amazonPrice: opp.marketData.amazonNewPrice,
      })),
      otherListings: otherOpps.slice(0, 10).map(opp => ({
        product: opp.listing.title,
        price: opp.listing.price,
        url: opp.listing.url,
      })),
      totalListings: opportunities.length,
    };

    const prompt = `You are a helpful assistant analyzing reselling opportunities. Generate a concise, conversational summary (2-3 paragraphs) that:

1. Highlights the best reselling opportunities with specific product names, prices, and potential profits
2. Mentions listing URLs so the user can check them out
3. Compares prices to eBay Sold listings and Amazon when available
4. Uses natural, spoken language (avoid bullet points, tables, or complex formatting)
5. Is friendly and actionable

Context:
${JSON.stringify(context, null, 2)}

Generate the summary now:`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant that generates concise, conversational summaries of reselling opportunities." },
          { role: "user", content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content?.trim();
      if (summary) {
        return summary;
      }
    }
  } catch (error) {
    console.warn("Failed to generate AI summary, using fallback:", error);
  }

  // Fallback to basic summary
  return generateVoiceSummary(opportunities).summary;
}

/**
 * Convert analysis results to voice-transcription-friendly text and detailed email report
 */
function generateVoiceSummary(opportunities: Opportunity[]): { summary: string; emailReport: string } {
  const strongOpportunities = opportunities.filter(opp => opp.isStrongOpportunity);
  const otherOpportunities = opportunities.filter(opp => !opp.isStrongOpportunity);

  let summary = "";
  let emailReport = "RESELLING OPPORTUNITIES ANALYSIS REPORT\n";
  emailReport += "=" .repeat(50) + "\n\n";

  if (strongOpportunities.length > 0) {
    summary += `A strong reselling opportunity was identified for ${strongOpportunities[0].listing.title} on ${strongOpportunities[0].listing.url.includes("craigslist") ? "Craigslist" : "OfferUp"}. `;
    summary += `The listing price is $${strongOpportunities[0].listing.price.toFixed(2)}. `;
    
    if (strongOpportunities[0].marketData.ebayUsedRange) {
      summary += `The estimated profit is $${strongOpportunities[0].potentialProfit.toFixed(2)}, as the typical eBay sold price is in the range of $${strongOpportunities[0].marketData.ebayUsedRange.min.toFixed(2)} to $${strongOpportunities[0].marketData.ebayUsedRange.max.toFixed(2)}. `;
    }
    
    summary += `The direct link to the listing is: ${strongOpportunities[0].listing.url}. `;
    summary += `We recommend checking the item's condition immediately. `;

    // Email report section for strong opportunities
    emailReport += "STRONG RESELLING OPPORTUNITIES:\n";
    emailReport += "-".repeat(50) + "\n";
    for (const opp of strongOpportunities) {
      emailReport += `\nProduct: ${opp.listing.title}\n`;
      emailReport += `Listing Price: $${opp.listing.price.toFixed(2)}\n`;
      emailReport += `Listing URL: ${opp.listing.url}\n`;
      if (opp.listing.location) {
        emailReport += `Location: ${opp.listing.location}\n`;
      }
      if (opp.marketData.ebayUsedRange) {
        emailReport += `eBay Sold Price Range: $${opp.marketData.ebayUsedRange.min.toFixed(2)} - $${opp.marketData.ebayUsedRange.max.toFixed(2)}\n`;
      }
      if (opp.marketData.amazonNewPrice) {
        emailReport += `Amazon New Price: $${opp.marketData.amazonNewPrice.toFixed(2)}\n`;
      }
      emailReport += `Potential Profit: $${opp.potentialProfit.toFixed(2)}\n`;
      emailReport += `Profit Margin: ${opp.profitMargin.toFixed(1)}%\n`;
      emailReport += "\n";
    }
  }

  if (otherOpportunities.length > 0) {
    const productNames = otherOpportunities
      .slice(0, 5)
      .map(opp => opp.listing.title)
      .join(", ");
    
    summary += `Other listings for ${productNames} were analyzed but were priced too high for a profitable reselling margin. `;

    // Email report section for other listings
    emailReport += "\nOTHER LISTINGS ANALYZED:\n";
    emailReport += "-".repeat(50) + "\n";
    for (const opp of otherOpportunities.slice(0, 10)) {
      emailReport += `\nProduct: ${opp.listing.title}\n`;
      emailReport += `Listing Price: $${opp.listing.price.toFixed(2)}\n`;
      emailReport += `Listing URL: ${opp.listing.url}\n`;
      if (opp.marketData.ebayUsedRange) {
        emailReport += `eBay Sold Price Range: $${opp.marketData.ebayUsedRange.min.toFixed(2)} - $${opp.marketData.ebayUsedRange.max.toFixed(2)}\n`;
      }
      emailReport += `Status: Priced too high for profitable reselling\n`;
      emailReport += "\n";
    }
  }

  summary += `A full, detailed report with all data points and links has been saved to your project files.`;
  emailReport += "\n" + "=".repeat(50) + "\n";
  emailReport += `Total Listings Analyzed: ${opportunities.length}\n`;
  emailReport += `Strong Opportunities: ${strongOpportunities.length}\n`;

  return { summary, emailReport };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const invocation: Invocation = await req.json();
    const { command, args = {} } = invocation;

    // Support both "analyze_headphones" (legacy) and "analyze_reselling_opportunities" (new)
    if (command === "analyze_headphones" || command === "analyze_reselling_opportunities" || !command) {
      const location = args.location || "des moines";
      const query = args.query || args.product || "headphones";
      const sources = (args.sources || "craigslist,offerup").split(",").map(s => s.trim()) as Array<"craigslist" | "offerup">;
      
      console.log(`[reselling-analysis] Starting analysis: query="${query}", location="${location}", sources=${sources.join(",")}`);

      // Step 1: Scrape listings from all sources
      const allListings: Listing[] = [];
      for (const source of sources) {
        console.log(`[reselling-analysis] Scraping ${source} for "${query}" in ${location}...`);
        const listings = await scrapeListings(source, location, query);
        console.log(`[reselling-analysis] Found ${listings.length} listings from ${source}`);
        allListings.push(...listings);
      }
      
      if (allListings.length === 0) {
        console.warn(`[reselling-analysis] No listings found for "${query}" in ${location}`);
        // Return detailed error with debugging info
        const errorDetails = {
          type: "error",
          message: `No listings found for "${query}" in ${location}`,
          details: {
            query,
            location,
            sources: sources.join(", "),
            possibleReasons: [
              "Web scraping may have failed (websites may block automated access)",
              "The parsing logic may not match the current website structure",
              "No active listings match your search criteria",
              "Location-specific results may be limited"
            ],
            suggestions: [
              "Try a more general search term",
              "Check a different location",
              "Verify playwright-wrapper function is deployed and working",
              "Check Supabase function logs for detailed error messages"
            ]
          }
        };
        
        return new Response(
          JSON.stringify(errorDetails as AnalysisResult),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Step 2: Get market data for each unique product
      const uniqueProducts = new Set(allListings.map(l => l.title));
      const marketDataMap = new Map<string, MarketData>();

      for (const productName of uniqueProducts) {
        const marketData = await getMarketData(productName);
        marketDataMap.set(productName, marketData);
      }

      // Step 3: Analyze opportunities
      const opportunities = analyzeResellingOpportunities(allListings, marketDataMap);

      // Step 4: Generate AI-powered conversational summary and email report
      const { emailReport } = generateVoiceSummary(opportunities);
      const summary = await generateAISummary(opportunities);
      
      // Log results for debugging
      console.log(`[reselling-analysis] Analysis complete: ${allListings.length} listings, ${opportunities.length} opportunities, ${opportunities.filter(opp => opp.isStrongOpportunity).length} strong`);

      // Return both JSON data and summary
      // IMPORTANT: Return the actual data, not just a summary
      const responseData = {
        type: "json" as const,
        data: {
          opportunities,
          summary,
          emailReport,
          totalListings: allListings.length,
          strongOpportunities: opportunities.filter(opp => opp.isStrongOpportunity).length,
          allListings: allListings.map(l => ({
            title: l.title,
            price: l.price,
            url: l.url,
            location: l.location
          }))
        },
        summary,
      };
      
      return new Response(
        JSON.stringify(responseData as AnalysisResult),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } else {
      return new Response(
        JSON.stringify({
          type: "error",
          message: `Unknown command: ${command}. Supported commands: analyze_headphones, analyze_reselling_opportunities`,
        } as AnalysisResult),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Error in reselling-analysis:", error);
    return new Response(
      JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        details: error,
      } as AnalysisResult),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

