import React, { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Image, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

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
    try {
      console.log("[DocumentsSidebar] loadDocuments called");
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
        console.error("[DocumentsSidebar] Error loading documents:", error);
        toast({
          title: "Error loading documents",
          description: error.message,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

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

      console.log("[DocumentsSidebar] Setting documents:", docs.length);
      setDocuments(docs);
    } catch (error) {
      console.error("[DocumentsSidebar] Error loading documents:", error);
    } finally {
      console.log("[DocumentsSidebar] Setting isLoading to false");
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log("[DocumentsSidebar] useEffect - initial load");
    loadDocuments().catch((error) => {
      console.error("[DocumentsSidebar] Initial load failed:", error);
    });
    
    // Refresh every 5 seconds to show status updates
    const interval = setInterval(() => {
      loadDocuments().catch((error) => {
        console.error("[DocumentsSidebar] Error refreshing documents:", error);
        // Don't show toast on every refresh error to avoid spam
      });
    }, 5000);
    
    return () => {
      console.log("[DocumentsSidebar] Cleanup - clearing interval");
      clearInterval(interval);
    };
  }, []);

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

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Documents & Knowledge</CardTitle>
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
              <button
                key={doc.jobId}
                onClick={() => onDocumentClick?.(doc.jobId)}
                className={cn(
                  "w-full text-left p-2 rounded-md border transition-colors",
                  "hover:bg-muted/50 hover:border-primary/50",
                  "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                )}
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

