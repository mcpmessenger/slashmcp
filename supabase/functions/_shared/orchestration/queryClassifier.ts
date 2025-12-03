/**
 * Query Classifier - Intelligent query analysis for orchestrator routing
 * 
 * Analyzes user queries to determine:
 * - Intent (document, web, command, memory, hybrid)
 * - Confidence scores for each tool
 * - Context clues (document names, timestamps, etc.)
 */

export interface QueryClassification {
  intent: "document" | "web" | "command" | "memory" | "hybrid" | "unknown";
  confidence: number;
  suggestedTool: string;
  context: {
    mentionsDocument?: boolean;
    mentionsFile?: boolean;
    mentionsUpload?: boolean;
    documentName?: string;
    isQuestion?: boolean;
    keywords: string[];
  };
}

/**
 * Document-related keywords and phrases
 */
const DOCUMENT_KEYWORDS = [
  "document", "documents", "uploaded", "file", "files", "pdf", "pdfs",
  "what i uploaded", "my document", "my documents", "the document", "that document",
  "tell me about", "what does it say", "what can you tell me", "analyze",
  "search my documents", "find in my documents", "in my document",
  "from my document", "document says", "document contains", "document mentions",
  "what's in", "what is in", "content of", "information in",
];

/**
 * File-related keywords
 */
const FILE_KEYWORDS = [
  "file", "files", "upload", "uploaded", "attachment", "attachments",
];

/**
 * Question patterns that suggest document queries
 */
const DOCUMENT_QUESTION_PATTERNS = [
  /what (does|can|is|are).*say/i,
  /tell me (about|what).*/i,
  /what.*(about|in|from).*/i,
  /search.*(for|in|my).*/i,
  /find.*(in|from).*/i,
  /analyze.*/i,
  /summarize.*/i,
];

/**
 * Classify a user query to determine intent and routing
 */
export function classifyQuery(
  query: string,
  availableDocuments?: Array<{ id: string; fileName: string; status: string }>
): QueryClassification {
  const lowerQuery = query.toLowerCase().trim();
  const words = lowerQuery.split(/\s+/);
  
  // Check for document-related keywords
  const hasDocumentKeyword = DOCUMENT_KEYWORDS.some(keyword => 
    lowerQuery.includes(keyword.toLowerCase())
  );
  
  const hasFileKeyword = FILE_KEYWORDS.some(keyword =>
    lowerQuery.includes(keyword.toLowerCase())
  );
  
  // Check for question patterns
  const matchesQuestionPattern = DOCUMENT_QUESTION_PATTERNS.some(pattern =>
    pattern.test(query)
  );
  
  // Try to extract document name from query
  let documentName: string | undefined;
  if (availableDocuments && availableDocuments.length > 0) {
    // Check if query mentions any document filename
    for (const doc of availableDocuments) {
      const fileNameLower = doc.fileName.toLowerCase();
      const fileNameWords = fileNameLower.replace(/\.(pdf|docx?|txt|csv)/, "").split(/[\s_-]+/);
      
      // Check if query contains significant words from filename
      const matchingWords = fileNameWords.filter(word => 
        word.length > 3 && lowerQuery.includes(word)
      );
      
      if (matchingWords.length >= 2 || (matchingWords.length === 1 && fileNameWords.length <= 3)) {
        documentName = doc.fileName;
        break;
      }
    }
  }
  
  // Calculate confidence score
  let confidence = 0;
  let intent: QueryClassification["intent"] = "unknown";
  let suggestedTool = "";
  
  // Document intent scoring
  if (hasDocumentKeyword || hasFileKeyword || documentName) {
    confidence += 0.4;
  }
  if (matchesQuestionPattern) {
    confidence += 0.3;
  }
  if (documentName) {
    confidence += 0.2; // Strong signal if document name is mentioned
  }
  if (availableDocuments && availableDocuments.length > 0) {
    confidence += 0.1; // User has documents available
  }
  
  // Determine intent
  if (confidence >= 0.5) {
    intent = "document";
    suggestedTool = "search_documents";
  } else if (confidence >= 0.3) {
    intent = "hybrid";
    suggestedTool = "search_documents"; // Try document first, fallback to web
  } else {
    // Check for other intents
    if (lowerQuery.includes("remember") || lowerQuery.includes("store") || lowerQuery.includes("save")) {
      intent = "memory";
      suggestedTool = "store_memory";
      confidence = 0.7;
    } else if (lowerQuery.includes("what did") || lowerQuery.includes("what i told")) {
      intent = "memory";
      suggestedTool = "query_memory";
      confidence = 0.7;
    } else if (lowerQuery.startsWith("/") || lowerQuery.includes("command")) {
      intent = "command";
      suggestedTool = "mcp_proxy";
      confidence = 0.8;
    } else {
      intent = "web";
      suggestedTool = "web_search";
      confidence = 0.5;
    }
  }
  
  return {
    intent,
    confidence,
    suggestedTool,
    context: {
      mentionsDocument: hasDocumentKeyword,
      mentionsFile: hasFileKeyword,
      mentionsUpload: lowerQuery.includes("upload") || lowerQuery.includes("uploaded"),
      documentName,
      isQuestion: query.trim().endsWith("?") || matchesQuestionPattern,
      keywords: words.filter(w => w.length > 2),
    },
  };
}

/**
 * Get document IDs that match the query
 */
export function getMatchingDocumentIds(
  query: string,
  availableDocuments: Array<{ id: string; fileName: string; status: string }>
): string[] {
  const lowerQuery = query.toLowerCase();
  const matchingIds: string[] = [];
  
  for (const doc of availableDocuments) {
    const fileNameLower = doc.fileName.toLowerCase();
    
    // Exact filename match
    if (lowerQuery.includes(fileNameLower) || fileNameLower.includes(lowerQuery)) {
      matchingIds.push(doc.id);
      continue;
    }
    
    // Word-based matching
    const fileNameWords = fileNameLower.replace(/\.(pdf|docx?|txt|csv)/, "").split(/[\s_-]+/);
    const queryWords = lowerQuery.split(/\s+/);
    
    const matchingWords = fileNameWords.filter(word =>
      word.length > 3 && queryWords.some(qw => qw.includes(word) || word.includes(qw))
    );
    
    if (matchingWords.length >= 2) {
      matchingIds.push(doc.id);
    }
  }
  
  return matchingIds;
}

