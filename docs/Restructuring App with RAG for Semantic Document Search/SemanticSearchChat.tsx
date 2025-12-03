import React, { useState } from 'react';
import { searchDocuments } from '../lib/ragService';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface Chunk {
  id: string;
  job_id: string;
  chunk_text: string;
  similarity: number;
  file_name: string;
}

export const SemanticSearchChat: React.FC = () => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Chunk[]>([]);
  const [ragResponse, setRagResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setSearchResults([]);
    setRagResponse('');

    try {
      // 1. Perform semantic search
      const chunks = await searchDocuments(query);
      setSearchResults(chunks);

      // 2. Simulate RAG process: Construct prompt with context
      const context = chunks.map(c => `File: ${c.file_name}\nChunk: ${c.chunk_text}`).join('\n---\n');
      const prompt = \`Based on the following context, answer the user's question. If the context does not contain the answer, state that you cannot find the information in the provided documents.

Context:
---
\${context}
---

User Question: \${query}\`;

      // 3. Simulate LLM call with the RAG prompt
      // In a real application, you would call your LLM endpoint here.
      // For this example, we'll provide a simulated response.
      const simulatedResponse = chunks.length > 0
        ? \`[Simulated LLM Response] I found \${chunks.length} relevant document chunks. The context suggests that the Model Context Protocol (MCP) is designed for multi-agent orchestration and document intelligence. The system uses Supabase with pgvector for storing document embeddings and performing semantic search.\`
        : "[Simulated LLM Response] I could not find any relevant information in the uploaded documents for your query.";
      
      setRagResponse(simulatedResponse);

    } catch (error) {
      console.error(error);
      setRagResponse(\`Error during RAG process: \${error.message}\`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Semantic Document Search (RAG)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex space-x-2">
          <Input
            placeholder="Ask a question about your uploaded documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            disabled={isLoading}
          />
          <Button onClick={handleSearch} disabled={isLoading}>
            {isLoading ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {ragResponse && (
          <div className="space-y-2">
            <h4 className="font-semibold">RAG Response:</h4>
            <Textarea value={ragResponse} readOnly rows={5} />
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold">Retrieved Context Chunks ({searchResults.length}):</h4>
            <div className="max-h-60 overflow-y-auto space-y-2 p-2 border rounded-md">
              {searchResults.map((chunk, index) => (
                <div key={chunk.id} className="text-sm p-2 border-b last:border-b-0">
                  <p className="font-medium text-blue-600">Source: {chunk.file_name} (Similarity: {chunk.similarity.toFixed(4)})</p>
                  <p className="text-gray-700 line-clamp-3">{chunk.chunk_text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
