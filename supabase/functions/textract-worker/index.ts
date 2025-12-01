import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { Database } from "../_shared/database.types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface WorkerPayload {
  jobId?: string;
}

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AWS_REGION = Deno.env.get("AWS_REGION") ?? Deno.env.get("AWS_DEFAULT_REGION");
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
const AWS_SESSION_TOKEN = Deno.env.get("AWS_SESSION_TOKEN");
const AWS_S3_BUCKET = Deno.env.get("AWS_S3_BUCKET");

const encoder = new TextEncoder();
const JOB_STAGES = ["registered", "uploaded", "processing", "extracted", "injected", "failed"] as const;
type JobStage = typeof JOB_STAGES[number];
type StageHistoryEntry = { stage: JobStage; at: string };

function parseStageHistory(metadata?: Record<string, unknown> | null): StageHistoryEntry[] {
  if (!metadata) return [];
  const raw = (metadata as Record<string, unknown>).job_stage_history;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (entry && typeof entry === "object" && "stage" in entry && "at" in entry) {
        const stage = (entry as Record<string, unknown>).stage;
        const at = (entry as Record<string, unknown>).at;
        if (JOB_STAGES.includes(stage as JobStage) && typeof at === "string") {
          return { stage: stage as JobStage, at };
        }
      }
      return null;
    })
    .filter((entry): entry is StageHistoryEntry => Boolean(entry));
}

function withJobStage(
  metadata: Record<string, unknown> | null | undefined,
  stage: JobStage,
  extra: Record<string, unknown> = {},
) {
  const base = { ...(metadata ?? {}) } as Record<string, unknown>;
  const history = parseStageHistory(base);
  const lastEntry = history[history.length - 1];
  const timestamp = new Date().toISOString();
  const nextHistory =
    lastEntry && lastEntry.stage === stage ? history : [...history, { stage, at: timestamp }].slice(-25);

  return {
    ...base,
    ...extra,
    job_stage: stage,
    job_stage_history: nextHistory,
    job_stage_updated_at: timestamp,
  };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(payload: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(payload));
  return toHex(hashBuffer);
}

