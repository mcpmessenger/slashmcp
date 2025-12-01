import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { Database } from "../_shared/database.types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
};

type AnalysisTarget = "document-analysis" | "image-ocr" | "image-generation" | "audio-transcription";

interface UploadRequestBody {
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  analysisTarget?: AnalysisTarget;
  metadata?: Record<string, unknown>;
  userId?: string;
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

async function createPresignedPutUrl(options: {
  bucket: string;
  key: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  expiresIn?: number;
  contentType?: string;
}): Promise<string> {
  const {
    bucket,
    key,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    expiresIn = 900,
    contentType,
  } = options;

  const host = region === "us-east-1"
    ? `${bucket}.s3.amazonaws.com`
    : `${bucket}.s3.${region}.amazonaws.com`;

  const encodedKey = key.split("/").map((segment) => encodeRfc3986(segment)).join("/");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

  const signedHeaders = contentType ? "content-type;host" : "host";
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

  const canonicalHeaders = contentType
    ? `content-type:${contentType}\nhost:${host}\n`
    : `host:${host}\n`;

  const canonicalRequest = [
    "PUT",
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

if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL environment variable");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
}
if (!AWS_REGION) {
  console.error("Missing AWS_REGION environment variable");
}
if (!AWS_S3_BUCKET) {
  console.error("Missing AWS_S3_BUCKET environment variable");
}
if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error("Missing AWS credentials environment variables");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

function validateRequestBody(body: UploadRequestBody): asserts body is Required<Pick<UploadRequestBody, "fileName" | "fileType" | "fileSize" | "analysisTarget">> & UploadRequestBody {
  if (!body.fileName) throw new Error("fileName is required");
  if (!body.fileType) throw new Error("fileType is required");
  if (typeof body.fileSize !== "number") throw new Error("fileSize is required");
  if (!body.analysisTarget) throw new Error("analysisTarget is required");
}

function normalizeStageHistory(metadata: Record<string, unknown> | null | undefined): StageHistoryEntry[] {
  const rawHistory = (metadata as Record<string, unknown> | null | undefined)?.job_stage_history;
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
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
  const existingHistory = normalizeStageHistory(base);
  const lastEntry = existingHistory[existingHistory.length - 1];
  const timestamp = new Date().toISOString();

  const nextHistory =
    lastEntry && lastEntry.stage === stage
      ? existingHistory
      : [...existingHistory, { stage, at: timestamp }].slice(-25);

  return {
    ...base,
    ...extra,
    job_stage: stage,
    job_stage_history: nextHistory,
    job_stage_updated_at: timestamp,
  };
}

function isValidStage(stage: unknown): stage is JobStage {
  return typeof stage === "string" && JOB_STAGES.includes(stage as JobStage);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "PATCH") {
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

  try {
    if (req.method === "PATCH") {
      const body = await req.json();
      const jobId = body?.jobId;
      const stage = body?.stage;

      if (typeof jobId !== "string" || !jobId) {
        return new Response(JSON.stringify({ error: "jobId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isValidStage(stage)) {
        return new Response(JSON.stringify({ error: "Invalid stage value" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: job, error: jobError } = await supabase
        .from("processing_jobs")
        .select("metadata")
        .eq("id", jobId)
        .single();

      if (jobError || !job) {
        console.error("Failed to load job for stage update", jobError);
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updatedMetadata = withJobStage(job.metadata ?? null, stage);
      if (stage === "uploaded") {
        updatedMetadata.uploaded_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from("processing_jobs")
        .update({ metadata: updatedMetadata })
        .eq("id", jobId);

      if (updateError) {
        console.error("Failed to update job stage", updateError);
        return new Response(JSON.stringify({ error: "Failed to update job stage" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          jobId,
          stage,
          metadata: updatedMetadata,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body: UploadRequestBody = await req.json();
    validateRequestBody(body);

    const storagePath = `incoming/${crypto.randomUUID()}-${body.fileName}`;
    const uploadUrl = await createPresignedPutUrl({
      bucket: AWS_S3_BUCKET,
      key: storagePath,
      region: AWS_REGION,
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      sessionToken: AWS_SESSION_TOKEN ?? undefined,
      contentType: body.fileType,
    });

    const { data, error } = await supabase
      .from("processing_jobs")
      .insert({
        file_name: body.fileName,
        file_type: body.fileType,
        file_size: body.fileSize,
        analysis_target: body.analysisTarget,
        status: "queued",
        storage_path: storagePath,
        metadata: withJobStage(body.metadata ?? null, "registered"),
        user_id: body.userId ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to insert processing job", error);
      return new Response(JSON.stringify({ error: "Failed to register job" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        jobId: data.id,
        storagePath,
        uploadUrl,
        message: "Upload registered. Upload file using provided URL.",
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("uploads function error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

