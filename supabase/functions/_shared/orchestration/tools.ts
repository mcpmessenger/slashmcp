/**
 * Shared tool definitions for agent orchestration
 */

import type { Tool } from "https://esm.sh/@openai/agents@0.3.2";
import { createMemoryService, type MemoryService } from "../memory.ts";

/**
 * Create memory tools for agent use
 */
export function createMemoryTools(memoryService: ReturnType<typeof createMemoryService>): Tool[] {
  return [
    {
      name: "query_memory",
      description:
        "Query the user's persistent memory to retrieve stored information like passwords, preferences, facts, or conversation summaries. Use this when the user asks about something they've told you before or when you need to recall stored information.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "The memory key to retrieve (e.g., 'password', 'preferences', 'important_facts', or 'conversation_summary_2025-01-19')",
          },
          search: {
            type: "string",
            description: "Optional: Search term to find relevant memories. If provided, will search all memory keys.",
          },
        },
      },
      async run({ key, search }: { key?: string; search?: string }) {
        try {
          if (search) {
            // Search all memories
            const allMemories = await memoryService.getAllMemory();
            const searchLower = search.toLowerCase();
            const matches = allMemories.filter(
              (mem) =>
                mem.key.toLowerCase().includes(searchLower) ||
                JSON.stringify(mem.value).toLowerCase().includes(searchLower),
            );
            if (matches.length === 0) {
              return `No memories found matching "${search}"`;
            }
            return JSON.stringify(matches, null, 2);
          } else if (key) {
            // Get specific memory
            const value = await memoryService.getMemory(key);
            if (value === null) {
              return `No memory found for key "${key}"`;
            }
            return JSON.stringify({ key, value }, null, 2);
          } else {
            // Get all memories
            const allMemories = await memoryService.getAllMemory();
            return JSON.stringify(allMemories, null, 2);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `Error querying memory: ${message}`;
        }
      },
    },
    {
      name: "store_memory",
      description:
        "Store information in the user's persistent memory. Use this when the user explicitly asks you to remember something, set a password, save a preference, or store an important fact. The key should be descriptive (e.g., 'password', 'secret_code_word', 'favorite_color', 'important_fact').",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "The memory key to store (e.g., 'password', 'secret_code_word', 'preferences', 'important_fact')",
          },
          value: {
            type: "string",
            description: "The value to store. Can be a simple string or JSON string for complex data.",
          },
        },
        required: ["key", "value"],
      },
      async run({ key, value }: { key: string; value: string }) {
        try {
          // Try to parse as JSON, otherwise store as string
          let parsedValue: unknown = value;
          try {
            parsedValue = JSON.parse(value);
          } catch {
            // Not JSON, store as string
            parsedValue = value;
          }
          
          await memoryService.setMemory(key, parsedValue);
          return `Successfully stored memory with key "${key}"`;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `Error storing memory: ${message}`;
        }
      },
    },
  ];
}

/**
 * Execute MCP command via gateway
 */
