## 🎯 Next Agent Workflow Tests

This file tracks manual test flows you (the human) will run whenever we change agent workflows, OAuth, or routing.

---

## ✅ OAuth QA Checklist (run this after any change that might affect auth or routing)

### 1. Local environment – basic login flow
- **Step 1**: Start the dev server and open the app in a fresh browser window (or incognito).
- **Step 2**: Click **“Sign in with Google”**.
- **Expect**:
  - You see the Google OAuth consent screen.
  - After accepting, you are redirected back to the app (no blank page, no unexpected domain).

### 2. Local environment – callback URL and session
- **Step 3**: On return from Google, check the browser address bar.
- **Expect**:
  - Domain matches the local URL (e.g. `localhost:5173` or whatever dev port is configured).
  - Path matches the expected callback route.
  - No obvious error query params like `error=`, `access_denied`, or `invalid_request`.
- **Step 4**: Refresh the page after login.
- **Expect**:
  - You are still authenticated.
  - No redirect loops back to login.

### 3. Local environment – logout and re-login
- **Step 5**: Log out using the app’s logout/sign-out control.
- **Step 6**: Click “Sign in with Google” again and complete the flow.
- **Expect**:
  - Login works a second time with no redirect issues.
  - Refresh after re-login keeps you authenticated.

### 4. Production (Vercel) – primary flow
- **Step 7**: Open the **production URL** in a fresh browser session (or incognito).
- **Step 8**: Repeat the steps above:
  - Click “Sign in with Google”.
  - Approve, then land back on the production app.
- **Expect**:
  - Correct production domain and path on callback.
  - No redirect loops.

### 5. Edge cases
- **Case A – Cancel at Google**:
  - Start login, then cancel/back out at Google.
  - Try logging in again.
  - **Expect**: Second attempt still succeeds, no stuck state.
- **Case B – Multiple tabs**:
  - Open app in two tabs.
  - Log in on one tab, then refresh the other.
  - **Expect**: Both tabs behave sensibly (logged-in or redirected once, but no infinite loops).
- **Case C – Mobile**:
  - Use a mobile device or browser mobile emulation.
  - Run the main login → redirect → refresh flow.
  - **Expect**: Same behavior as desktop (no mobile-only redirect issues).

---

## 🪢 Branching and safety rules for OAuth changes

- **Rule 1**: The commit `42c2410` (“Add Google OAuth login flow and document MCP registry usage”) is the **known good OAuth baseline**.
- **Rule 2**: The commit `e271459` (“Revert to 42c2410 - before OAuth redirect changes”) is the current `main` state and should be tagged as a stable release.
- **Rule 3**: Any future OAuth or routing change must:
  - Be made on a **feature branch**, not directly on `main`.
  - Be followed by running the **full OAuth QA checklist** above on both local and production.

Suggested git safety commands (run from the repo root):

```bash
# 1) Tag current main as stable
git checkout main
git tag stable-oauth-42c2410

# 2) Create working branch to rebuild post-regression features
git checkout -b rebuild-post-oauth-regressions
```

When reintroducing non-OAuth features (e.g., UI, agents, logging), cherry-pick them **one or two commits at a time**, then:
- Run this **OAuth QA checklist** locally.
- Deploy to Vercel and run the **production subset** of this checklist.

# 🎯 Next Agent Workflow Tests

## ✅ What You've Already Tested
1. ✅ **Write & Email** - "Write a bio for William Flynn and email it to me"
   - Status: **WORKING!** Email fixed and content display fixed ✅

---

## 🚀 Recommended Next Tests

### **1. Stock Analysis with Deep Insights** ⭐ (Quick - ~10-15 sec)
Tests: Data fetching + AI analysis + real-time insights

**Try these:**
```
Analyze NVDA stock and give me actionable insights
```

```
What's happening with TSLA stock? Give me a full analysis
```

```
Get me a comprehensive stock analysis for AAPL with recommendations
```

**What it tests:**
- ✅ Fetches live stock data from Alpha Vantage
- ✅ Analyst agent analyzes current data (not outdated training data)
- ✅ Returns insights, trends, and recommendations
- ✅ Real-time data integration

