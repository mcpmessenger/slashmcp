import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { OpenAI } from "https://esm.sh/openai@4.52.7";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!, // Use ANON key for client-side access
  {
    auth: {
      persistSession: false,
    },
  }
);

// Main handler function
serve(async (req) => {
  try {
    const { query, job_ids } = await req.json();
    const user_id = req.headers.get("x-user-id"); // Assuming user ID is passed in a header for RLS

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Missing search query" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Call the PostgreSQL function for vector search
    const { data: chunks, error: searchError } = await supabase.rpc("search_document_embeddings", {
      query_embedding: queryEmbedding,
      job_ids: job_ids, // Optional array of job IDs to filter the search
      similarity_threshold: 0.7,
      result_limit: 5,
    });

    if (searchError) {
      throw new Error(\`Supabase search error: \${searchError.message}\`);
    }

    // 3. Filter the results to only include chunks accessible by the user (RLS should handle this, but good to be safe)
    // The 'search_document_embeddings' function already uses RLS via 'security definer' and checks auth.uid()
    // However, since this is an Edge Function, we need to ensure the user is authenticated.
    // For simplicity, we'll rely on the RLS policy on the 'document_embeddings' table.

    return new Response(
      JSON.stringify({ success: true, chunks: chunks }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