export async function executeMcpCommand(
  command: string,
  mcpGatewayUrl: string,
  authHeader?: string | null,
): Promise<string> {
  if (!mcpGatewayUrl) {
    return "MCP gateway URL is not configured on the server.";
  }

  const trimmed = (command ?? "").trim();
  if (!trimmed.startsWith("/")) {
    return 'Invalid MCP command format. Expected something like "/alphavantage-mcp get_quote symbol=NVDA".';
  }

  // Parse command more carefully to handle quoted values with spaces
  // Format: /server-id command param1="value with spaces" param2=simple
  // First, extract server-id and command name (before any quoted params)
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) {
    // No parameters, just server-id
    const serverId = trimmed.slice(1);
    return JSON.stringify({
      serverId,
      command: undefined,
      args: {},
      positionalArgs: [],
    });
  }
  
  const serverId = trimmed.slice(1, firstSpace);
  let remaining = trimmed.slice(firstSpace + 1).trim();
  
  // Find command name (first word before any quoted params)
  const commandMatch = remaining.match(/^(\S+)/);
  if (!commandMatch) {
    return 'Invalid MCP command format. Expected something like "/alphavantage-mcp get_quote symbol=NVDA".';
  }
  
  const mcpCommand = commandMatch[1];
  remaining = remaining.slice(mcpCommand.length).trim();
  
  // Parse parameters, handling quoted values
  const args: Record<string, string> = {};
  
  if (remaining) {
    // Parse key=value pairs, handling quoted values with spaces
    const paramRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let match;
    
    while ((match = paramRegex.exec(remaining)) !== null) {
      const key = match[1];
      // match[2] = double-quoted value, match[3] = single-quoted value, match[4] = unquoted value
      const value = match[2] || match[3] || match[4] || '';
      args[key] = value;
    }
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Add authorization header if provided
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const response = await fetch(mcpGatewayUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        serverId,
        command: mcpCommand,
        args,
        positionalArgs: [],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `MCP gateway request failed with status ${response.status}${
          errorText ? `: ${errorText.slice(0, 200)}` : ""
        }`,
      );
    }

    const data = await response.json();
    return JSON.stringify(data, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error executing MCP command: ${message}`;
  }
}

/**
 * Create MCP proxy tool
 */
export function createMcpProxyTool(mcpGatewayUrl: string, authHeader?: string | null): Tool {
  return {
    name: "mcp_proxy",
    description:
      "Executes MCP commands to browse websites, search the web, send emails, get stock data, and more. " +
      "You CAN browse ANY website (Craigslist, eBay, Amazon, etc.) using playwright-wrapper. " +
      "You CAN send emails using email-mcp. " +
      "You CAN search websites and extract data. " +
      "Input format: /<server-id> <command> [param=value...]. " +
      "Examples: '/playwright-wrapper browser_navigate url=https://craigslist.org', '/email-mcp send_test_email', '/search-mcp web_search query=shuttle bus'",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: 'The full MCP command string. Examples: "/playwright-wrapper browser_navigate url=https://example.com", "/email-mcp send_test_email", "/search-mcp web_search query=shuttle bus"',
        },
      },
      required: ["command"],
    },
    async run({ command }: { command: string }) {
      return await executeMcpCommand(command, mcpGatewayUrl, authHeader);
    },
  };
}

/**
 * Create RAG/document tools for agent use
 * These tools allow the orchestrator to handle document uploads, searches, and management
 */
export function createRagTools(
  supabaseUrl: string,
  supabaseServiceKey: string,
  userId: string,
): Tool[] {
  return [
    {
      name: "search_documents",
      description:
        "Search uploaded documents using semantic search (RAG). ALWAYS use this when the user mentions documents, uploaded files, PDFs, or asks questions that could be answered by document content. " +
        "Examples: 'What can you tell me about the document?', 'What does my document say?', 'Tell me about the PDF I uploaded', 'Search my documents', " +
        "'What information is in my file?', 'Analyze my document', 'What's in the document?'. " +
        "This tool searches all user's uploaded and processed documents. If documents are still processing, it will indicate that. " +
        "DO NOT say 'I can't analyze documents' - use this tool instead.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query - what the user is looking for in the documents",
          },
          jobIds: {
            type: "array",
            items: { type: "string" },
            description: "Optional: Specific document job IDs to search. If not provided, searches all user documents.",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 10)",
          },
        },
        required: ["query"],
      },
      async run({ query, jobIds, limit = 10 }: { query: string; jobIds?: string[]; limit?: number }) {
        try {
          const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          
          // First, check document status
          let statusQuery = supabase
            .from("processing_jobs")
            .select("id, file_name, status, metadata")
            .eq("user_id", userId);
          
          if (jobIds && jobIds.length > 0) {
            statusQuery = statusQuery.in("id", jobIds);
          }
          
          const { data: docs, error: docError } = await statusQuery;
          
          if (docError) {
            return `Error checking document status: ${docError.message}`;
          }
          
          if (!docs || docs.length === 0) {
            return "You don't have any uploaded documents yet. Please upload a document first.";
          }
          
          // Check for processing documents
          const processingDocs = docs.filter(d => {
            const status = d.status;
            const metadata = d.metadata as Record<string, unknown> | null;
            const stage = metadata?.job_stage as string || "unknown";
            return status !== "completed" || (stage !== "indexed" && stage !== "injected");
          });
          
          if (processingDocs.length > 0 && processingDocs.length === docs.length) {
            // All documents are still processing
            const docNames = processingDocs.map(d => d.file_name).join(", ");
            const statuses = processingDocs.map(d => {
              const metadata = d.metadata as Record<string, unknown> | null;
              const stage = metadata?.job_stage as string || "unknown";
              return `${d.file_name} (${d.status}, stage: ${stage})`;
            }).join("; ");
            return `Your documents are still being processed: ${docNames}. Current status: ${statuses}. Please wait a few moments and try again. The documents will be searchable once processing completes.`;
          }
          
          // Filter to only completed documents for search
          const readyJobIds = docs
            .filter(d => {
              const metadata = d.metadata as Record<string, unknown> | null;
              const stage = metadata?.job_stage as string || "unknown";
              return d.status === "completed" && (stage === "indexed" || stage === "injected");
            })
            .map(d => d.id);
          
          if (readyJobIds.length === 0) {
            return "Your documents are still being processed. Please wait a few moments for processing to complete, then try searching again.";
          }
          
          // Call doc-context Edge Function with only ready documents
          const functionsUrl = supabaseUrl.replace(/\/$/, "") + "/functions/v1";
          const response = await fetch(`${functionsUrl}/doc-context`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              query,
              jobIds: readyJobIds,
              limit,
              similarity_threshold: 0.7,
            }),
          });

          if (!response.ok) {
            const error = await response.text();
            return `Error searching documents: ${error}`;
          }

          const data = await response.json();
          if (!data.contexts || data.contexts.length === 0) {
            // If some docs are processing, mention that
            if (processingDocs.length > 0) {
              const processingNames = processingDocs.map(d => d.file_name).join(", ");
              return `No relevant results found in your processed documents. Note: ${processingNames} ${processingDocs.length === 1 ? 'is' : 'are'} still processing and will be searchable once complete.`;
            }
            return "No relevant documents found for your query.";
          }

          // Format results
          const results = data.contexts.map((ctx: any) => ({
            fileName: ctx.fileName,
            chunks: ctx.chunks.map((chunk: any) => ({
              content: chunk.content,
              similarity: chunk.similarity,
            })),
          }));

          return JSON.stringify({
            searchMode: data.searchMode,
            totalDocuments: data.contexts.length,
            totalChunks: data.contexts.reduce((sum: number, ctx: any) => sum + ctx.chunks.length, 0),
            results,
          }, null, 2);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `Error searching documents: ${message}`;
        }
      },
    },
    {
      name: "list_documents",
      description:
        "List all uploaded documents with their status. Use this when the user asks 'what documents do I have', 'show my documents', or wants to see their document library.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Optional: Filter by status (queued, processing, completed, failed)",
          },
        },
        required: [],
      },
      async run({ status }: { status?: string }) {
        try {
          const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          
          let query = supabase
            .from("processing_jobs")
            .select("id, file_name, file_type, file_size, status, metadata, created_at, updated_at")
            .eq("user_id", userId)
            .eq("analysis_target", "document-analysis")
            .order("created_at", { ascending: false });

          if (status) {
            query = query.eq("status", status);
          }

          const { data, error } = await query;

          if (error) {
            return `Error listing documents: ${error.message}`;
          }

          if (!data || data.length === 0) {
            return "No documents found. Upload documents to get started.";
          }

          const documents = data.map((job: any) => {
            const metadata = job.metadata as Record<string, unknown> | null;
            const stage = metadata?.job_stage as string | undefined;
            return {
              jobId: job.id,
              fileName: job.file_name,
              fileType: job.file_type,
              fileSize: job.file_size,
              status: job.status,
              stage: stage || "unknown",
              createdAt: job.created_at,
              updatedAt: job.updated_at,
            };
          });

          return JSON.stringify({
            total: documents.length,
            documents,
          }, null, 2);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `Error listing documents: ${message}`;
        }
      },
    },
    {
      name: "get_document_status",
      description:
        "Get the processing status of a specific document. Use this when the user asks about a specific document's status or wants to check if processing is complete.",
      parameters: {
        type: "object",
        properties: {
          jobId: {
            type: "string",
            description: "The document job ID",
          },
        },
        required: ["jobId"],
      },
      async run({ jobId }: { jobId: string }) {
        try {
          const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          
          const { data, error } = await supabase
            .from("processing_jobs")
            .select("id, file_name, status, metadata, created_at, updated_at")
            .eq("id", jobId)
            .eq("user_id", userId)
            .single();

          if (error || !data) {
            return `Document not found or access denied: ${error?.message || "Not found"}`;
          }

          const metadata = data.metadata as Record<string, unknown> | null;
          const stage = metadata?.job_stage as string | undefined;

          return JSON.stringify({
            jobId: data.id,
            fileName: data.file_name,
            status: data.status,
            stage: stage || "unknown",
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          }, null, 2);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `Error getting document status: ${message}`;
        }
      },
    },
  ];
}

/**
 * Create reselling analysis tool
 */
export function createResellingAnalysisTool(resellingAnalysisUrl: string): Tool {
  return {
    name: "analyze_reselling_opportunities",
    description:
      "COMPLETE RESELLING ANALYSIS TOOL: Scrapes listings from Craigslist and OfferUp with links, compares to eBay Sold listings and Amazon prices, " +
      "identifies profitable reselling opportunities, and can email detailed reports. " +
      "This tool AUTOMATICALLY handles: (1) Scraping Craigslist and OfferUp for product listings with full URLs, " +
      "(2) Fetching eBay Sold listing prices for comparison, (3) Getting Amazon current prices, " +
      "(4) Analyzing price discrepancies and calculating profit margins, (5) Generating detailed reports with all links. " +
      "Use this IMMEDIATELY when users ask to: scrape [product] from Craigslist/OfferUp, compare prices, find reselling opportunities, " +
      "identify price discrepancies, get deals on [product], or email a report about listings. " +
      "Examples: 'Scrape headphones from Craigslist and compare to eBay', 'Find reselling opportunities for laptops', " +
      "'Email me a report with links to headphone listings and price comparisons'.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Location for local marketplace searches (e.g., 'des moines', 'chicago')",
        },
        query: {
          type: "string",
          description: "Product search query (e.g., 'headphones', 'laptop', 'bicycle')",
        },
        sources: {
          type: "string",
          description: "Comma-separated list of sources to scrape (default: 'craigslist,offerup')",
        },
      },
      required: ["query"],
    },
    async run({ location, query, sources }: { location?: string; query: string; sources?: string }) {
      try {
        const response = await fetch(resellingAnalysisUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            command: "analyze_headphones",
            args: {
              location: location || "des moines",
              query: query || "headphones",
              sources: sources || "craigslist,offerup",
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Reselling analysis failed: ${response.statusText}`);
        }

        const result = await response.json();
        
        // If email report is available, include it in the response
        const data = result.data || result;
        let responseText = "";
        
        if (data.emailReport) {
          responseText = `RESELLING ANALYSIS COMPLETE\n\n${data.summary || ""}\n\n`;
          responseText += `DETAILED EMAIL REPORT:\n${data.emailReport}\n\n`;
          responseText += `Full data with ${data.totalListings || 0} listings and ${data.strongOpportunities || 0} strong opportunities available.`;
        } else if (result.summary) {
          responseText = result.summary;
        } else {
          responseText = JSON.stringify(data, null, 2);
        }
        
        return responseText;
      } catch (error) {
        return `Error analyzing reselling opportunities: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    },
  };
}

/**
 * Tool to list available MCP commands and RAG operations
 */
export const listCommandsTool: Tool = {
  name: "list_mcp_commands",
  description: "Lists all available MCP commands and their usage. Use this when users ask 'what commands are available' or 'how do I use MCP commands'.",
  parameters: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Optional category filter: financial, prediction, knowledge, design, llm, automation",
      },
    },
    required: [],
  },
  async run({ category }: { category?: string }) {
    const commands = `
AVAILABLE MCP COMMANDS:

1. ALPHAVANTAGE-MCP (Financial Data)
   - get_stock_chart: Get historical stock price data
     Format: /alphavantage-mcp get_stock_chart symbol=SYMBOL [interval=1day|1wk|1mo] [range=1M|3M|6M|1Y]
     Example: /alphavantage-mcp get_stock_chart symbol=TSLA interval=1wk range=3M
   - get_quote: Get latest stock quote and key stats
     Format: /alphavantage-mcp get_quote symbol=SYMBOL
     Example: /alphavantage-mcp get_quote symbol=NVDA

2. POLYMARKET-MCP (Prediction Markets)
   - get_market_price: Get prediction market odds and pricing
     Format: /polymarket-mcp get_market_price market_id=MARKET_SLUG
     Example: /polymarket-mcp get_market_price market_id=us_election_2024

3. GROKIPEDIA-MCP (Knowledge Base)
   - search: Search Grokipedia knowledge base
     Format: /grokipedia-mcp search query="QUERY" [limit=NUMBER]
     Example: /grokipedia-mcp search query="Model Context Protocol" limit=5

4. CANVA-MCP (Design Creation)
   - create_design: Create a Canva design from template
     Format: /canva-mcp create_design [template=TEMPLATE] [text="TEXT"]
     Templates: presentation, doc, whiteboard (default: presentation)
     Example: /canva-mcp create_design template=presentation text="Hello World"

5. GEMINI-MCP (Text Generation)
   - generate_text: Generate text using Gemini
     Format: /gemini-mcp generate_text prompt="PROMPT" [model=MODEL] [temperature=N] [max_output_tokens=N]

6. PLAYWRIGHT-MCP (Browser Automation)
   - navigate_and_scrape: Navigate and extract content
   - screenshot: Capture page screenshot

7. PLAYWRIGHT-WRAPPER (Advanced Browser Automation)
   - browser_navigate: Navigate to URL
   - browser_snapshot: Get page accessibility snapshot
   - browser_click: Click element on page
   - browser_extract_text: Extract all text from page
   - browser_take_screenshot: Capture screenshot

8. SEARCH-MCP (Web Search)
   - web_search: Search the web using DuckDuckGo
     Format: /search-mcp web_search query="QUERY" [max_results=N]
     Example: /search-mcp web_search query="Model Context Protocol" max_results=5

9. EMAIL-MCP (Email Sending)
   - send_test_email: Send a test email to the logged-in user
     Format: /email-mcp send_test_email [subject="SUBJECT"] [body="BODY"]
     IMPORTANT: Automatically uses logged-in user's email - no need to ask for it
     Defaults: subject="Test Email", body="test"
     Example: /email-mcp send_test_email
     Example: /email-mcp send_test_email subject="Test" body="test"
     When user says "send a test email" or "send me a test email", use this command

10. DOCUMENT MANAGEMENT (RAG - Retrieval Augmented Generation)
    The orchestrator automatically handles document operations when you:
    - Upload files via chat (drag & drop or file picker)
    - Ask questions about uploaded documents
    - Request to search document content
    
    Available operations (handled automatically):
    - Upload: Drag & drop files or use file picker in chat
    - Search: Ask questions like "What does my document say about X?"
    - List: Ask "What documents do I have?" or "Show my documents"
    - Status: Ask "What's the status of document X?"
    
    The orchestrator will automatically:
    - Use semantic search when you ask questions about document content
    - Process uploaded documents in the background
    - Include relevant document context in responses
`;
    return commands;
  },
};

/**
 * Help tool that lists all available capabilities including RAG
 */
export const helpTool: Tool = {
  name: "help",
  description: "Shows comprehensive help with all available commands and capabilities. Use this when users ask for help, want to see what's available, or type /help.",
  parameters: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Optional: Filter by category (mcp, documents, memory, all)",
      },
    },
    required: [],
  },
  async run({ category }: { category?: string }) {
    const helpText = `
# SlashMCP Help - All Available Commands

## 📚 DOCUMENT MANAGEMENT (RAG)
Upload, search, and manage your documents:

**Upload Documents:**
- Drag & drop files into the chat
- Or use the file picker button
- Supported: PDF, images, text files, CSV
- Documents are automatically processed and indexed for semantic search

**Search Documents:**
- Ask questions: "What does my document say about X?"
- "Search my documents for information about Y"
- The orchestrator automatically uses semantic search when you ask about document content

**List Documents:**
- "What documents do I have?"
- "Show my documents"
- "List all my uploaded files"

**Document Status:**
- "What's the status of document X?"
- "Is my document ready?"

## 🔧 MCP COMMANDS
Use MCP commands for external services:

${category === "documents" || category === "all" ? "" : "Type '/help category=mcp' for full MCP command list"}

## 💾 MEMORY
Store and recall information:
- "Remember that my password is X"
- "What did I tell you about Y?"
- "Store my preference for Z"

## 🎯 NATURAL LANGUAGE
Just ask in plain language! The orchestrator will:
- Route to the right tool automatically
- Use document search when relevant
- Execute MCP commands when needed
- Remember important information

## Examples:
- "Get stock price for AAPL" → Uses alphavantage-mcp
- "What does my uploaded PDF say about taxes?" → Uses document search
- "Remember my API key is abc123" → Stores in memory
- "Send me a test email" → Uses email-mcp
- "Search the web for Model Context Protocol" → Uses search-mcp

Type '/help category=mcp' for full MCP command reference.
Type '/help category=documents' for document management details.
`;
    return helpText;
  },
};