---

### **2. Research & Email Summary** ⭐⭐ (Medium - ~15-20 sec)
Tests: Web research + synthesis + email delivery

**Try these:**
```
Research the latest trends in AI agents and send me a summary via email
```

```
Research quantum computing breakthroughs in 2024 and email me the findings
```

```
Analyze the current state of sustainable energy tech and send me a detailed report
```

**What it tests:**
- ✅ Researcher agent performs web searches with citations
- ✅ Synthesizes multiple sources into coherent summary
- ✅ Email delivery of research results
- ✅ Multi-step sequential workflow

---

### **3. Product Launch Demo (INSANE PARALLEL WORKFLOW)** 🚀 (Advanced - ~30 sec)
Tests: 5 parallel agents + synthesis + comprehensive output

**Try these:**
```
Create a product launch plan for eco-friendly water bottles and email it to me
```

```
Product launch strategy for smart home security cameras - send me the full plan
```

```
Create a product launch plan for sustainable coffee pods and email the complete analysis
```

**What it does:**
1. **Phase 1 (Parallel - 5 agents running simultaneously):**
   - Market Research Agent → Market trends & opportunities
   - Supplier Research Agent → Vendor comparison & pricing
   - Financial Analysis Agent → Projections & break-even
   - Marketing Strategy Agent → Campaign planning
   - Design Agent → Branding guidelines

2. **Phase 2:** Synthesizes all 5 research outputs into business plan
3. **Phase 3:** Creates executive summary
4. **Phase 4:** Emails complete plan

**What it tests:**
- ✅ Parallel agent execution (5 agents at once!)
- ✅ Complex orchestration
- ✅ Multi-agent coordination
- ✅ Data synthesis from multiple sources
- ✅ Comprehensive output formatting

---

### **4. Direct Agent Commands** (Quick Tests)
Test individual agents directly:

```
/workflow-agents-mcp researcher prompt="Research the impact of AI on healthcare"
```

```
/workflow-agents-mcp writer prompt="Write a press release about our new AI product launch"
```

```
/workflow-agents-mcp analyst prompt="Analyze the competitive landscape for AI coding assistants"
```

```
/workflow-agents-mcp design prompt="Create a design brief for a minimalist tech startup brand"
```

---

## 🎯 Recommended Testing Order

### **Test Session 1: Data + Analysis** (~5 min)
1. ✅ "Analyze TSLA stock and give me actionable insights"
2. ✅ "Research AI agent trends and email me a summary"

### **Test Session 2: Multi-Agent Magic** (~10 min)
3. ✅ "Create a product launch plan for wireless headphones and email it to me"

### **Test Session 3: Edge Cases** (~5 min)
4. ✅ Test with different stock symbols (MSFT, GOOGL, AMZN)
5. ✅ Test with different product types
6. ✅ Test direct agent commands

---

## 🔍 What to Watch For

### ✅ Success Indicators
- [ ] Workflow completes without errors
- [ ] Content is properly formatted (no "[object Object]")
- [ ] Email arrives (if applicable)
- [ ] Steps execute in correct order
- [ ] Progress updates show in UI
- [ ] Clean, TTS-friendly responses

### ⚠️ Things to Check
- Execution time (should match expected ranges above)
- Error messages (should be user-friendly)
- Parallel workflows (5 agents should run simultaneously)
- Email formatting (HTML emails should be readable)

---

## 🎬 Quick Start

**Easiest next test (recommended):**
```
Analyze TSLA stock and give me actionable insights
```

**Most impressive test (showcase):**
```
Create a product launch plan for smart home security cameras and email it to me
```

---

## 📊 Available Agents

Your system has **6 workflow agents** ready:

1. **Researcher** - Web research with citations
2. **Writer** - Content generation
3. **Analyst** - Financial/business analysis
4. **Email** - Email composition & sending
5. **Social Media** - Platform-specific content
6. **Design** - Visual content coordination

All accessible via `/workflow-agents-mcp {agent_type} prompt="..."` or through natural language workflows!

