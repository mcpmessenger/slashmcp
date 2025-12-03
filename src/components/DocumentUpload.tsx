import React, { useState, useCallback, useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { uploadAndProcessDocument, getJobStatus } from "@/lib/ragService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Upload, FileText, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const DocumentUpload: React.FC = () => {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
      setJobId(null);
      setJobStatus(null);
    }
  };

  const stopPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [pollingInterval]);

  const startPolling = (jobIdToPoll: string) => {
    // Clear any existing polling
    stopPolling();

    const intervalId = setInterval(async () => {
      try {
        const statusResponse = await getJobStatus(jobIdToPoll);
        const status = statusResponse.job.status;
        setJobStatus(status);

        const metadata = statusResponse.job.metadata as Record<string, unknown> | null;
        const stage = metadata?.job_stage as string | undefined;

        if (status === "completed") {
          stopPolling();
          setIsUploading(false);
          toast({
            title: "Document Processing Complete",
            description: `Document "${statusResponse.job.file_name}" has been processed and is ready for search.`,
          });
        } else if (status === "failed") {
          stopPolling();
          setIsUploading(false);
          toast({
            title: "Document Processing Failed",
            description: `Failed to process document "${statusResponse.job.file_name}".`,
            variant: "destructive",
          });
        } else {
          // Update status display
          const statusMessage = stage ? `${status} (${stage})` : status;
          setJobStatus(statusMessage);
        }
      } catch (error) {
        console.error("Error polling job status:", error);
        // Continue polling on error (might be transient)
      }
    }, 3000); // Poll every 3 seconds

    setPollingInterval(intervalId);
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload.",
        variant: "destructive",
      });
      return;
    }

    // Check if user is authenticated
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();

    if (!session?.user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to upload documents.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setJobStatus("uploading");

    try {
      const newJobId = await uploadAndProcessDocument(file, session.user.id);
      setJobId(newJobId);
      setJobStatus("processing");
      toast({
        title: "Upload Successful",
        description: `Processing job started. Document will be available for search once processing completes.`,
      });
      startPolling(newJobId);
    } catch (error) {
      console.error("Upload error:", error);
      setIsUploading(false);
      setJobStatus("failed");
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload and process document.",
        variant: "destructive",
      });
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const getStatusIcon = () => {
    if (!jobStatus) return null;
    if (jobStatus === "completed") {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    if (jobStatus === "failed") {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    if (isUploading) {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    }
    return null;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Upload Document for Semantic Search
        </CardTitle>
        <CardDescription>
          Upload PDFs, images, or text files to enable semantic search and RAG-powered question answering.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="file"
            onChange={handleFileChange}
            disabled={isUploading}
            accept=".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg,.csv"
            className="flex-1"
          />
          <Button onClick={handleUpload} disabled={!file || isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload & Process
              </>
            )}
          </Button>
        </div>

        {file && (
          <div className="text-sm text-muted-foreground">
            <p>
              Selected file: <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(2)} KB)
            </p>
          </div>
        )}

        {jobStatus && (
          <div className={cn(
            "flex items-center gap-2 rounded-md border p-3 text-sm",
            jobStatus === "completed" && "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950",
            jobStatus === "failed" && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950",
            (jobStatus === "uploading" || jobStatus === "processing" || jobStatus.includes("processing")) &&
              "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
          )}>
            {getStatusIcon()}
            <span>
              <span className="font-medium">Status:</span> {jobStatus}
            </span>
          </div>
        )}

        {jobId && (
          <div className="text-xs text-muted-foreground">
            Job ID: <span className="font-mono">{jobId}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

