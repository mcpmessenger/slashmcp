import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

interface Invocation {
  command?: string;
  args?: Record<string, string>;
  positionalArgs?: string[];
}

type PlaywrightResult =
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

// Browser service URL (if deployed, use real browser automation)
// Set this as a Supabase secret: BROWSER_SERVICE_URL
const BROWSER_SERVICE_URL = Deno.env.get("BROWSER_SERVICE_URL");

// Note: Serverless functions don't maintain state between requests
// Each command should be self-contained or accept URL as parameter

// Helper: Fetch page content via HTTP
async function fetchPage(url: string): Promise<{ content: string; status: number; headers: Headers }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  const content = await response.text();
  return { content, status: response.status, headers: response.headers };
}

// Helper: Extract basic page info from HTML
function extractPageInfo(html: string): {
  title: string;
  links: string[];
  buttons: string[];
  headings: string[];
} {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "No title";

  const linkMatches = html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi);
  const links: string[] = [];
  for (const match of linkMatches) {
    links.push(`${match[2].trim()} → ${match[1]}`);
  }

  const buttonMatches = html.matchAll(/<button[^>]*>([^<]+)<\/button>/gi);
  const buttons: string[] = [];
  for (const match of buttonMatches) {
    buttons.push(match[1].trim());
  }

  const headingMatches = html.matchAll(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi);
  const headings: string[] = [];
  for (const match of headingMatches) {
    headings.push(match[1].trim());
  }

  return { title, links: links.slice(0, 20), buttons: buttons.slice(0, 20), headings: headings.slice(0, 10) };
}

// Helper: Parse Craigslist listings from HTML
function parseCraigslistListings(html: string, baseUrl: string): Array<{
  title: string;
  price: string;
  location: string;
  url: string;
  date?: string;
}> {
  const listings: Array<{ title: string; price: string; location: string; url: string; date?: string }> = [];
  
  // Craigslist search results are typically in <li class="cl-search-result"> or similar
  // Try multiple patterns to catch different Craigslist layouts
  const listingPatterns = [
    // Modern Craigslist format
    /<li[^>]*class="[^"]*cl-search-result[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
    // Alternative format
    /<li[^>]*class="[^"]*result-row[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
  ];

  for (const pattern of listingPatterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const listingHtml = match[1];
      
      // Extract title and URL
      const titleMatch = listingHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/i) ||
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
        
        // Extract price
        const priceMatch = listingHtml.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>([^<]+)<\/span>/i) ||
                          listingHtml.match(/\$\d+/);
        const price = priceMatch ? priceMatch[1]?.trim() || priceMatch[0] : "Price not listed";
        
        // Extract location
        const locationMatch = listingHtml.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([^<]+)<\/span>/i) ||
                             listingHtml.match(/<span[^>]*class="[^"]*result-hood[^"]*"[^>]*>([^<]+)<\/span>/i);
        const location = locationMatch ? locationMatch[1].trim() : "Location not specified";
        
        // Extract date
        const dateMatch = listingHtml.match(/<time[^>]*datetime=["']([^"']+)["'][^>]*>/i) ||
                         listingHtml.match(/<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/i);
        const date = dateMatch ? dateMatch[1] : undefined;
        
        listings.push({ title, price, location, url: href, date });
      }
    }
    
    if (listings.length > 0) break; // Use first pattern that finds results
  }
  
  return listings.slice(0, 50); // Limit to 50 listings
}

