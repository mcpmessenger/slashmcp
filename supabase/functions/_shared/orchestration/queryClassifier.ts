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
  "what i uploaded", "my document", "my documents", "the document", "that document", "the documents", "those documents",
  "tell me about", "what does it say", "what can you tell me", "analyze",
  "search my documents", "find in my documents", "in my document", "in my documents",
  "from my document", "from my documents", "document says", "documents say",
  "document contains", "documents contain", "document mentions", "documents mention",
  "what's in", "what is in", "content of", "information in",
  "about the document", "about the documents", "about the file", "about the files",
  "about my document", "about my documents", "about my file", "about my files",
  "what can you tell me about", "tell me about the", "what does the document",
  "what do the documents", "what can you tell me about the", "tell me about my",
  "search my documents", "find in my documents", "in my document",
  "from my document", "document says", "document contains", "document mentions",
  "details on", "details about", "what are the details", "tell me about", // Patterns like "UAOL document"
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
  
  // Initialize confidence score and intent variables
  let confidence = 0;
  let intent: QueryClassification["intent"] = "unknown";
  let suggestedTool = "";
  
  // Try to extract document name from query
  let documentName: string | undefined;
  if (availableDocuments && availableDocuments.length > 0) {
    // Check if query mentions any document filename
    for (const doc of availableDocuments) {
      const fileNameLower = doc.fileName.toLowerCase();
      // Remove file extension and parenthetical content (like "(34)" or "(12)")
      const fileNameBase = fileNameLower
        .replace(/\.(pdf|docx?|txt|csv|png|jpg|jpeg|gif|webp)/, "")
        .replace(/\s*\([^)]*\)\s*/g, ""); // Remove parenthetical content
      const fileNameWords = fileNameBase.split(/[\s_-]+/).filter(w => w.length > 0);
      
      // Check if query contains the full filename (with or without extension)
      if (lowerQuery.includes(fileNameBase) || lowerQuery.includes(fileNameLower)) {
        documentName = doc.fileName;
        confidence += 0.3; // Strong signal if exact filename is mentioned
        break;
      }
      
      // Check if query contains significant words from filename
      // More aggressive matching: accept words 3+ chars, or 2+ chars if they're acronyms/abbreviations
      const matchingWords = fileNameWords.filter(word => {
        const wordLower = word.toLowerCase();
        // Match words 3+ chars, or 2+ chars if they look like acronyms (all caps or mixed case)
        return (word.length >= 3 && lowerQuery.includes(wordLower)) ||
               (word.length >= 2 && /^[A-Z0-9]+$/i.test(word) && lowerQuery.includes(wordLower));
      });
      
      // If any significant word from filename matches, consider it a document reference
      if (matchingWords.length >= 1) {
        documentName = doc.fileName;
        // Higher confidence boost for better matches
        if (matchingWords.length >= 2) {
          confidence += 0.5; // Very strong match (e.g., "untitled design" matches "Untitled design (34).png")
        } else {
          confidence += 0.3; // Single word match (like "UAOL")
        }
        break;
      }
      
      // Additional check: if query contains multiple words that appear together in filename
      // This catches cases like "untitled design" matching "Untitled design (34).png"
      const queryWords = lowerQuery.split(/\s+/).filter(w => w.length >= 3);
      if (queryWords.length >= 2) {
        const consecutiveMatches = fileNameWords.filter((word, idx) => {
          const wordLower = word.toLowerCase();
          // Check if this word and the next word in filename both appear in query
          return queryWords.some(qw => qw.includes(wordLower) || wordLower.includes(qw));
        });
        if (consecutiveMatches.length >= 2) {
          documentName = doc.fileName;
          confidence += 0.5; // Strong match for multiple consecutive words
          break;
        }
      }
    }
  }
  
  // Document intent scoring
  if (hasDocumentKeyword || hasFileKeyword || documentName) {
    confidence += 0.5; // Strong signal for document keywords
  }
  if (matchesQuestionPattern) {
    confidence += 0.3; // Question patterns suggest document queries
  }
  if (documentName) {
    confidence += 0.4; // Very strong signal if document name is mentioned
  }
  // CRITICAL: If user has documents available, boost confidence significantly
  // This ensures we prioritize RAG even for ambiguous queries
  if (availableDocuments && availableDocuments.length > 0) {
    confidence += 0.3; // Increased from 0.2 - having documents is a strong signal
    // If query contains "document" or "file" AND user has documents, it's almost certainly a document query
    if (hasDocumentKeyword || hasFileKeyword) {
      confidence += 0.2; // Additional boost
    }
  }
  
  // Boost confidence if query contains "about" + document/file keywords
  if (lowerQuery.includes("about") && (hasDocumentKeyword || hasFileKeyword)) {
    confidence += 0.2;
  }
  
  // Boost confidence for "tell me" + document/file keywords
  if ((lowerQuery.includes("tell me") || lowerQuery.includes("what can you tell")) && (hasDocumentKeyword || hasFileKeyword)) {
    confidence += 0.2;
  }
  
  // Boost for "details on/about" + document/file keywords (e.g., "details on the UAOL document")
  if ((lowerQuery.includes("details on") || lowerQuery.includes("details about") || lowerQuery.includes("what are the details")) && (hasDocumentKeyword || hasFileKeyword)) {
    confidence += 0.3;
  }
  
  // Additional boost for explicit document queries
  if (lowerQuery.includes("search my documents") || lowerQuery.includes("find in my documents")) {
    confidence += 0.3;
  }
  
  // Pattern: "[WORD] document" or "[WORD] file" - likely referring to a specific document
  // This catches queries like "UAOL document", "budget file", etc.
  const wordDocumentPattern = /\b(\w{2,})\s+(?:document|documents|file|files|pdf)\b/i;
  if (wordDocumentPattern.test(query) && availableDocuments && availableDocuments.length > 0) {
    const match = query.match(wordDocumentPattern);
    if (match && match[1]) {
      const word = match[1].toLowerCase();
      // Check if this word appears in any document filename
      const matchesDoc = availableDocuments.some(doc => {
        const fileNameLower = doc.fileName.toLowerCase();
        return fileNameLower.includes(word);
      });
      if (matchesDoc) {
        confidence += 0.4; // Strong signal - word matches a document name
      }
    }
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
    // Remove file extension and parenthetical content (like "(34)" or "(12)")
    const fileNameBase = fileNameLower
      .replace(/\.(pdf|docx?|txt|csv|png|jpg|jpeg|gif|webp)/, "")
      .replace(/\s*\([^)]*\)\s*/g, ""); // Remove parenthetical content
    
    // Exact filename match (with or without extension/parentheses)
    if (lowerQuery.includes(fileNameBase) || fileNameBase.includes(lowerQuery) || 
        lowerQuery.includes(fileNameLower) || fileNameLower.includes(lowerQuery)) {
      matchingIds.push(doc.id);
      continue;
    }
    
    // Word-based matching
    const fileNameWords = fileNameBase.split(/[\s_-]+/).filter(w => w.length > 0);
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length >= 3);
    
    const matchingWords = fileNameWords.filter(word =>
      word.length >= 3 && queryWords.some(qw => qw.includes(word) || word.includes(qw))
    );
    
    // Match if 2+ words match, or if 1 word matches and it's a significant word (4+ chars)
    if (matchingWords.length >= 2 || (matchingWords.length >= 1 && matchingWords.some(w => w.length >= 4))) {
      matchingIds.push(doc.id);
    }
  }
  
  return matchingIds;
}

