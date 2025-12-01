import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { Database } from "../_shared/database.types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

// Generate embedding for a query using OpenAI API
async function generateQueryEmbedding(query: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: query,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
    throw new Error("Invalid response format from OpenAI API");
  }

  return data.data[0].embedding as number[];
}

// Legacy chunking function for backward compatibility (simple character-based)
function chunkText(text: string, size = 1200): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

// Enhanced semantic chunking with overlap and boundary preservation
// Target: ~500 tokens (approximately 2000 chars), overlap: 100-200 chars
function chunkTextSemantic(
  text: string,
  targetSize: number = 2000,
  overlap: number = 150,
): Array<{ text: string; metadata: { charPosition: number; estimatedTokens: number } }> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: Array<{ text: string; metadata: { charPosition: number; estimatedTokens: number } }> = [];
  let currentPos = 0;
  let chunkIndex = 0;

  // Helper to estimate token count (rough approximation: ~4 chars per token)
  const estimateTokens = (str: string): number => Math.ceil(str.length / 4);

  while (currentPos < text.length) {
    const remainingText = text.slice(currentPos);
    
    // If remaining text is smaller than target size, take it all
    if (remainingText.length <= targetSize) {
      if (remainingText.trim().length > 0) {
        chunks.push({
          text: remainingText.trim(),
          metadata: {
            charPosition: currentPos,
            estimatedTokens: estimateTokens(remainingText),
          },
        });
      }
      break;
    }

    // Try to find a good breaking point
    let chunkEnd = currentPos + targetSize;
    
    // First, try to break at paragraph boundary (double newline)
    const paragraphBreak = text.lastIndexOf("\n\n", chunkEnd);
    if (paragraphBreak > currentPos + targetSize * 0.7) {
      chunkEnd = paragraphBreak + 2; // Include the newlines
    } else {
      // Try to break at sentence boundary (period, exclamation, question mark followed by space)
      const sentenceEndings = [". ", "! ", "? ", ".\n", "!\n", "?\n"];
      let bestBreak = -1;
      
      for (const ending of sentenceEndings) {
        const breakPos = text.lastIndexOf(ending, chunkEnd);
        if (breakPos > currentPos + targetSize * 0.7 && breakPos > bestBreak) {
          bestBreak = breakPos + ending.length;
        }
      }
      
      if (bestBreak > currentPos) {
        chunkEnd = bestBreak;
      } else {
        // Fallback: break at word boundary (space or newline)
        const wordBreak = text.lastIndexOf(" ", chunkEnd);
        if (wordBreak > currentPos + targetSize * 0.8) {
          chunkEnd = wordBreak + 1;
        }
      }
    }

    const chunkText = text.slice(currentPos, chunkEnd).trim();
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        metadata: {
          charPosition: currentPos,
          estimatedTokens: estimateTokens(chunkText),
        },
      });
    }

    // Move position forward, accounting for overlap
    // For first chunk, start from beginning. For subsequent chunks, overlap
    if (chunkIndex === 0) {
      currentPos = chunkEnd;
    } else {
      // Back up by overlap amount, but ensure we don't go backwards
      currentPos = Math.max(currentPos + 1, chunkEnd - overlap);
    }
    
    chunkIndex++;
  }

  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!supabase) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const jobIds: string[] = Array.isArray(body?.jobIds) ? body.jobIds.filter(id => typeof id === "string") : [];
    const query: string | undefined = typeof body?.query === "string" ? body.query.trim() : undefined;
    const limit: number = typeof body?.limit === "number" ? body.limit : 5;
    const similarityThreshold: number = typeof body?.similarity_threshold === "number" ? body.similarity_threshold : 0.7;

    // Vector search mode: if query is provided and OpenAI API key is available
    if (query && query.length >= 10 && OPENAI_API_KEY) {
      try {
        // Generate embedding for the query
        const queryEmbedding = await generateQueryEmbedding(query, OPENAI_API_KEY);

        // Build the similarity search query
        // Using cosine distance (<=>) which returns 0 for identical, 2 for opposite
        // Similarity = 1 - (distance / 2) = 1 - (cosine_distance / 2)
        // But actually, pgvector cosine distance gives: 1 - cosine_similarity
        // So similarity = 1 - distance
        const embeddingString = `[${queryEmbedding.join(",")}]`;

        // Use PostgreSQL function for efficient vector similarity search
        const embeddingString = `[${queryEmbedding.join(",")}]`;
        const jobIdsParam = jobIds.length > 0 ? jobIds : null;

        const { data: searchResults, error: vectorError } = await supabase.rpc(
          "search_document_embeddings",
          {
            query_embedding: embeddingString,
            job_ids: jobIdsParam,
            similarity_threshold: similarityThreshold,
            result_limit: limit,
          },
        );

        if (vectorError) {
          console.error("Vector search error:", vectorError);
          throw vectorError;
        }

        if (!searchResults || searchResults.length === 0) {
          // No embeddings found, fall back to legacy system
          console.log("No embeddings found, falling back to legacy retrieval");
        } else {
          const filteredResults = searchResults;

          if (filteredResults.length > 0) {
            // Get job metadata for all unique job_ids
            const uniqueJobIds = [...new Set(filteredResults.map((r: any) => r.job_id))];
            const { data: jobs } = await supabase
              .from("processing_jobs")
              .select("id, file_name, metadata")
              .in("id", uniqueJobIds);

            const jobMap = new Map((jobs || []).map((job: any) => [job.id, job]));

            // Group by job_id and format response
            const contextsMap = new Map<string, any>();
            for (const result of filteredResults) {
              const jobId = result.job_id;
              const job = jobMap.get(jobId);
              
              if (!contextsMap.has(jobId)) {
                contextsMap.set(jobId, {
                  jobId,
                  fileName: job?.file_name || result.file_name || "Unknown",
                  stage: job?.metadata?.job_stage || null,
                  token: `ctx://${jobId}`,
                  rawMetadata: job?.metadata || null,
                  chunks: [] as Array<{ id: string; content: string; similarity?: number }>,
                  summary: null,
                  metadata: {
                    searchMode: "vector" as const,
                  },
                });
              }

              const context = contextsMap.get(jobId);
              context.chunks.push({
                id: `ctx://${jobId}#chunk/${result.chunk_index + 1}`,
                content: result.chunk_text,
                similarity: result.similarity,
              });
            }

            const contexts = Array.from(contextsMap.values());

            return new Response(JSON.stringify({ contexts, searchMode: "vector" }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch (vectorError) {
        console.error("Vector search failed, falling back to legacy:", vectorError);
        // Fall through to legacy retrieval
      }
    }

    // Legacy retrieval mode: if no query or vector search failed
    if (!jobIds.length) {
      return new Response(JSON.stringify({ error: "jobIds must be a non-empty array or query must be provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: jobs, error: jobError } = await supabase
      .from("processing_jobs")
      .select("id, file_name, metadata")
      .in("id", jobIds);

    if (jobError) {
      console.error("Failed to load processing jobs", jobError);
      return new Response(JSON.stringify({ error: "Failed to load jobs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: analyses, error: analysisError } = await supabase
      .from("analysis_results")
      .select("job_id, ocr_text, vision_summary, vision_metadata")
      .in("job_id", jobIds);

    if (analysisError) {
      console.error("Failed to load analysis results", analysisError);
      return new Response(JSON.stringify({ error: "Failed to load analysis results" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analysisMap = new Map(analyses?.map(result => [result.job_id, result]));
    const contexts = (jobs ?? []).map(job => {
      const analysis = analysisMap.get(job.id);
      const text = typeof analysis?.ocr_text === "string" ? analysis.ocr_text : "";
      const visionSummary = analysis?.vision_summary ?? null;
      const tokenBase = `ctx://${job.id}`;
      const chunks = chunkText(text || visionSummary || "", 1200);

      return {
        jobId: job.id,
        fileName: job.file_name,
        stage: (job.metadata as Record<string, unknown> | null)?.job_stage ?? null,
        token: tokenBase,
        rawMetadata: job.metadata ?? null,
        chunks: chunks.map((chunk, index) => ({
          id: `${tokenBase}#chunk/${index + 1}`,
          content: chunk,
        })),
        summary: visionSummary,
        metadata: {
          textLength: text.length,
          visionMetadata: analysis?.vision_metadata ?? null,
          searchMode: "legacy" as const,
        },
      };
    });

    return new Response(JSON.stringify({ contexts, searchMode: "legacy" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("doc-context error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

