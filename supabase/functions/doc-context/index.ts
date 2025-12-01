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

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

function chunkText(text: string, size = 1200): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
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

    if (!jobIds.length) {
      return new Response(JSON.stringify({ error: "jobIds must be a non-empty array" }), {
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
        },
      };
    });

    return new Response(JSON.stringify({ contexts }), {
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

