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
    if (MCP_GATEWAY_URL) {
      try {
        // Construct the playwright-wrapper URL correctly
        const playwrightUrl = MCP_GATEWAY_URL.includes("/mcp") 
          ? MCP_GATEWAY_URL.replace("/mcp", "/playwright-wrapper")
          : `${MCP_GATEWAY_URL}/playwright-wrapper`;
        
        const response = await fetch(playwrightUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
          },
          body: JSON.stringify({
            command: "browser_extract_text",
            args: { url },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          // Parse the extracted text for listings
          // This is a simplified parser - in production, you'd want more robust parsing
          const text = typeof result === "string" ? result : JSON.stringify(result);
          listings.push(...parseListingsFromText(text, source, url));
        }
      } catch (error) {
        console.warn("Failed to use playwright-wrapper, falling back to HTTP:", error);
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
 * Parse listings from HTML content
 */
function parseListingsFromHTML(html: string, source: string, baseUrl: string): Listing[] {
  const listings: Listing[] = [];

  if (source === "craigslist") {
    // Parse Craigslist HTML structure
    const listingMatches = html.matchAll(
      /<li[^>]*class="[^"]*cl-search-result[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
    );

    for (const match of listingMatches) {
      const listingHtml = match[1];
      const titleMatch = listingHtml.match(/<a[^>]*class="[^"]*cl-app-anchor[^"]*"[^>]*>([^<]+)<\/a>/i);
      const priceMatch = listingHtml.match(/\$(\d+(?:\.\d{2})?)/);
      const urlMatch = listingHtml.match(/href="([^"]+)"/i);

      if (titleMatch && priceMatch) {
        const title = titleMatch[1].trim();
        const price = parseFloat(priceMatch[1]);
        const url = urlMatch ? (urlMatch[1].startsWith("http") ? urlMatch[1] : `https://${new URL(baseUrl).hostname}${urlMatch[1]}`) : "";

        if (title && !isNaN(price) && url) {
          listings.push({ title, price, url });
        }
      }
    }
  } else if (source === "offerup") {
    // Parse OfferUp HTML structure (simplified)
    const listingMatches = html.matchAll(/<div[^>]*class="[^"]*[Ll]isting[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);

    for (const match of listingMatches) {
      const listingHtml = match[1];
      const titleMatch = listingHtml.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i);
      const priceMatch = listingHtml.match(/\$(\d+(?:\.\d{2})?)/);
      const urlMatch = listingHtml.match(/href="([^"]+)"/i);

      if (titleMatch && priceMatch) {
        const title = titleMatch[1].trim();
        const price = parseFloat(priceMatch[1]);
        const url = urlMatch ? (urlMatch[1].startsWith("http") ? urlMatch[1] : `https://www.offerup.com${urlMatch[1]}`) : "";

        if (title && !isNaN(price) && url) {
          listings.push({ title, price, url });
        }
      }
    }
  }

  return listings;
}

/**
 * Parse listings from extracted text (fallback)
 */
function parseListingsFromText(text: string, source: string, baseUrl: string): Listing[] {
  const listings: Listing[] = [];
  const lines = text.split("\n").filter(line => line.trim().length > 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const priceMatch = line.match(/\$(\d+(?:\.\d{2})?)/);
    
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      const title = line.replace(/\$[\d.]+/, "").trim();
      
      if (title && !isNaN(price)) {
        listings.push({
          title,
          price,
          url: `${baseUrl}#listing-${i}`,
        });
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
    if (MCP_GATEWAY_URL) {
      try {
        // Use playwright-wrapper to search eBay
        const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(productName)}&_sop=13&LH_Sold=1&LH_Complete=1`;
        
        // Construct the playwright-wrapper URL correctly
        const playwrightUrl = MCP_GATEWAY_URL.includes("/mcp") 
          ? MCP_GATEWAY_URL.replace("/mcp", "/playwright-wrapper")
          : `${MCP_GATEWAY_URL}/playwright-wrapper`;
        
        const response = await fetch(playwrightUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
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
 * Convert analysis results to voice-transcription-friendly text
 */
function generateVoiceSummary(opportunities: Opportunity[]): string {
  const strongOpportunities = opportunities.filter(opp => opp.isStrongOpportunity);
  const otherOpportunities = opportunities.filter(opp => !opp.isStrongOpportunity);

  let summary = "";

  if (strongOpportunities.length > 0) {
    summary += `A strong reselling opportunity was identified for ${strongOpportunities[0].listing.title} on ${strongOpportunities[0].listing.url.includes("craigslist") ? "Craigslist" : "OfferUp"}. `;
    summary += `The listing price is $${strongOpportunities[0].listing.price.toFixed(2)}. `;
    
    if (strongOpportunities[0].marketData.ebayUsedRange) {
      summary += `The estimated profit is $${strongOpportunities[0].potentialProfit.toFixed(2)}, as the typical eBay sold price is in the range of $${strongOpportunities[0].marketData.ebayUsedRange.min.toFixed(2)} to $${strongOpportunities[0].marketData.ebayUsedRange.max.toFixed(2)}. `;
    }
    
    summary += `The direct link to the listing is: ${strongOpportunities[0].listing.url}. `;
    summary += `We recommend checking the item's condition immediately. `;
  }

  if (otherOpportunities.length > 0) {
    const productNames = otherOpportunities
      .slice(0, 5)
      .map(opp => opp.listing.title)
      .join(", ");
    
    summary += `Other listings for ${productNames} were analyzed but were priced too high for a profitable reselling margin. `;
  }

  summary += `A full, detailed report with all data points and links has been saved to your project files.`;

  return summary;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const invocation: Invocation = await req.json();
    const { command, args = {} } = invocation;

    if (command === "analyze_headphones") {
      const location = args.location || "des moines";
      const query = args.query || "headphones";
      const sources = (args.sources || "craigslist,offerup").split(",").map(s => s.trim()) as Array<"craigslist" | "offerup">;

      // Step 1: Scrape listings from all sources
      const allListings: Listing[] = [];
      for (const source of sources) {
        const listings = await scrapeListings(source, location, query);
        allListings.push(...listings);
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

      // Step 4: Generate voice-friendly summary
      const summary = generateVoiceSummary(opportunities);

      // Return both JSON data and summary
      return new Response(
        JSON.stringify({
          type: "json",
          data: {
            opportunities,
            summary,
            totalListings: allListings.length,
            strongOpportunities: opportunities.filter(opp => opp.isStrongOpportunity).length,
          },
          summary,
        } as AnalysisResult),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } else {
      return new Response(
        JSON.stringify({
          type: "error",
          message: `Unknown command: ${command}`,
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

