# RAG Orchestrator Integration Plan

## Overview
Unify RAG functionality into the agent orchestrator, create a documents/knowledge sidebar, and add /help command.

## Implementation Steps

### 1. Fix Upload/Process ✅
- [x] Add updateJobStage call after upload
- [x] Handle null uploadUrl gracefully

### 2. Add RAG Tools to Orchestrator
- [ ] Create `upload_document` tool
- [ ] Create `search_documents` tool  
- [ ] Create `list_documents` tool
- [ ] Create `get_document_status` tool
- [ ] Add tools to orchestrator agent

### 3. Create Documents Sidebar
- [ ] Create `DocumentsSidebar.tsx` component
- [ ] Show thumbnails of documents/images
- [ ] Display document status
- [ ] Allow clicking to view/search document
- [ ] Add to main layout

### 4. Unify Chat Interface
- [ ] Remove separate DocumentUpload and SemanticSearchChat from Index.tsx
- [ ] Integrate file upload into chat input
- [ ] Let orchestrator handle document operations via natural language
- [ ] Update chat to use orchestrator for all operations

### 5. Add /help Command
- [ ] Add help tool to orchestrator
- [ ] List all available commands including RAG operations
- [ ] Show examples and usage

## Architecture

```
User Input → Chat Input → Agent Orchestrator
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
            Command Discovery      RAG Tools
                    ↓                   ↓
            MCP Tools Agent      Document Operations
```

## RAG Tools Specification

### upload_document
- Description: Upload a document for processing and semantic search
- Parameters: file (base64 or file reference)
- Returns: jobId, status

### search_documents  
- Description: Search uploaded documents using semantic search
- Parameters: query (string), jobIds (optional array)
- Returns: relevant chunks with similarity scores

### list_documents
- Description: List all uploaded documents with their status
- Parameters: status filter (optional)
- Returns: array of documents with metadata

### get_document_status
- Description: Get processing status of a document
- Parameters: jobId
- Returns: status, stage, metadata

