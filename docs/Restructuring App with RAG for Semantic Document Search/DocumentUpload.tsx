import React, { useState } from 'react';
import { useUser } from '../hooks/useUser'; // Assuming a useUser hook exists
import { uploadAndProcessDocument, getJobStatus } from '../lib/ragService';
import { Button } from './ui/button'; // Assuming a shadcn/ui Button component
import { Input } from './ui/input'; // Assuming a shadcn/ui Input component
import { useToast } from './ui/use-toast'; // Assuming a shadcn/ui toast hook

export const DocumentUpload: React.FC = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const startPolling = (jobId: string) => {
    const intervalId = setInterval(async () => {
      const status = await getJobStatus(jobId);
      setJobStatus(status);

      if (status === 'completed' || status === 'failed') {
        clearInterval(intervalId);
        setIsUploading(false);
        toast({
          title: "Document Processing Complete",
          description: \`Job \${jobId} finished with status: \${status}\`,
          variant: status === 'completed' ? "default" : "destructive",
        });
      }
    }, 5000); // Poll every 5 seconds
  };

  const handleUpload = async () => {
    if (!file || !user) {
      toast({
        title: "Error",
        description: "Please select a file and ensure you are logged in.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setJobStatus('uploading');

    try {
      const jobId = await uploadAndProcessDocument(file, user);
      setJobStatus('processing');
      toast({
        title: "Upload Successful",
        description: \`Processing job started with ID: \${jobId}\`,
      });
      startPolling(jobId);
    } catch (error) {
      console.error(error);
      setIsUploading(false);
      setJobStatus('failed');
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <h3 className="text-lg font-semibold">Upload Document for Semantic Search</h3>
      <div className="flex space-x-2">
        <Input type="file" onChange={handleFileChange} disabled={isUploading} />
        <Button onClick={handleUpload} disabled={!file || isUploading}>
          {isUploading ? \`\${jobStatus}... \` : 'Upload & Process'}
        </Button>
      </div>
      {file && <p className="text-sm text-muted-foreground">Selected file: {file.name}</p>}
      {jobStatus && isUploading && (
        <p className="text-sm">Current Status: <span className="font-medium">{jobStatus}</span></p>
      )}
      {!user && <p className="text-sm text-red-500">Please log in to upload documents.</p>}
    </div>
  );
};
