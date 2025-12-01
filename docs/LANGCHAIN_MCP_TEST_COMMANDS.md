# LangChain MCP Server - Test Commands

Quick reference for testing the deployed LangChain MCP Server with and without system instructions.

## Prerequisites

1. **Register the server in SlashMCP** (if testing via chat):
   ```
   /slashmcp add langchain-agent https://langchain-agent-mcp-server-554655392699.us-central1.run.app
   ```

2. **Verify registration**:
   ```
   /slashmcp list
   ```

---

## Test Commands (SlashMCP Chat Interface)

### Test 1: Basic Query (No System Instruction)

**Command:**
```
/langchain-agent agent_executor query="What is the capital of France?"
```

**Expected:** Agent responds with a straightforward answer using the default system prompt.

---

### Test 2: Simple Math with System Instruction

**Command:**
```
/langchain-agent agent_executor query="What is 2+2?" system_instruction="You are a math teacher. Explain your reasoning step by step."
```

**Expected:** Agent provides a detailed, educational explanation of the math problem.

---

### Test 3: Financial Analysis

**Command:**
```
/langchain-agent agent_executor query="What is Tesla's current stock price?" system_instruction="You are a financial analyst. Provide detailed analysis with specific numbers, trends, and market context."
```

**Expected:** Agent responds with financial analysis style, including specific details and context.

---

### Test 4: Personality Test (Pirate)

**Command:**
```
/langchain-agent agent_executor query="Explain how the internet works" system_instruction="You are a pirate explaining technology. Use pirate terminology like 'Arr!', 'matey', and 'shiver me timbers' in every response."
```

**Expected:** Agent explains the internet using pirate language and terminology.

---

### Test 5: Code Review Style

**Command:**
```
/langchain-agent agent_executor query="Review this Python code: def add(a, b): return a+b" system_instruction="You are a senior Python code reviewer. Focus on best practices, performance, security, and provide constructive feedback."
```

**Expected:** Agent reviews the code with a focus on best practices and improvements.

---

### Test 6: Research Analyst

**Command:**
```
/langchain-agent agent_executor query="Summarize the latest developments in AI" system_instruction="You are a research analyst. Provide a concise summary with key findings, implications, and cite sources when possible."
```

**Expected:** Agent provides a structured research-style summary.

---

### Test 7: Creative Writing

**Command:**
```
/langchain-agent agent_executor query="Write a short story about a robot learning to paint" system_instruction="You are a creative writer. Write in a poetic, descriptive style with vivid imagery and emotional depth."
```

**Expected:** Agent writes a creative, poetic story.

---

### Test 8: Technical Documentation

**Command:**
```
/langchain-agent agent_executor query="Explain how REST APIs work" system_instruction="You are a technical writer. Explain concepts clearly with examples, use proper terminology, and structure your response with headings."
```

**Expected:** Agent provides a well-structured technical explanation with examples.

---

## Direct API Testing (curl commands)

### Test Manifest Endpoint

```bash
curl https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/manifest
```

**Expected:** JSON response showing tool definitions including `system_instruction` parameter.

---

### Test Basic Invocation (No System Instruction)

```bash
curl -X POST https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "agent_executor",
    "arguments": {
      "query": "What is the capital of France?"
    }
  }'
```

---

### Test with System Instruction (Math Teacher)

```bash
curl -X POST https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "agent_executor",
    "arguments": {
      "query": "What is 2+2?",
      "system_instruction": "You are a math teacher. Explain your reasoning step by step."
    }
  }'
```

---

### Test with System Instruction (Pirate)

```bash
curl -X POST https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "agent_executor",
    "arguments": {
      "query": "Explain how the internet works",
      "system_instruction": "You are a pirate explaining technology. Use pirate terminology like Arr!, matey, and shiver me timbers in every response."
    }
  }'
```

---

### Test with System Instruction (Financial Analyst)

```bash
curl -X POST https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "agent_executor",
    "arguments": {
      "query": "What is Teslas current stock price?",
      "system_instruction": "You are a financial analyst. Provide detailed analysis with specific numbers, trends, and market context."
    }
  }'
```

---

## Quick Test Script (Bash)

Save this as `test-langchain-mcp.sh`:

```bash
#!/bin/bash

BASE_URL="https://langchain-agent-mcp-server-554655392699.us-central1.run.app"

echo "=== Testing Manifest Endpoint ==="
curl -s "$BASE_URL/mcp/manifest" | jq '.tools[0].inputSchema.properties' || echo "Manifest check failed"

echo -e "\n=== Test 1: Basic Query (No System Instruction) ==="
curl -s -X POST "$BASE_URL/mcp/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "agent_executor",
    "arguments": {
      "query": "What is 2+2?"
    }
  }' | jq '.' || echo "Test 1 failed"

echo -e "\n=== Test 2: With System Instruction (Math Teacher) ==="
curl -s -X POST "$BASE_URL/mcp/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "agent_executor",
    "arguments": {
      "query": "What is 2+2?",
      "system_instruction": "You are a math teacher. Explain your reasoning step by step."
    }
  }' | jq '.' || echo "Test 2 failed"

echo -e "\n=== Test 3: With System Instruction (Pirate) ==="
curl -s -X POST "$BASE_URL/mcp/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "agent_executor",
    "arguments": {
      "query": "Explain how the internet works",
      "system_instruction": "You are a pirate explaining technology. Use pirate terminology!"
    }
  }' | jq '.' || echo "Test 3 failed"

echo -e "\n=== All tests completed ==="
```

