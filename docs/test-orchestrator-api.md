# Testing the Agent Orchestrator v1 API

The `agent-orchestrator-v1` is a **Supabase Edge Function API endpoint**, not a chat command. It's designed to be called via HTTP POST requests.

## API Endpoint URL

```
https://[YOUR_PROJECT_REF].supabase.co/functions/v1/agent-orchestrator-v1
```

## Request Format

**Method:** POST  
**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer [YOUR_ACCESS_TOKEN]` (optional, for authenticated requests)

**Request Body:**
```json
{
  "userId": "user-uuid-or-id",
  "message": "What is the stock price of AAPL?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Hello"
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help you?"
    }
  ],
  "context": {
    "memoryEnabled": true
  }
}
```

## Response Format

**Success (200):**
```json
{
  "finalResponse": "The stock price of AAPL is...",
  "toolCalls": [
    {
      "tool": "mcp_proxy",
      "command": "/alphavantage-mcp get_quote symbol=AAPL",
      "result": "..."
    }
  ]
}
```

**Error (500):**
```json
{
  "finalResponse": "",
  "error": "Error message here"
}
```

## Testing Methods

### 1. Using cURL

```bash
curl -X POST \
  https://[YOUR_PROJECT_REF].supabase.co/functions/v1/agent-orchestrator-v1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "userId": "test-user-123",
    "message": "What is the stock price of AAPL?"
  }'
```

### 2. Using JavaScript/Fetch

```javascript
const response = await fetch(
  'https://[YOUR_PROJECT_REF].supabase.co/functions/v1/agent-orchestrator-v1',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}` // if authenticated
    },
    body: JSON.stringify({
      userId: 'user-123',
      message: 'What is the stock price of AAPL?',
      conversationHistory: []
    })
  }
);

const result = await response.json();
console.log(result.finalResponse);
```

### 3. Using Postman or Insomnia

1. Set method to POST
2. URL: `https://[YOUR_PROJECT_REF].supabase.co/functions/v1/agent-orchestrator-v1`
3. Headers:
   - `Content-Type: application/json`
   - `Authorization: Bearer [TOKEN]` (optional)
4. Body (raw JSON):
```json
{
  "userId": "test-user",
  "message": "Get stock price for TSLA"
}
```

## Current Status

- ✅ **Shared orchestration module** - Extracted and working
- ✅ **Orchestrator API service** - Created and available
- ✅ **Chat function cleanup** - Using shared modules directly
- ⏳ **Integration** - Chat function still uses shared modules directly (not calling orchestrator API yet)

## Note

The chat function currently uses the shared orchestration modules **directly** (not via the orchestrator API). The orchestrator API is available for:
- External integrations
- Future decoupling (Phase 2/3 of the refactoring plan)
- Testing and standalone use

If you want the chat function to call the orchestrator API instead, we can implement that as a next step.

