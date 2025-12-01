import React from "react";
import { cn } from "@/lib/utils";

type JobStatus = "uploading" | "queued" | "processing" | "completed" | "failed";

interface UploadJob {
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
}

interface FileUploadStatusProps {
  jobs: UploadJob[];
  isRegisteringUpload: boolean;
  className?: string;
}

export function FileUploadStatus({ jobs, isRegisteringUpload, className }: FileUploadStatusProps) {
  if (jobs.length === 0 && !isRegisteringUpload) {
    return null;
  }

  return (
    <div className={cn("px-4 pb-2 space-y-2", className)}>
      <div className="text-xs font-semibold text-foreground/70 uppercase tracking-wide mb-2">
        File Uploads
      </div>
      {jobs.map(job => (
        <div
          key={job.id}
          className="rounded-lg border border-border/40 bg-muted/40 px-3 py-2.5 text-xs text-foreground/80"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="font-medium text-sm truncate">{job.fileName}</span>
              {job.message && <span className="text-foreground/60 text-xs">{job.message}</span>}
              {job.updatedAt && (
                <span className="text-foreground/50 text-xs">
                  Updated {new Date(job.updatedAt).toLocaleTimeString()}
                </span>
              )}
              {job.error && <span className="text-destructive text-xs">{job.error}</span>}
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide shrink-0",
                job.status === "completed" && "bg-emerald-500/20 text-emerald-500",
                job.status === "processing" && "bg-amber-500/20 text-amber-500",
                job.status === "failed" && "bg-destructive/20 text-destructive",
                job.status === "queued" && "bg-primary/10 text-primary",
                job.status === "uploading" && "bg-sky-500/20 text-sky-500",
              )}
            >
              {job.status}
            </span>
          </div>
          {job.resultText && (
            <div className="mt-2 rounded-md bg-background/80 p-2 text-foreground/90 shadow-inner">
              <p className="font-medium mb-1 text-foreground/80 text-xs">Extracted Text</p>
              <pre className="whitespace-pre-wrap break-words text-xs text-foreground/70 max-h-32 overflow-y-auto">
                {job.resultText}
              </pre>
            </div>
          )}
          {job.visionSummary && (
            <div className="mt-2 rounded-md bg-background/80 p-2 text-foreground/90 shadow-inner space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground/80 text-xs">Visual Summary</p>
                {job.visionProvider && (
                  <span className="text-[0.65rem] uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {job.visionProvider}
                  </span>
                )}
              </div>
              <p className="text-xs text-foreground/75 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                {job.visionSummary}
              </p>
              {job.visionMetadata &&
                Array.isArray(job.visionMetadata["bullet_points"]) &&
                (job.visionMetadata["bullet_points"] as string[]).length > 0 && (
                  <ul className="list-disc ml-4 space-y-1 text-xs text-foreground/70">
                    {(job.visionMetadata["bullet_points"] as string[]).map((point, idx) => (
                      <li key={idx}>{point}</li>
                    ))}
                  </ul>
                )}
              {job.visionMetadata && job.visionMetadata["chart_analysis"] && (
                <div className="text-xs text-foreground/60">
                  <span className="font-medium text-foreground/70">Chart analysis:</span>{" "}
                  {job.visionMetadata["chart_analysis"]}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {isRegisteringUpload && (
        <div className="rounded-lg border border-dashed border-border/40 bg-muted/20 px-3 py-2 text-xs text-foreground/60">
          Registering upload...
        </div>
      )}
    </div>
  );
}