**Usage:**
```bash
chmod +x test-langchain-mcp.sh
./test-langchain-mcp.sh
```

---

## Python Test Script

Save this as `test_langchain_mcp.py`:

```python
#!/usr/bin/env python3
"""Test script for LangChain MCP Server with system instructions."""

import requests
import json

BASE_URL = "https://langchain-agent-mcp-server-554655392699.us-central1.run.app"

def test_manifest():
    """Test the manifest endpoint."""
    print("=== Testing Manifest Endpoint ===")
    response = requests.get(f"{BASE_URL}/mcp/manifest")
    if response.ok:
        manifest = response.json()
        print("✅ Manifest retrieved successfully")
        # Check if system_instruction is in the schema
        tools = manifest.get("tools", [])
        if tools:
            props = tools[0].get("inputSchema", {}).get("properties", {})
            if "system_instruction" in props:
                print("✅ system_instruction parameter found in manifest")
            else:
                print("❌ system_instruction parameter NOT found in manifest")
        print(json.dumps(manifest, indent=2))
    else:
        print(f"❌ Manifest check failed: {response.status_code}")

def test_invocation(query, system_instruction=None):
    """Test an agent invocation."""
    payload = {
        "tool": "agent_executor",
        "arguments": {
            "query": query
        }
    }
    
    if system_instruction:
        payload["arguments"]["system_instruction"] = system_instruction
        print(f"\n=== Test: '{query}' (with system instruction) ===")
    else:
        print(f"\n=== Test: '{query}' (no system instruction) ===")
    
    response = requests.post(
        f"{BASE_URL}/mcp/invoke",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    
    if response.ok:
        result = response.json()
        print("✅ Invocation successful")
        print(json.dumps(result, indent=2))
        return True
    else:
        print(f"❌ Invocation failed: {response.status_code}")
        print(response.text)
        return False

def main():
    """Run all tests."""
    # Test manifest
    test_manifest()
    
    # Test 1: Basic query
    test_invocation("What is 2+2?")
    
    # Test 2: With system instruction (math teacher)
    test_invocation(
        "What is 2+2?",
        "You are a math teacher. Explain your reasoning step by step."
    )
    
    # Test 3: With system instruction (pirate)
    test_invocation(
        "Explain how the internet works",
        "You are a pirate explaining technology. Use pirate terminology!"
    )
    
    # Test 4: With system instruction (financial analyst)
    test_invocation(
        "What is Tesla's current stock price?",
        "You are a financial analyst. Provide detailed analysis with specific numbers."
    )
    
    print("\n=== All tests completed ===")

if __name__ == "__main__":
    main()
```

**Usage:**
```bash
pip install requests
python test_langchain_mcp.py
```

---

## Recommended Test Sequence

### Quick Verification (2 minutes)

1. **Test manifest:**
   ```bash
   curl https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/manifest | jq
   ```

2. **Test basic invocation:**
   ```
   /langchain-agent agent_executor query="What is 2+2?"
   ```

3. **Test with system instruction:**
   ```
   /langchain-agent agent_executor query="What is 2+2?" system_instruction="You are a math teacher. Explain step by step."
   ```

### Full Test Suite (5 minutes)

Run through all 8 test commands above in SlashMCP chat, or use the Python script for automated testing.

---

## What to Look For

### ✅ Success Indicators

1. **Manifest includes `system_instruction`:**
   - Check that `system_instruction` appears in the tool's `inputSchema.properties`

2. **Basic invocation works:**
   - Agent responds with default behavior
   - Response is coherent and relevant

3. **System instruction works:**
   - Agent's response style/persona matches the instruction
   - Different instructions produce noticeably different responses

### ❌ Failure Indicators

1. **Manifest missing parameter:**
   - `system_instruction` not in schema
   - Server may not be updated

2. **Invocation errors:**
   - 400/500 errors
   - "Unknown tool" errors
   - Parameter validation errors

3. **System instruction ignored:**
   - Responses don't change with different instructions
   - All responses sound the same regardless of instruction

---

## Troubleshooting

### Issue: Command not recognized in SlashMCP

**Solution:**
1. Verify server is registered: `/slashmcp list`
2. Check server ID/name matches what you're using
3. Try using the server ID instead: `/srv_xxxxx agent_executor query="..."`

### Issue: System instruction not working

**Solution:**
1. Verify parameter name is exactly `system_instruction` (case-sensitive)
2. Check that you're using quotes for values with spaces
3. Test with a very obvious instruction (e.g., "Say 'TEST' at the start of every response")

### Issue: Server timeout or errors

**Solution:**
1. Check server health: `curl https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/manifest`
2. Check Google Cloud Run logs
3. Verify the service is running and healthy

---

## Best Test Command (Recommended)

**The best single test command** that clearly demonstrates the feature:

```
/langchain-agent agent_executor query="What is 2+2?" system_instruction="You are a pirate math teacher. Explain the answer using pirate terminology like 'Arr!', 'matey', and 'shiver me timbers'. Start your response with 'Ahoy there!'"
```

This command:
- ✅ Tests basic functionality (math question)
- ✅ Clearly demonstrates system instruction (pirate persona)
- ✅ Easy to verify (should start with "Ahoy there!")
- ✅ Fun and memorable

---

**Happy Testing! 🚀**