// Helper: Parse Facebook Marketplace listings from HTML
function parseFacebookMarketplaceListings(html: string, baseUrl: string): Array<{
  title: string;
  price: string;
  location: string;
  url: string;
  image?: string;
}> {
  const listings: Array<{ title: string; price: string; location: string; url: string; image?: string }> = [];
  
  // Facebook Marketplace uses various HTML structures
  // Try to find listing containers - Facebook often uses data attributes or specific class patterns
  const listingPatterns = [
    // Pattern for marketplace item links
    /<a[^>]+href=["'](\/marketplace\/item\/[^"']+)["'][^>]*>/gi,
    // Alternative: look for marketplace item containers
    /<div[^>]*class="[^"]*marketplace[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  ];

  // Extract all marketplace item URLs first
  const itemUrlMatches = html.matchAll(/href=["'](\/marketplace\/item\/[^"']+)["']/gi);
  const seenUrls = new Set<string>();
  
  for (const match of itemUrlMatches) {
    let href = match[1];
    if (href.startsWith("/")) {
      href = `https://www.facebook.com${href}`;
    }
    
    if (seenUrls.has(href)) continue;
    seenUrls.add(href);
    
    // Try to find the listing details near this URL in the HTML
    // Facebook Marketplace listings are often in nearby elements
    const contextStart = Math.max(0, match.index! - 500);
    const contextEnd = Math.min(html.length, match.index! + 2000);
    const context = html.substring(contextStart, contextEnd);
    
    // Extract title - often in aria-label or nearby text
    const titleMatch = context.match(/aria-label=["']([^"']+)["']/i) ||
                      context.match(/<span[^>]*>([^<]{10,100})<\/span>/i) ||
                      context.match(/<div[^>]*>([^<]{10,100})<\/div>/i);
    const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ") : "Untitled Listing";
    
    // Extract price - Facebook often shows prices in specific formats
    const priceMatch = context.match(/\$[\d,]+/g) || 
                      context.match(/<span[^>]*>(\$[\d,]+)<\/span>/i);
    const price = priceMatch ? (Array.isArray(priceMatch) ? priceMatch[0] : priceMatch[1] || priceMatch[0]) : "Price not listed";
    
    // Extract location - often in location-related spans
    const cityStatePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*[A-Z]{2}/;
    const locationMatch = context.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([^<]+)<\/span>/i) ||
                         context.match(cityStatePattern);
    const location = locationMatch ? locationMatch[1] : "Location not specified";
    
    // Extract image URL if available
    const imageMatch = context.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    const image = imageMatch ? imageMatch[1] : undefined;
    
    listings.push({ title, price, location, url: href, image });
  }
  
  // Alternative: Try to parse from structured data (JSON-LD or similar)
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item["@type"] === "Product" || item["@type"] === "Offer") {
            const url = item.url || item.mainEntityOfPage?.["@id"];
            if (url && url.includes("/marketplace/item/") && !seenUrls.has(url)) {
              seenUrls.add(url);
              listings.push({
                title: item.name || "Untitled Listing",
                price: item.offers?.price ? `$${item.offers.price}` : "Price not listed",
                location: item.availableAtOrFrom?.address?.addressLocality || "Location not specified",
                url: url.startsWith("http") ? url : `https://www.facebook.com${url}`,
                image: item.image,
              });
            }
          }
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
  
  return listings.slice(0, 50); // Limit to 50 listings
}

