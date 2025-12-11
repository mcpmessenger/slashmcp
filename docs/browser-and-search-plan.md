## Browser Automation & Search Plan (MCP-first)

### Objectives
- Real screenshots & automation via MCP, zero-config for end users.
- Host on GCP (avoid Render); keep Vercel frontend; secure with bearer token.
- Better search than DuckDuckGo IA; avoid SerpAPI; prefer Google Programmable Search (CSE).

### Current State
- Playwright wrapper (Supabase Edge Function) can proxy to a browser service when `BROWSER_SERVICE_URL` is set; bearer token forwarding supported via `BROWSER_AUTH_TOKEN`.
- Browser service (`browser-service/`, Puppeteer) not yet deployed to a hosted endpoint.
- Search uses DuckDuckGo IA; relevance is limited.

### Recommended Architecture
- **Cloud Run** hosts `browser-service` container. Endpoint: `POST /invoke`.
- **Supabase Edge** `playwright-wrapper` proxies to Cloud Run, forwarding bearer token.
- **Auth**: shared secret token (`BROWSER_AUTH_TOKEN`) required by the browser service; set in both Cloud Run env and Supabase secrets.
- **Search**: add `google-search-mcp` (Supabase Edge Function) using Google Programmable Search (CSE). Keep DuckDuckGo IA as fallback.
- **Frontend**: default to hosted MCP servers; user-added servers remain behind sign-in.

### Deployment Steps (Browser Service on Cloud Run)
1) Build & push:
   - `gcloud builds submit --tag gcr.io/<gcp-project>/browser-service ./browser-service`
2) Deploy:
   - `gcloud run deploy browser-service --image gcr.io/<gcp-project>/browser-service --platform managed --region <region> --allow-unauthenticated --port 3000 --concurrency 5`
   - Set env vars: `BROWSER_AUTH_TOKEN=<secret>` (and optional Chromium path tweaks if needed).
   - Consider min instances: `--min-instances 0` (cheaper) or `1` (lower cold start).
3) Set Supabase secrets:
   - `supabase secrets set BROWSER_SERVICE_URL="https://<cloud-run-url>" BROWSER_AUTH_TOKEN="<secret>" --project-ref akxdroedpsvmckvqvggr`
4) Redeploy wrapper:
   - `supabase functions deploy playwright-wrapper --project-ref akxdroedpsvmckvqvggr`

### Secrets to Set (Supabase)
- `BROWSER_SERVICE_URL` — Cloud Run URL for browser service.
- `BROWSER_AUTH_TOKEN` — shared bearer token (must also be set on Cloud Run env).
- `GOOGLE_SEARCH_API_KEY` — Google Programmable Search API key.
- `GOOGLE_SEARCH_CX` — Programmable Search Engine ID.

### Search Upgrade (Google Programmable Search)
- Create a Programmable Search Engine (CSE) restricted to the web (or specific sites).
- Get `API_KEY` and `CX`.
- Add Supabase Edge function `google-search-mcp` that calls CSE and returns MCP-formatted results (tool: `web_search`, params: `query`, `max_results`).
- Set secrets: `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX`.
- Update registry to expose `/google-search-mcp web_search`.

### Security & Ops
- Bearer token on browser service; forwarded by wrapper via `x-browser-auth`.
- Optional rate limits via Cloud Run concurrency and quotas.
- Logging: redact full URLs if sensitive; keep minimal fields (host, status, latency).
- Health: use `/health` on browser service; add a lightweight synthetic check.

### Performance Targets
- P95 for snapshot/screenshot: aim < 4–6s warm; note cold starts on Cloud Run if min instances = 0.
- Navigation timeout: 30s; use `networkidle2`. Limit screenshot size (data URLs can be large).
- Concurrency: start with 5–10 per instance; adjust based on memory/CPU.

### Open Items to Confirm
- GCP project ID and region.
- Desired min instances (0 vs 1) and bearer token value.
- Whether to cache search results (simple in-memory or KV) to reduce cost.

### Quick Test Matrix (post-deploy)
- `/playwright-wrapper browser_snapshot url=https://example.com`
- `/playwright-wrapper browser_take_screenshot url=https://example.com fullPage=true`
- `/google-search-mcp web_search query="latest Model Context Protocol news" max_results=5`

### If You Want Fail-safes
- Fallback to DuckDuckGo IA when Google quota is hit or errors.
- Return a clear error when browser service token is missing/invalid.


