export type JobStatus = "uploading" | "queued" | "processing" | "completed" | "failed";

export const JOB_STAGES = ["registered", "uploaded", "processing", "extracted", "indexed", "injected", "failed"] as const;
export type JobStage = typeof JOB_STAGES[number];

export type StageHistoryEntry = { stage: JobStage; at: string };

export interface UploadJob {
  id: string;
  fileName: string;
  status: JobStatus;
  message?: string | null;
  error?: string | null;
  resultText?: string | null;
  updatedAt?: string;
  visionSummary?: string | null;
  visionProvider?: "gpt4o" | "gemini" | null;
  visionMetadata?: Record<string, unknown> | null;
  stage?: JobStage;
  stageHistory?: StageHistoryEntry[];
  injectedAt?: string;
  extractedAt?: string;
  contentLength?: number | null;
}

function parseStageHistory(metadata?: Record<string, unknown> | null): StageHistoryEntry[] | undefined {
  const history = (metadata as Record<string, unknown> | null | undefined)?.job_stage_history;
  if (!Array.isArray(history)) return undefined;

  const parsed = history
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

  return parsed.length > 0 ? parsed : undefined;
}

export function parseStageMetadata(
  metadata?: Record<string, unknown> | null,
): Pick<UploadJob, "stage" | "stageHistory" | "injectedAt" | "extractedAt" | "contentLength"> {
  if (!metadata) return {};

  const metaRecord = metadata as Record<string, unknown>;
  const stage = JOB_STAGES.includes(metaRecord.job_stage as JobStage)
    ? (metaRecord.job_stage as JobStage)
    : undefined;
  const stageHistory = parseStageHistory(metaRecord);
  const injectedAt = typeof metaRecord.injected_at === "string" ? metaRecord.injected_at : undefined;
  const extractedAt = typeof metaRecord.extracted_at === "string" ? metaRecord.extracted_at : undefined;
  const contentLength =
    typeof metaRecord.content_length === "number" ? (metaRecord.content_length as number) : undefined;

  const result: Pick<UploadJob, "stage" | "stageHistory" | "injectedAt" | "extractedAt" | "contentLength"> = {};
  if (stage) result.stage = stage;
  if (stageHistory) result.stageHistory = stageHistory;
  if (injectedAt) result.injectedAt = injectedAt;
  if (extractedAt) result.extractedAt = extractedAt;
  if (typeof contentLength === "number") result.contentLength = contentLength;
  return result;
}