// Helper: Extract plain text from HTML (removes tags)
function extractPlainText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  
  // Replace common HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();
  
  return text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const invocation = (await req.json()) as Invocation;
    const command = invocation.command ?? "browser_navigate";
    const args = invocation.args ?? {};

    // If browser service is configured, proxy to it for real browser automation
    if (BROWSER_SERVICE_URL) {
      try {
        const response = await fetch(`${BROWSER_SERVICE_URL}/invoke`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(invocation),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({
              result: {
                type: "error",
                message: `Browser service error: ${errorText}`,
              },
            }),
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Browser service proxy error:", error);
        // Fall through to HTTP-based fallback
      }
    }

    // Fallback to HTTP-based testing (lightweight, no JS execution)

    // For now, return a structured response indicating Playwright wrapper is ready
    // but needs Playwright runtime setup
    let result: PlaywrightResult;

    switch (command) {
      case "browser_navigate": {
        const url = args.url || invocation.positionalArgs?.[0];
        if (!url) {
          result = {
            type: "error",
            message: "Missing required parameter: url",
          };
          break;
        }

        try {
          new URL(url); // Validate URL format

          // Fetch page content via HTTP
          const { content, status, headers } = await fetchPage(url);

          // Extract basic page info
          const pageInfo = extractPageInfo(content);

          result = {
            type: "json",
            data: {
              url,
              status,
              contentType: headers.get("content-type"),
              pageInfo,
              contentLength: content.length,
              message: status === 200 ? "Page loaded successfully" : `Page returned status ${status}`,
              note: "Use browser_snapshot with url parameter to get page structure",
            },
            summary: `Navigated to ${url} (HTTP ${status}) - ${pageInfo.title}`,
          };
        } catch (error) {
          result = {
            type: "error",
            message: error instanceof Error ? error.message : `Invalid URL: ${url}`,
          };
        }
        break;
      }

      case "browser_snapshot": {
        const url = args.url || invocation.positionalArgs?.[0];
        if (!url) {
          result = {
            type: "error",
            message: "Missing required parameter: url. Use browser_navigate first or pass url parameter.",
          };
          break;
        }

        // Fetch page if URL provided
        const { content, status } = await fetchPage(url);
        const pageInfo = extractPageInfo(content);

        // Create a simplified accessibility snapshot
        const snapshot = {
          url,
          status,
          title: pageInfo.title,
          elements: [
            ...pageInfo.headings.map((h, i) => ({
              role: `heading${i + 1}`,
              name: h,
              type: "heading",
            })),
            ...pageInfo.buttons.map((b, i) => ({
              role: "button",
              name: b,
              ref: `button:nth-of-type(${i + 1})`,
              type: "button",
            })),
            ...pageInfo.links.map((l, i) => {
              const [text, href] = l.split(" → ");
              return {
                role: "link",
                name: text,
                ref: `a:nth-of-type(${i + 1})`,
                href,
                type: "link",
              };
            }),
          ],
        };

        result = {
          type: "json",
          data: snapshot,
          summary: `Page snapshot: ${pageInfo.title} (${snapshot.elements.length} elements)`,
        };
        break;
      }

      case "browser_click": {
        const element = args.element || invocation.positionalArgs?.[0];
        const ref = args.ref || invocation.positionalArgs?.[1];
        const baseUrl = args.url || invocation.positionalArgs?.[2];
        if (!element || !ref) {
          result = {
            type: "error",
            message: "Missing required parameters: element and ref",
          };
          break;
        }

        if (!baseUrl) {
          result = {
            type: "error",
            message: "Missing url parameter. Provide the current page URL to extract link href.",
          };
          break;
        }

        // Fetch current page to extract link href
        const { content } = await fetchPage(baseUrl);
        const pageInfo = extractPageInfo(content);

        // Extract href from link refs, or simulate button click
        let targetUrl: string | null = null;
        if (ref.startsWith("a:")) {
          // Extract href from the link
          const linkIndex = parseInt(ref.match(/\d+/)?.[0] || "0") - 1;
          const link = pageInfo.links[linkIndex];
          if (link) {
            const [, href] = link.split(" → ");
            targetUrl = href.startsWith("http") ? href : new URL(href, baseUrl).href;
          }
        }

        if (targetUrl) {
          // Navigate to the clicked link
          const { content, status } = await fetchPage(targetUrl);
          const newPageInfo = extractPageInfo(content);

          result = {
            type: "json",
            data: {
              action: "clicked",
              element,
              ref,
              navigatedTo: targetUrl,
              status,
              pageInfo: newPageInfo,
            },
            summary: `Clicked ${element} → navigated to ${targetUrl}`,
          };
        } else {
          result = {
            type: "text",
            content: `[Playwright] Simulated click on: ${element} (ref: ${ref})\n\nNote: Full browser automation requires a headless browser service. This is a simplified HTTP-based simulation.`,
          };
        }
        break;
      }

      case "browser_extract_text": {
        const url = args.url || invocation.positionalArgs?.[0];
        if (!url) {
          result = {
            type: "error",
            message: "Missing required parameter: url",
          };
          break;
        }

        try {
          new URL(url); // Validate URL format
          const { content, status } = await fetchPage(url);
          const pageInfo = extractPageInfo(content);
          
          // Check if this is a Craigslist search results page
          const isCraigslistSearch = url.includes("craigslist.org") && (url.includes("/search/") || url.includes("query="));
          
          // Check if this is a Facebook Marketplace search page
          const isFacebookMarketplace = url.includes("facebook.com") && (url.includes("/marketplace") || url.includes("marketplace"));
          
          if (isCraigslistSearch) {
            // Parse Craigslist listings
            const listings = parseCraigslistListings(content, url);
            
            if (listings.length > 0) {
              result = {
                type: "json",
                data: {
                  url,
                  status,
                  source: "craigslist",
                  listings,
                  totalFound: listings.length,
                  message: `Found ${listings.length} listing${listings.length !== 1 ? "s" : ""} on Craigslist`,
                },
                summary: `Found ${listings.length} Craigslist listing${listings.length !== 1 ? "s" : ""} for your search`,
              };
            } else {
              // Fallback to plain text extraction if no structured listings found
              const plainText = extractPlainText(content);
              result = {
                type: "text",
                content: plainText.substring(0, 5000), // Limit to 5000 chars
              };
            }
          } else if (isFacebookMarketplace) {
            // Parse Facebook Marketplace listings
            const listings = parseFacebookMarketplaceListings(content, url);
            
            if (listings.length > 0) {
              result = {
                type: "json",
                data: {
                  url,
                  status,
                  source: "facebook-marketplace",
                  listings,
                  totalFound: listings.length,
                  message: `Found ${listings.length} listing${listings.length !== 1 ? "s" : ""} on Facebook Marketplace`,
                  note: "Note: Facebook Marketplace requires login and JavaScript. Results may be limited with HTTP-based scraping.",
                },
                summary: `Found ${listings.length} Facebook Marketplace listing${listings.length !== 1 ? "s" : ""} for your search`,
              };
            } else {
              // Fallback to plain text extraction if no structured listings found
              const plainText = extractPlainText(content);
              result = {
                type: "text",
                content: plainText.substring(0, 5000) + "\n\nNote: Facebook Marketplace requires login and JavaScript. For better results, use a headless browser service with authentication.",
              };
            }
          } else {
            // For non-Craigslist pages, extract plain text
            const plainText = extractPlainText(content);
            result = {
              type: "text",
              content: plainText.substring(0, 10000), // Limit to 10000 chars
            };
          }
        } catch (error) {
          result = {
            type: "error",
            message: error instanceof Error ? error.message : `Invalid URL: ${url}`,
          };
        }
        break;
      }

      case "browser_take_screenshot": {
        const url = args.url || invocation.positionalArgs?.[0];
        if (!url) {
          result = {
            type: "error",
            message: "Missing required parameter: url. Use browser_navigate first or pass url parameter.",
          };
          break;
        }

        // Fetch page to get structure
        const { content } = await fetchPage(url);
        const pageInfo = extractPageInfo(content);
        const filename = args.filename || `screenshot-${Date.now()}.png`;

        result = {
          type: "json",
          data: {
            filename,
            url,
            title: pageInfo.title,
            note: "Screenshot not available via HTTP. This is a page structure representation.",
            pageStructure: {
              headings: pageInfo.headings,
              buttons: pageInfo.buttons,
              links: pageInfo.links.slice(0, 10),
            },
            message: "For actual screenshots, use a headless browser service (e.g., Browserless.io API).",
          },
          summary: `Page structure for ${url} (screenshot placeholder)`,
        };
        break;
      }

      default:
        result = {
          type: "error",
          message: `Unsupported command: ${command}. Supported: browser_navigate, browser_snapshot, browser_click, browser_extract_text, browser_take_screenshot`,
        };
    }

    return new Response(
      JSON.stringify({
        result,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("playwright-wrapper error:", error);
    return new Response(
      JSON.stringify({
        result: {
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