async function hmacSha256(key: string | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const keyData = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizeHeaderValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function awsSignedFetch({
  service,
  region,
  method,
  path,
  query = {},
  headers = {},
  body = "",
}: {
  service: string;
  region: string;
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: string;
}): Promise<Response> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials are not configured");
  }

  const host = `${service}.${region}.amazonaws.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const payload = body ?? "";
  const payloadHash = await sha256Hex(payload);

  const queryEntries = Object.entries(query)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value as string)])
    .sort(([aKey], [bKey]) => aKey.localeCompare(bKey));

  const canonicalQuery = queryEntries.map(([key, value]) => `${key}=${value}`).join("&");

  const headerEntries: [string, string][] = [
    ["host", host],
    ["x-amz-date", amzDate],
    ["x-amz-content-sha256", payloadHash],
  ];

  if (AWS_SESSION_TOKEN) {
    headerEntries.push(["x-amz-security-token", AWS_SESSION_TOKEN]);
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      headerEntries.push([key.toLowerCase(), normalizeHeaderValue(value)]);
    }
  }

  headerEntries.sort(([a], [b]) => a.localeCompare(b));

  const canonicalHeaders = headerEntries.map(([key, value]) => `${key}:${value}`).join("\n") + "\n";
  const signedHeaders = headerEntries.map(([key]) => key).join(";");

  const canonicalRequest = [
    method.toUpperCase(),
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmacSha256(`AWS4${AWS_SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders = new Headers();
  headerEntries.forEach(([key, value]) => requestHeaders.set(key, value));
  requestHeaders.set("Authorization", authorization);

  const url = `https://${host}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  return fetch(url, {
    method,
    headers: requestHeaders,
    body: payload.length > 0 ? payload : undefined,
  });
}

async function textractRequest(target: string, payload: Record<string, unknown>) {
  if (!AWS_REGION) throw new Error("AWS region is not configured");
  const body = JSON.stringify(payload);
  const response = await awsSignedFetch({
    service: "textract",
    region: AWS_REGION,
    method: "POST",
    path: "/",
    headers: {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": `Textract.${target}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Textract ${target} failed: ${response.status} ${text}`);
  }

  return response.json();
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

async function markJobFailed(jobId: string, reason: string, metadata?: Record<string, unknown> | null) {
  if (!supabase) return;
  const nextMetadata = withJobStage(metadata, "failed", {
    error: reason,
    failed_at: new Date().toISOString(),
  });
  await supabase
    .from("processing_jobs")
    .update({ status: "failed", metadata: nextMetadata })
    .eq("id", jobId);
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

  if (!supabase || !AWS_S3_BUCKET || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let currentJobId: string | undefined;
  let currentJobMetadata: Record<string, unknown> | null = null;

  try {
    const payload: WorkerPayload = await req.json();
    if (!payload.jobId) {
      return new Response(JSON.stringify({ error: "jobId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    currentJobId = payload.jobId;

    const { data: job, error } = await supabase
      .from("processing_jobs")
      .select("*")
      .eq("id", payload.jobId)
      .single();

    if (error || !job) {
      console.error("Unable to load job", error);
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let jobMetadata = (job.metadata as Record<string, unknown> | null) ?? null;
    currentJobMetadata = jobMetadata;

    if (job.status !== "queued") {
      return new Response(JSON.stringify({ message: "Job already processed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    jobMetadata = withJobStage(jobMetadata, "processing");
    await supabase
      .from("processing_jobs")
      .update({ status: "processing", metadata: jobMetadata })
      .eq("id", job.id);

    // Allow CSV files for document-analysis even though they don't use Textract
    const isCsv = job.file_type === "text/csv" || 
                  job.file_type === "application/vnd.ms-excel" ||
                  job.file_name?.toLowerCase().endsWith(".csv") ||
                  job.file_name?.toLowerCase().endsWith(".tsv");
    
    if (!isCsv && job.analysis_target !== "document-analysis" && job.analysis_target !== "image-ocr") {
      await markJobFailed(job.id, `Unsupported analysis_target: ${job.analysis_target}`, jobMetadata);
      return new Response(JSON.stringify({ error: "Unsupported analysis target" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!job.storage_path) {
      await markJobFailed(job.id, "storage_path is not set", jobMetadata);
      return new Response(JSON.stringify({ error: "Job missing storage path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extractedText = "";
    let rawResponse: unknown = null;

    const isPdf = job.file_type === "application/pdf";
    const isCsv = job.file_type === "text/csv" || 
                  job.file_type === "application/vnd.ms-excel" ||
                  job.file_name?.toLowerCase().endsWith(".csv") ||
                  job.file_name?.toLowerCase().endsWith(".tsv");

    // Handle CSV/TSV files - read directly from S3
    if (isCsv) {
      try {
        // Get presigned URL to read the file from S3
        const s3Url = await createPresignedGetUrl({
          bucket: AWS_S3_BUCKET,
          key: job.storage_path,
          region: AWS_REGION,
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
          sessionToken: AWS_SESSION_TOKEN ?? undefined,
        });

        // Fetch the CSV content
        const fileResponse = await fetch(s3Url);
        if (!fileResponse.ok) {
          throw new Error(`Failed to fetch file from S3: ${fileResponse.statusText}`);
        }

        // Read the file content as text
        extractedText = await fileResponse.text();
        
        // Limit size to prevent token limits (keep first 500KB of text)
        if (extractedText.length > 500000) {
          extractedText = extractedText.slice(0, 500000) + "\n\n[... file truncated, showing first 500KB ...]";
        }

        rawResponse = { type: "csv", size: extractedText.length };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to read CSV file";
        await markJobFailed(job.id, message, jobMetadata);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (isPdf) {
      const startResponse = await textractRequest("StartDocumentTextDetection", {
        DocumentLocation: {
          S3Object: {
            Bucket: AWS_S3_BUCKET,
            Name: job.storage_path,
          },
        },
      });

      const jobId = startResponse.JobId;
      if (!jobId) {
        await markJobFailed(job.id, "Textract did not return a JobId", jobMetadata);
        return new Response(JSON.stringify({ error: "Textract job initiation failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let jobStatus = "IN_PROGRESS";
      let nextToken: string | undefined;
      const lines: string[] = [];

      for (let attempt = 0; attempt < 12 && jobStatus === "IN_PROGRESS"; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1500 : 4000));

        const detectionResponse = await textractRequest("GetDocumentTextDetection", {
          JobId: jobId,
          NextToken: nextToken,
          MaxResults: 1000,
        });

        jobStatus = detectionResponse.JobStatus ?? "FAILED";
        rawResponse = detectionResponse;

        if (jobStatus === "SUCCEEDED") {
          detectionResponse.Blocks?.forEach((block: any) => {
            if (block.BlockType === "LINE" && block.Text) {
              lines.push(block.Text);
            }
          });
          nextToken = detectionResponse.NextToken;
          if (!nextToken) {
            break;
          }
        } else if (jobStatus === "FAILED") {
          const reason = detectionResponse.StatusMessage ?? "Textract reported failure";
          await markJobFailed(job.id, reason, jobMetadata);
          return new Response(JSON.stringify({ error: reason }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (!lines.length) {
        await markJobFailed(job.id, "No text extracted from document", jobMetadata);
        return new Response(JSON.stringify({ error: "No text extracted" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      extractedText = lines.join("\n");
    } else {
      const detectResponse = await textractRequest("DetectDocumentText", {
        Document: {
          S3Object: {
            Bucket: AWS_S3_BUCKET,
            Name: job.storage_path,
          },
        },
      });

      rawResponse = detectResponse;

      const lines: string[] = [];
      detectResponse.Blocks?.forEach((block: any) => {
        if (block.BlockType === "LINE" && block.Text) {
          lines.push(block.Text);
        }
      });

      if (!lines.length) {
        await markJobFailed(job.id, "No text detected in image", jobMetadata);
        return new Response(JSON.stringify({ error: "No text detected" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      extractedText = lines.join("\n");
    }

    const { error: resultError } = await supabase.from("analysis_results").insert({
      job_id: job.id,
      ocr_text: extractedText,
      textract_response: rawResponse as Record<string, unknown>,
    });

    if (resultError) {
      await markJobFailed(job.id, "Failed to persist analysis result", jobMetadata);
      console.error("Failed to insert analysis result", resultError);
      return new Response(JSON.stringify({ error: "Failed to persist result" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    jobMetadata = withJobStage(jobMetadata, "extracted", {
      extracted_at: new Date().toISOString(),
      content_length: extractedText.length,
    });

    await supabase
      .from("processing_jobs")
      .update({ status: "completed", metadata: jobMetadata })
      .eq("id", job.id);

    return new Response(JSON.stringify({ status: "completed", jobId: job.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("textract-worker error", error);
    if (supabase && currentJobId) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await markJobFailed(currentJobId, message, currentJobMetadata);
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

