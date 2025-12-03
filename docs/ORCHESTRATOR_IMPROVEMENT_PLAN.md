# Orchestrator Improvement Plan

## Current Issues

1. **Query Classification**: Orchestrator is doing web searches instead of document searches when users ask about uploaded documents
2. **Context Awareness**: Orchestrator doesn't check if documents exist before attempting to search
3. **Tool Selection**: Not robust enough - relies heavily on keyword matching in instructions
4. **State Management**: No awareness of document processing status
5. **Fallback Logic**: Limited fallback strategies when tools fail

## Proposed Improvements

### Phase 1: Enhanced Query Classification

#### 1.1 Pre-flight Document Check
- Before routing, check if user has uploaded documents
- Use `list_documents` tool to get available documents
- If documents exist and query is document-related, prioritize document search
- If no documents exist, fall back to web search or inform user

#### 1.2 Multi-Signal Detection
Instead of relying solely on keyword matching, use multiple signals:
- **Explicit mentions**: "document", "uploaded", "PDF", "file"
- **Context clues**: "I just uploaded", "my document", "the document"
- **Question patterns**: "What does X say?", "Tell me about X", "Search for X"
- **Document names**: Match against actual document filenames

#### 1.3 Query Intent Classification
Create a classification system:
- **Document Query**: User wants info from uploaded documents
- **Web Query**: User wants general web information
- **Command Query**: User wants to execute an MCP command
- **Memory Query**: User wants to store/retrieve memory
- **Hybrid Query**: Could be answered by documents OR web (try documents first)

### Phase 2: Context-Aware Orchestration

#### 2.1 Document Context Builder
```typescript
interface DocumentContext {
  availableDocuments: Array<{
    id: string;
    fileName: string;
    status: string;
    stage: string;
    uploadedAt: string;
  }>;
  processingDocuments: number;
  readyDocuments: number;
  recentUploads: Array<string>; // Document IDs uploaded in last 5 minutes
}
```

#### 2.2 Smart Query Enhancement
- If user says "the document" and there's 1 recent upload, automatically use that document ID
- If user mentions a filename, match it to document ID
- If multiple documents exist, ask for clarification OR search all

#### 2.3 Status-Aware Responses
- If document is "queued" or "processing": Inform user and offer to check status
- If document is "failed": Offer to retry or delete
- If document is "completed": Proceed with search

### Phase 3: Intelligent Tool Selection

#### 3.1 Tool Priority Matrix
Create a decision tree:
```
IF query mentions document/file/upload:
  IF documents exist:
    IF document is ready:
      USE search_documents
    ELSE IF document is processing:
      INFORM user + offer status check
    ELSE:
      INFORM user + offer to wait
  ELSE:
    INFORM user no documents + offer web search
ELSE IF query is command-like:
  USE command_discovery
ELSE IF query needs memory:
  USE memory tools
ELSE:
  USE web search
```

#### 3.2 Confidence Scoring
Score each tool match:
- **High confidence** (>0.8): Use tool directly
- **Medium confidence** (0.5-0.8): Try tool, have fallback ready
- **Low confidence** (<0.5): Ask user for clarification

#### 3.3 Multi-Tool Strategy
For ambiguous queries, try multiple tools:
1. Try document search first (if documents exist)
2. If no results or low confidence, try web search
3. Combine results intelligently

### Phase 4: Robust Error Handling

#### 4.1 Graceful Degradation
- If document search fails: Fall back to web search
- If web search fails: Inform user and suggest alternatives
- If tool unavailable: Inform user and suggest manual command

#### 4.2 Retry Logic
- For transient failures (network, timeout): Retry with exponential backoff
- For permanent failures: Log and inform user

#### 4.3 User Feedback Loop
- Track which tools users prefer for which queries
- Learn from user corrections
- Improve routing over time

### Phase 5: Performance Optimization

#### 5.1 Parallel Tool Execution
- If query could be answered by multiple tools, run in parallel
- Return fastest/best result
- Combine complementary results

#### 5.2 Caching Strategy
- Cache document lists (TTL: 30 seconds)
- Cache search results (TTL: 5 minutes)
- Cache tool availability status

#### 5.3 Streaming Responses
- Stream partial results as they come in
- Update user in real-time
- Show progress for long-running operations

## Implementation Priority

### High Priority (Week 1)
1. ✅ Pre-flight document check
2. ✅ Enhanced query classification
3. ✅ Document context builder
4. ✅ Status-aware responses

### Medium Priority (Week 2)
5. Tool priority matrix
6. Confidence scoring
7. Graceful error handling
8. Retry logic

### Low Priority (Week 3+)
9. Multi-tool parallel execution
10. Caching strategy
11. Streaming responses
12. Learning/feedback loop

## Technical Architecture

### New Components

1. **QueryClassifier**
   - Analyzes user query
   - Determines intent
   - Scores tool matches
   - Returns classification

2. **ContextManager**
   - Maintains user context
   - Tracks document state
   - Manages session state
   - Provides context to tools

3. **ToolRouter**
   - Selects appropriate tool(s)
   - Handles fallbacks
   - Manages retries
   - Combines results

4. **ResponseFormatter**
   - Formats tool results
   - Handles errors gracefully
   - Provides helpful messages
   - Suggests alternatives

## Example Flow

```
User: "What can you tell me about the Architecture document?"

1. QueryClassifier:
   - Detects: document query (confidence: 0.95)
   - Extracts: "Architecture document"
   - Intent: document_search

2. ContextManager:
   - Checks: User has 1 document "Architecture and Core Components.pdf"
   - Status: "queued"
   - Action: Inform user document is processing

3. ToolRouter:
   - Primary: search_documents (but document not ready)
   - Fallback: Inform user + offer status check
   - Alternative: Wait and retry when ready

4. ResponseFormatter:
   - "I see you uploaded 'Architecture and Core Components.pdf', but it's still processing.
   - I'll check its status and let you know when it's ready for search.
   - Would you like me to notify you when it's ready?"
```

## Success Metrics

- **Accuracy**: >90% correct tool selection
- **User Satisfaction**: Users get expected results
- **Response Time**: <2s for simple queries, <5s for complex
- **Error Rate**: <5% tool selection errors
- **Fallback Success**: >80% successful fallbacks

## Next Steps

1. Implement QueryClassifier
2. Implement ContextManager
3. Update orchestrator to use new components
4. Add comprehensive logging
5. Test with various query types
6. Iterate based on feedback

