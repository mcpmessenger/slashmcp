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
const JOB_STAGES = ["registered", "uploaded", "processing", "extracted", "indexed", "injected", "failed"] as const;
type JobStage = typeof JOB_STAGES[number];
type StageHistoryEntry = { stage: JobStage; at: string };

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// Semantic chunking function with overlap and boundary preservation
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

// Generate embeddings using OpenAI API with batching and retry logic
async function generateEmbeddings(
  texts: string[],
  apiKey: string,
  maxRetries: number = 3,
  startTime?: number,
  totalTimeoutMs: number = 300_000, // 5 minutes total timeout
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const embeddings: number[][] = [];
  const batchSize = 100; // OpenAI allows up to 2048 inputs per request, but we'll use smaller batches
  const batchTimeoutMs = 30_000; // 30 seconds per batch
  const processStartTime = startTime ?? Date.now();

  for (let i = 0; i < texts.length; i += batchSize) {
    // Check overall timeout before processing each batch
    const elapsed = Date.now() - processStartTime;
    if (elapsed > totalTimeoutMs) {
      console.warn(`Embedding generation exceeded total timeout (${totalTimeoutMs}ms), processed ${i}/${texts.length} chunks`);
      throw new Error(`Embedding generation timeout: processed ${i}/${texts.length} chunks in ${elapsed}ms`);
    }

    const batch = texts.slice(i, i + batchSize);
    let retries = 0;
    let success = false;

    while (retries < maxRetries && !success) {
      // Add timeout to each API call
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, batchTimeoutMs);

      try {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: batch,
          }),
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = response.headers.get("retry-after");
            const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, retries) * 1000;
            console.log(`Rate limited, waiting ${delay}ms before retry ${retries + 1}/${maxRetries}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            retries++;
            continue;
          }
          throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error("Invalid response format from OpenAI API");
        }

        const batchEmbeddings = data.data
          .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
          .map((item: { embedding: number[] }) => item.embedding);

        embeddings.push(...batchEmbeddings);
        success = true;

        // Small delay between batches to avoid rate limits
        if (i + batchSize < texts.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          clearTimeout(timeoutId);
          console.error(`Embedding batch ${i / batchSize + 1} timed out after ${batchTimeoutMs}ms`);
          throw new Error(`Embedding batch timeout: batch ${i / batchSize + 1} exceeded ${batchTimeoutMs}ms`);
        }
        clearTimeout(timeoutId);
        retries++;
        if (retries >= maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, retries) * 1000;
        console.error(`Embedding generation error, retrying in ${delay}ms:`, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Log progress for large documents
    if ((i + batchSize) % 500 === 0 || i + batchSize >= texts.length) {
      const progress = ((i + batchSize) / texts.length * 100).toFixed(1);
      const elapsed = Date.now() - processStartTime;
      console.log(`Embedding progress: ${i + batchSize}/${texts.length} chunks (${progress}%) in ${elapsed}ms`);
    }
  }

  return embeddings;
}

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

async function createPresignedGetUrl(options: {
  bucket: string;
  key: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  expiresIn?: number;
}): Promise<string> {
  const { bucket, key, region, accessKeyId, secretAccessKey, sessionToken, expiresIn = 300 } = options;

  const host = region === "us-east-1"
    ? `${bucket}.s3.amazonaws.com`
    : `${bucket}.s3.${region}.amazonaws.com`;

  const encodedKey = key.split("/").map((segment) => encodeRfc3986(segment)).join("/");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

  const signedHeaders = "host";
  const queryEntries: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresIn)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];

  if (sessionToken) {
    queryEntries.push(["X-Amz-Security-Token", sessionToken]);
  }

  const canonicalQuery = queryEntries
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .sort()
    .join("&");

  const canonicalHeaders = `host:${host}\n`;

  const canonicalRequest = [
    "GET",
    `/${encodedKey}`,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, "s3");
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return `https://${host}/${encodedKey}?${finalQuery}`;
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
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
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

  // Track overall execution time to prevent Supabase timeout (60s default, allow 50s for processing)
  const WORKER_TIMEOUT_MS = 50_000; // 50 seconds before Supabase timeout
  const workerStartTime = Date.now();

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

    // Indexing step: Generate embeddings and store in document_embeddings table
    try {
      if (OPENAI_API_KEY && extractedText.trim().length > 0) {
        console.log(`Starting indexing for job ${job.id}, text length: ${extractedText.length}`);

        // Chunk the extracted text using semantic chunking
        const chunks = chunkTextSemantic(extractedText, 2000, 150);
        console.log(`Created ${chunks.length} chunks for indexing`);

        if (chunks.length > 0) {
          // Generate embeddings for all chunks with timeout tracking
          const chunkTexts = chunks.map((chunk) => chunk.text);
          const embeddingStartTime = Date.now();
          const embeddings = await generateEmbeddings(chunkTexts, OPENAI_API_KEY, 3, embeddingStartTime);

          if (embeddings.length !== chunks.length) {
            throw new Error(`Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`);
          }

          // Prepare batch insert data
          const embeddingRows = chunks.map((chunk, index) => ({
            job_id: job.id,
            chunk_text: chunk.text,
            embedding: `[${embeddings[index].join(",")}]`, // Convert array to PostgreSQL vector format
            chunk_index: index,
            metadata: {
              charPosition: chunk.metadata.charPosition,
              estimatedTokens: chunk.metadata.estimatedTokens,
              contentLength: chunk.text.length,
            },
          }));

          // Batch insert embeddings (Supabase handles batching internally with insert)
          const { error: embeddingError } = await supabase
            .from("document_embeddings")
            .insert(embeddingRows);

          if (embeddingError) {
            console.error("Failed to insert embeddings:", embeddingError);
            // Don't fail the job, just log the error - job remains at "extracted" stage
            // This allows fallback to old prompt injection system
          } else {
            // Calculate embedding cost (text-embedding-3-small: $0.00002 per 1K tokens)
            // Rough estimate: ~4 chars per token
            const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.metadata.estimatedTokens, 0);
            const embeddingCost = (totalTokens / 1000) * 0.00002;

            // Update job stage to "indexed"
            jobMetadata = withJobStage(jobMetadata, "indexed", {
              indexed_at: new Date().toISOString(),
              total_chunks: chunks.length,
              embedding_cost: embeddingCost,
              embedding_model: "text-embedding-3-small",
            });

            await supabase
              .from("processing_jobs")
              .update({ metadata: jobMetadata })
              .eq("id", job.id);

            console.log(`Successfully indexed job ${job.id} with ${chunks.length} chunks`);
          }
        }
      } else {
        console.log(`Skipping indexing for job ${job.id}: ${!OPENAI_API_KEY ? "API key not configured" : "no text extracted"}`);
      }
    } catch (indexingError) {
      // Log error but don't fail the job - allow fallback to old system
      console.error(`Indexing failed for job ${job.id}:`, indexingError);
      // Job remains at "extracted" stage, can use old prompt injection
    }

    // Check overall timeout before returning
    const elapsed = Date.now() - workerStartTime;
    if (elapsed > WORKER_TIMEOUT_MS) {
      console.warn(`Worker exceeded timeout (${WORKER_TIMEOUT_MS}ms), elapsed: ${elapsed}ms`);
      // Job may be partially processed, but we return success to avoid double-processing
    }

    return new Response(JSON.stringify({ status: "completed", jobId: job.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("textract-worker error", error);
    
    // Check if error is due to timeout
    const elapsed = Date.now() - workerStartTime;
    if (elapsed > WORKER_TIMEOUT_MS) {
      const timeoutError = `Worker timeout after ${elapsed}ms (limit: ${WORKER_TIMEOUT_MS}ms)`;
      console.error(timeoutError);
      if (supabase && currentJobId) {
        await markJobFailed(currentJobId, timeoutError, currentJobMetadata);
      }
      return new Response(JSON.stringify({ error: timeoutError }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
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

