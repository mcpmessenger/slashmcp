import React, { useState } from "react";
import { searchDocuments, getQueryableDocumentJobs, type DocumentContext } from "@/lib/ragService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Search, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { supabaseClient } from "@/lib/supabaseClient";

export const SemanticSearchChat: React.FC = () => {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DocumentContext[]>([]);
  const [ragResponse, setRagResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [availableJobs, setAvailableJobs] = useState<string[]>([]);

  // Load available document jobs on mount
  React.useEffect(() => {
    const loadAvailableJobs = async () => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (session?.user) {
        try {
          const jobs = await getQueryableDocumentJobs(session.user.id);
          setAvailableJobs(jobs);
        } catch (error) {
          console.error("Failed to load available jobs:", error);
        }
      }
    };
    loadAvailableJobs();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        title: "Query required",
        description: "Please enter a search query.",
        variant: "destructive",
      });
      return;
    }

    if (query.trim().length < 10) {
      toast({
        title: "Query too short",
        description: "Please enter at least 10 characters for semantic search.",
        variant: "destructive",
      });
      return;
    }

    if (availableJobs.length === 0) {
      toast({
        title: "No documents available",
        description: "Please upload and process documents first before searching.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setSearchResults([]);
    setRagResponse("");

    try {
      // Perform semantic search
      const searchResponse = await searchDocuments(
        query,
        availableJobs.length > 0 ? availableJobs : undefined,
        10, // limit
        0.7, // similarity threshold
      );

      setSearchResults(searchResponse.contexts);

      // Construct RAG response from retrieved chunks
      if (searchResponse.contexts.length > 0) {
        const totalChunks = searchResponse.contexts.reduce((sum, ctx) => sum + ctx.chunks.length, 0);
        const contextText = searchResponse.contexts
          .map((ctx) => {
            const chunksText = ctx.chunks
              .map((chunk, idx) => {
                const similarity = chunk.similarity
                  ? ` (similarity: ${(chunk.similarity * 100).toFixed(1)}%)`
                  : "";
                return `[From ${ctx.fileName}${similarity}]:\n${chunk.content}`;
              })
              .join("\n\n---\n\n");
            return chunksText;
          })
          .join("\n\n==========\n\n");

        const ragPrompt = `Based on the following context from uploaded documents, answer the user's question. If the context does not contain the answer, state that you cannot find the information in the provided documents.

Context:
---
${contextText}
---

User Question: ${query}

Answer:`;

        // For now, we'll display the context and prompt
        // In a full implementation, this would call an LLM API
        setRagResponse(
          `Found ${totalChunks} relevant chunk(s) from ${searchResponse.contexts.length} document(s) using ${searchResponse.searchMode} search.\n\n` +
            `Context retrieved:\n\n${contextText}\n\n` +
            `[Note: In a full implementation, this context would be sent to an LLM to generate a final answer.]`,
        );

        toast({
          title: "Search complete",
          description: `Found ${totalChunks} relevant chunk(s) from ${searchResponse.contexts.length} document(s).`,
        });
      } else {
        setRagResponse(
          "No relevant information found in the uploaded documents for your query. Try rephrasing your question or uploading more documents.",
        );
        toast({
          title: "No results",
          description: "No relevant chunks found for your query.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Search error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      setRagResponse(`Error during semantic search: ${errorMessage}`);
      toast({
        title: "Search failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Semantic Document Search (RAG)
        </CardTitle>
        <CardDescription>
          Ask questions about your uploaded documents using semantic search powered by vector embeddings.
          {availableJobs.length > 0 && (
            <span className="block mt-1 text-xs">
              {availableJobs.length} document(s) available for search.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Ask a question about your uploaded documents... (min. 10 characters)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isLoading) {
                e.preventDefault();
                handleSearch();
              }
            }}
            disabled={isLoading || availableJobs.length === 0}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={isLoading || availableJobs.length === 0}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Search
              </>
            )}
          </Button>
        </div>

        {availableJobs.length === 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            No documents available. Please upload and process documents first using the upload component above.
          </div>
        )}

        {ragResponse && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">RAG Response:</h4>
            <Textarea
              value={ragResponse}
              readOnly
              rows={8}
              className="font-mono text-xs"
            />
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">
              Retrieved Context Chunks ({searchResults.reduce((sum, ctx) => sum + ctx.chunks.length, 0)}):
            </h4>
            <div className="max-h-60 overflow-y-auto space-y-2 rounded-md border p-2">
              {searchResults.map((context, ctxIdx) =>
                context.chunks.map((chunk, chunkIdx) => (
                  <div
                    key={`${context.jobId}-${chunkIdx}`}
                    className="rounded border-b border-border/50 p-2 text-xs last:border-b-0"
                  >
                    <p className="mb-1 font-medium text-blue-600 dark:text-blue-400">
                      <FileText className="mr-1 inline h-3 w-3" />
                      Source: {context.fileName}
                      {chunk.similarity !== undefined && (
                        <span className="ml-2 text-muted-foreground">
                          (Similarity: {(chunk.similarity * 100).toFixed(1)}%)
                        </span>
                      )}
                    </p>
                    <p className="line-clamp-3 text-muted-foreground">{chunk.content}</p>
                  </div>
                )),
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

