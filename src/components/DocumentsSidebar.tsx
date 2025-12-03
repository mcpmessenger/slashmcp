import React, { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Image, Loader2, CheckCircle2, XCircle, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { deleteProcessingJob } from "@/lib/api";

interface Document {
  jobId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: string;
  stage: string;
  createdAt: string;
  updatedAt: string;
}

export const DocumentsSidebar: React.FC<{ onDocumentClick?: (jobId: string) => void }> = ({ onDocumentClick }) => {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDocuments = async () => {
    console.log("[DocumentsSidebar] ===== loadDocuments START =====");
    console.log("[DocumentsSidebar] Current state:", { isLoading, documentCount: documents.length });
    
    try {
      console.log("[DocumentsSidebar] Setting isLoading to true");
      setIsLoading(true);
      
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      if (!session?.user) {
        console.log("[DocumentsSidebar] No session, clearing documents");
        setDocuments([]);
        setIsLoading(false);
        return;
      }

      console.log("[DocumentsSidebar] Querying documents for user:", session.user.id);
      const queryStartTime = Date.now();
      
      const { data, error } = await supabaseClient
        .from("processing_jobs")
        .select("id, file_name, file_type, file_size, status, metadata, created_at, updated_at")
        .eq("user_id", session.user.id)
        .eq("analysis_target", "document-analysis")
        .order("created_at", { ascending: false })
        .limit(50);

      const queryDuration = Date.now() - queryStartTime;
      console.log(`[DocumentsSidebar] Query completed in ${queryDuration}ms`, {
        hasError: !!error,
        documentCount: data?.length || 0,
      });

      if (error) {
        console.error("[DocumentsSidebar] Database query error:", error);
        console.error("[DocumentsSidebar] Error details:", JSON.stringify(error, null, 2));
        console.error("[DocumentsSidebar] Query was:", {
          table: "processing_jobs",
          filters: {
            user_id: session.user.id,
            analysis_target: "document-analysis",
          },
        });
        
        // CRITICAL: Always clear loading state on error
        setIsLoading(false);
        setDocuments([]);
        
        toast({
          title: "Error loading documents",
          description: error.message || "Failed to load documents. Check console for details.",
          variant: "destructive",
        });
        return;
      }

      console.log("[DocumentsSidebar] Raw data from query:", {
        dataLength: data?.length || 0,
        firstItem: data?.[0] ? {
          id: data[0].id,
          file_name: data[0].file_name,
          status: data[0].status,
          user_id: (data[0] as any).user_id, // Log user_id if available
          analysis_target: (data[0] as any).analysis_target, // Log analysis_target if available
        } : null,
      });

      const docs = (data || []).map((job: any) => {
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

      console.log("[DocumentsSidebar] Setting documents:", docs.length, {
        documents: docs.map(d => ({ fileName: d.fileName, status: d.status, stage: d.stage })),
      });
      
      // CRITICAL: Always set documents and clear loading, even if empty
      setDocuments(docs);
      setIsLoading(false);
      
      if (docs.length === 0) {
        console.warn("[DocumentsSidebar] No documents found. Query filters:", {
          userId: session.user.id,
          analysisTarget: "document-analysis",
        });
        console.warn("[DocumentsSidebar] This might indicate:");
        console.warn("  1. No documents uploaded yet");
        console.warn("  2. Documents have different user_id");
        console.warn("  3. Documents have different analysis_target");
        console.warn("  4. RLS policies blocking the query");
      }
    } catch (error) {
      console.error("[DocumentsSidebar] Error loading documents:", error);
      console.error("[DocumentsSidebar] Error details:", JSON.stringify(error, null, 2));
      // CRITICAL: Always clear loading state even on error
      setIsLoading(false);
      setDocuments([]); // Clear documents on error
      
      // Show error toast
      toast({
        title: "Error loading documents",
        description: error instanceof Error ? error.message : "Failed to load documents. Check console for details.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    console.log("[DocumentsSidebar] ===== useEffect MOUNTED =====");
    console.log("[DocumentsSidebar] Component mounted, starting initial load");
    
    // Immediate load
    loadDocuments().catch((error) => {
      console.error("[DocumentsSidebar] CRITICAL: Initial load failed:", error);
      console.error("[DocumentsSidebar] Error stack:", error instanceof Error ? error.stack : "No stack");
      // Ensure loading state is cleared even if loadDocuments throws
      setIsLoading(false);
      setDocuments([]);
    });
    
    // Refresh every 5 seconds to show status updates
    const interval = setInterval(() => {
      console.log("[DocumentsSidebar] Interval refresh triggered");
      loadDocuments().catch((error) => {
        console.error("[DocumentsSidebar] Error refreshing documents:", error);
        // Don't show toast on every refresh error to avoid spam
        setIsLoading(false);
      });
    }, 5000);
    
    return () => {
      console.log("[DocumentsSidebar] Cleanup - clearing interval and resetting state");
      clearInterval(interval);
      setIsLoading(false);
    };
  }, []); // Empty deps - only run on mount

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "processing":
      case "queued":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getFileIcon = (fileType: string, fileName: string) => {
    if (fileType.startsWith("image/") || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return <Image className="h-5 w-5" />;
    }
    return <FileText className="h-5 w-5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDelete = async (jobId: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering document click
    
    if (!confirm(`Delete "${fileName}"? This will remove the job and all associated data.`)) {
      return;
    }

    setDeletingJobIds(prev => new Set(prev).add(jobId));
    
    try {
      await deleteProcessingJob(jobId, true); // Delete S3 file too
      toast({
        title: "Document deleted",
        description: `"${fileName}" has been deleted.`,
      });
      // Remove from local state immediately
      setDocuments(prev => prev.filter(doc => doc.jobId !== jobId));
    } catch (error) {
      console.error("Failed to delete job:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete document.",
        variant: "destructive",
      });
    } finally {
      setDeletingJobIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleBulkDeleteFailed = async () => {
    const failedJobs = documents.filter(doc => doc.status === "failed");
    if (failedJobs.length === 0) {
      toast({
        title: "No failed jobs",
        description: "There are no failed jobs to delete.",
      });
      return;
    }

    if (!confirm(`Delete ${failedJobs.length} failed job(s)? This cannot be undone.`)) {
      return;
    }

    const jobIdsToDelete = new Set(failedJobs.map(doc => doc.jobId));
    setDeletingJobIds(jobIdsToDelete);

    try {
      await Promise.all(
        failedJobs.map(doc => deleteProcessingJob(doc.jobId, true))
      );
      toast({
        title: "Failed jobs deleted",
        description: `Deleted ${failedJobs.length} failed job(s).`,
      });
      // Remove from local state
      setDocuments(prev => prev.filter(doc => doc.status !== "failed"));
    } catch (error) {
      console.error("Failed to delete failed jobs:", error);
      toast({
        title: "Bulk delete failed",
        description: error instanceof Error ? error.message : "Failed to delete some jobs.",
        variant: "destructive",
      });
    } finally {
      setDeletingJobIds(new Set());
    }
  };

  const failedCount = documents.filter(doc => doc.status === "failed").length;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Documents & Knowledge</CardTitle>
          <div className="flex items-center gap-1">
            {failedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBulkDeleteFailed}
                disabled={isLoading || deletingJobIds.size > 0}
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                title={`Delete ${failedCount} failed job(s)`}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear Failed
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={loadDocuments}
              disabled={isLoading}
              className="h-6 px-2 text-xs"
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        {isLoading && documents.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No documents yet</p>
            <p className="text-xs mt-1">Upload files via chat</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
            {documents.map((doc) => (
              <div
                key={doc.jobId}
                className={cn(
                  "w-full p-2 rounded-md border transition-colors group",
                  "hover:bg-muted/50 hover:border-primary/50",
                )}
              >
                <button
                  onClick={() => onDocumentClick?.(doc.jobId)}
                  className="w-full text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex-shrink-0">
                      {getFileIcon(doc.fileType, doc.fileName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" title={doc.fileName}>
                        {doc.fileName}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusIcon(doc.status)}
                        <span className="text-[10px] text-muted-foreground">
                          {doc.status}
                          {doc.stage !== "unknown" && ` • ${doc.stage}`}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatFileSize(doc.fileSize)}
                      </p>
                    </div>
                  </div>
                </button>
                <div className="flex justify-end mt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDelete(doc.jobId, doc.fileName, e)}
                    disabled={deletingJobIds.has(doc.jobId)}
                    className={cn(
                      "h-5 px-1.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity",
                      "text-destructive hover:text-destructive hover:bg-destructive/10"
                    )}
                    title="Delete document"
                  >
                    {deletingJobIds.has(doc.jobId) ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

