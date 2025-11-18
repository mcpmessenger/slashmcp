# State & Memory Agent Design

## Overview

A **State & Memory Agent** would manage persistent context, user preferences, conversation summaries, and cross-session memory. This document explores whether it's needed and how it could be implemented.

## Current State Management

### What We Have:
- **Stateless Conversations**: Each request includes full conversation history
- **Session-based State**: Frontend maintains messages in React state
- **No Persistence**: Conversations are lost on page refresh
- **No User Memory**: System doesn't remember preferences or past interactions

### What's Missing:
- **Persistent Memory**: Remember important facts across sessions
- **Conversation Summaries**: Compress long conversations into key points
- **User Preferences**: Store user settings, preferred tools, etc.
- **Workflow State**: Track state for multi-step workflows
- **Learning**: Remember what worked well for specific users

## Do We Need a State/Memory Agent?

### Arguments FOR:
1. **Better Context**: Remember user preferences, past queries, and important facts
2. **Efficiency**: Summarize long conversations instead of sending full history
3. **Personalization**: Adapt responses based on user's history
4. **Workflow Continuity**: Maintain state for multi-step workflows
5. **Learning**: Improve over time based on user interactions

### Arguments AGAINST:
1. **Complexity**: Adds another layer of complexity to the system
2. **Privacy**: Storing user data requires careful handling
3. **Current System Works**: Stateless approach is simpler and more reliable
4. **Agents SDK Limitations**: May not support persistent agent memory yet

## Proposed Architecture

### Option 1: Memory Agent (Separate Agent)
```
┌─────────────────┐
│ Orchestrator    │
│    Agent        │
└────────┬────────┘
         │
         ├──► Memory Agent (NEW)
         │    - Store/retrieve context
         │    - Manage user preferences
         │    - Summarize conversations
         │
         ├──► MCP Tool Agent
         │
         └──► Final Answer Agent
```

**Pros:**
- Clear separation of concerns
- Can be called explicitly when needed
- Easy to test and debug

**Cons:**
- Adds another handoff
- May slow down simple queries

### Option 2: Memory Service (Not an Agent)
```
┌─────────────────┐
│ Chat Function    │
│                  │
│  ┌───────────┐   │
│  │ Memory    │   │
│  │ Service   │   │ (Database-backed)
│  └───────────┘   │
│                  │
│  ┌───────────┐   │
│  │ Agents    │   │
│  │ SDK       │   │
│  └───────────┘   │
└─────────────────┘
```

**Pros:**
- Simpler architecture
- Faster (no agent overhead)
- Direct database access
- Can be used by all agents

**Cons:**
- Less "intelligent" (rule-based vs. AI-powered)

### Option 3: Hybrid Approach
- **Memory Service** for simple storage/retrieval
- **Memory Agent** for intelligent summarization and context extraction

## Recommended Implementation

### Phase 1: Memory Service (Not an Agent)
Start with a simple database-backed service:

1. **Database Schema:**
   ```sql
   CREATE TABLE user_memory (
     id UUID PRIMARY KEY,
     user_id UUID REFERENCES auth.users(id),
     key TEXT NOT NULL,  -- e.g., "preferences", "conversation_summary_2025-01"
     value JSONB NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE(user_id, key)
   );
   ```

2. **Memory Service Functions:**
   - `getMemory(key)`: Retrieve stored context
   - `setMemory(key, value)`: Store context
   - `summarizeConversation(history)`: Create conversation summary
   - `getUserPreferences()`: Get user settings

3. **Integration:**
   - Call memory service before/after agent execution
   - Inject relevant context into agent prompts
   - Store summaries after long conversations

### Phase 2: Memory Agent (If Needed)
If we need intelligent memory management:

1. **Memory Agent Responsibilities:**
   - Decide what to remember
   - Extract key facts from conversations
   - Answer questions about past interactions
   - Manage memory lifecycle (forget old/irrelevant data)

2. **When to Use:**
   - User asks "What did we discuss yesterday?"
   - Need to extract important facts from conversation
   - Intelligent memory pruning

## Use Cases

### 1. Conversation Summarization
**Problem**: Long conversations exceed token limits
**Solution**: Periodically summarize and store key points

### 2. User Preferences
**Problem**: User has to repeat preferences each time
**Solution**: Store preferences (e.g., "always use GPT-4o, not mini")

### 3. Context Retention
**Problem**: System forgets important facts between sessions
**Solution**: Store important facts (e.g., "User works at Company X")

### 4. Workflow State
**Problem**: Multi-step workflows need state
**Solution**: Store workflow state between steps

### 5. Learning
**Problem**: System doesn't improve over time
**Solution**: Track what works well for each user

## Implementation Priority

### High Priority (Do First):
1. **Conversation Summarization Service**: Essential for long conversations
2. **User Preferences Storage**: Improves UX significantly
3. **Workflow State Management**: Needed for Phase 3 workflows

### Medium Priority:
4. **Context Memory**: Remember important facts
5. **Learning System**: Track successful patterns

### Low Priority (Maybe Never):
6. **Memory Agent**: Only if we need AI-powered memory management

## Recommendation

**Start with a Memory Service (not an agent)** because:
- Simpler to implement
- Faster (no LLM calls)
- More reliable (database-backed)
- Sufficient for most use cases

**Consider a Memory Agent later** if we need:
- Intelligent memory pruning
- Natural language queries about past interactions
- Complex context extraction

## Next Steps

1. **Create database schema** for user memory
2. **Build memory service** functions
3. **Integrate with chat** to store/retrieve context
4. **Add conversation summarization** for long chats
5. **Store user preferences** (model choice, etc.)

Would you like me to implement the Memory Service first?

