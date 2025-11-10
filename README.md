# Gloom Light Switch

MCP-powered AI workspace for document intelligence.

- Drag-and-drop uploads for PDFs, images, and media
- Vision-first analysis with GPT‑4o (Gemini fallback scaffolding is in place)
- OCR orchestration through AWS Textract
- Persistent job tracking and status updates via Supabase
- Planned voice (Whisper / Google Cloud TTS) and image generation (OpenAI or Gemini) services

> **Project repo:** https://github.com/mcpmessenger/gloom-light-switch

---

## At a Glance

- **Frontend:** Vite + React + TypeScript + Tailwind + shadcn/ui
- **State & Data:** TanStack Query, Supabase client
- **Workers / Integrations:** Supabase Edge Functions (`uploads`, `vision-worker`, `textract-worker`, `chat`, `job-status`)
- **Cloud Services:** AWS S3 + Textract, OpenAI GPT‑4o, Google Gemini (fallback), Supabase Postgres
- **Storage:** S3 bucket `arn:aws:s3:::tubbyai-products-catalog`
- **Environment management:** `.env` for Vite, Supabase function secrets for service keys

---

## Getting Started

### Prerequisites

- Node.js ≥ 18.18 (recommend using `nvm`)
- npm ≥ 9 or pnpm/bun if you prefer (project is currently npm locked)
- Supabase CLI (`npm install -g supabase` or `npx supabase`)
- AWS credentials with access to Textract + S3 bucket above
- OpenAI API key (GPT‑4o vision)
- Optional: Google Generative AI key (for Gemini fallback), Whisper / Google Cloud TTS keys for upcoming features

### Setup

```bash
git clone https://github.com/mcpmessenger/gloom-light-switch.git
cd gloom-light-switch
npm install
```

Create `.env.local` (Vite automatically loads `VITE_*` variables):

```
VITE_SUPABASE_URL=https://<your-supabase-ref>.supabase.co
VITE_SUPABASE_FUNCTIONS_URL=https://<your-supabase-ref>.supabase.co/functions/v1
VITE_SUPABASE_PUBLISHABLE_KEY=<supabase-anon-key>
VITE_ALPHA_VANTAGE_API_KEY=<alpha-vantage-key>
VITE_MCP_GATEWAY_URL=http://localhost:8989/invoke # MCP gateway proxy endpoint
VITE_SUPABASE_REDIRECT_URL=http://localhost:5173          # optional: explicit OAuth redirect target
TWELVEDATA_API_KEY=<twelve-data-key>                # optional fallback provider
ALPHAVANTAGE_CACHE_TTL_MS=300000 # optional Supabase function cache TTL (5 min)
POLYMARKET_CACHE_TTL_MS=120000   # optional cache window for Polymarket lookups
```

Configure Supabase Edge Function secrets (one-time per project):

```bash
npx supabase secrets set \
  --project-ref <supabase-ref> \
  PROJECT_URL=https://<your-supabase-ref>.supabase.co \
  SERVICE_ROLE_KEY=<supabase-service-role-key> \
  OPENAI_API_KEY=<openai-key> \
  GEMINI_API_KEY=<optional-gemini-key> \
  ALPHAVANTAGE_API_KEY=<alpha-vantage-key> \
  TWELVEDATA_API_KEY=<twelve-data-key> \
  ALPHAVANTAGE_CACHE_TTL_MS=300000 \
  POLYMARKET_CACHE_TTL_MS=120000 \
  GOOGLE_CLIENT_ID=<google-oauth-client-id> \
  GOOGLE_CLIENT_SECRET=<google-oauth-client-secret> \
  AWS_REGION=<aws-region> \
  AWS_ACCESS_KEY_ID=<aws-access-key> \
  AWS_SECRET_ACCESS_KEY=<aws-secret> \
  AWS_SESSION_TOKEN=<optional-session-token> \
  AWS_S3_BUCKET=tubbyai-products-catalog
```

Serve the dev app alongside Supabase functions:

```bash
npm run dev             # Vite dev server
npx supabase functions serve --env-file supabase/.env # optional local function emulation
```

---

## Key Features & Flow

1. **Upload & Job Tracking**
   - `src/components/ui/chat-input.tsx` drives the menu actions (Upload Files, Document Analysis, Image OCR, Voice Assistant).
   - Frontend calls `supabase/functions/uploads` to create a `processing_jobs` row and receive an S3 presigned PUT URL.
   - Upload progress is surfaced in the UI; `processing_jobs` status transitions are polled via `job-status` function.

2. **Vision Analysis**
   - `vision-worker` fetches the uploaded asset from S3 via presigned GET, submits to GPT‑4o (with JSON-structured prompt), and persists results to `analysis_results`.
   - Gemini fallback helpers exist and can be toggled back in if desired.

3. **Textract OCR**
   - `textract-worker` uses AWS Textract (sync for images, async for PDFs) and stores the OCR text + raw response.
   - Frontend handles Textract errors gracefully (e.g., “No text detected”) and falls back to vision summary.

4. **Supabase Schema**
   - Migration `supabase/migrations/20250108120000_create_processing_jobs.sql` provisions:
     - `processing_jobs`: metadata for each upload
     - `analysis_results`: OCR + vision outputs (ensure the migration is run on the Supabase project)
     - `analysis_results_job_id_unique` unique index is required for `onConflict: "job_id"` upserts

5. **Future Scaffolding**
   - Hooks and menu options exist for Whisper ASR and Google TTS pipelines.
   - `src/lib/api.ts` exposes placeholders for voice/image generation APIs.
6. **Stock Quotes & Charts**
   - Enter `/quote AAPL`, `/stock MSFT 3m`, or `/ticker NVDA 1y` in the chat input to fetch Alpha Vantage data.
   - The assistant renders a price card with daily trend chart, change metrics, and key stats.
   - MCP endpoint support is scaffolded so `/alphavantage-mcp get_stock_chart symbol=NVDA` uses the same rendering pipeline (Supabase edge function `mcp`).
   - Quotes are cached for 5 minutes and automatically fall back to Twelve Data (if `TWELVEDATA_API_KEY` is set) when Alpha Vantage hits premium/rate limits.
8. **Prediction Markets**
   - Use `/polymarket-mcp get_market_price market_id=us_election_2024` to pull live odds from Polymarket via the Supabase `mcp` function.
   - Responses include best bid/ask, implied probability, liquidity, and are cached for 2 minutes (configurable via `POLYMARKET_CACHE_TTL_MS`).
7. **Provider Switching**
   - Use `/model openai`, `/model anthropic`, or `/model gemini` to switch the backing LLM at runtime (defaults to OpenAI).
   - Environment variables and Supabase function secrets (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) must be configured for each provider you plan to use.

9. **MCP Slash Commands & Registry**
   - Authenticate via the header sign-in button (Google OAuth) or the fallback chat command `/slashmcp login email=user@example.com password=secret`.
   - Once signed in, manage servers with `/slashmcp list`, `/slashmcp add <name> <https://gateway>` (plus optional `auth=`/`key=` parameters), and `/slashmcp remove <name|serverId>`.
   - Provider shortcuts like `/gemini` or `/playwright` map to pre-defined presets and prompt for any required secrets.
   - Natural language detectors route common stock and Polymarket questions to the appropriate MCP server automatically when available.
   - Dynamic registry records are stored per-user in Supabase (`mcp_servers` table) and proxied through new edge functions (`mcp-register`, `mcp-get-registry`, `mcp-remove`, `mcp-proxy`).

---

## Available Scripts

| Command            | Description                                    |
|--------------------|------------------------------------------------|
| `npm run dev`      | Start Vite dev server                          |
| `npm run build`    | Production build                               |
| `npm run build:dev`| Development-mode build (useful for staging)    |
| `npm run preview`  | Preview built assets                           |
| `npm run lint`     | ESLint across the project                      |

Supabase Edge Functions can be deployed with:

```bash
npx supabase functions deploy <function-name> --project-ref <ref>
```

---

## Directory Highlights

- `src/components` — Landing page and UI components (Hero, Features, Architecture, CTA).
- `src/components/ui` — shadcn/ui wrappers.
- `src/lib/api.ts` — Frontend API client (uploads, Textract, vision).
- `supabase/functions/*` — Edge functions for uploads, job status, Textract, GPT vision, and chat.
- `supabase/functions/_shared/database.types.ts` — Generated Supabase typings shared across functions.
- `supabase/migrations` — Database schema for job tracking + analysis results.

---

## Deployment Notes

- Ensure Supabase migrations have been applied (`analysis_results` vision columns and unique index).
- Set S3 CORS to allow your dev/prod origins and methods (`GET,PUT,POST,HEAD`).
- When deploying to new environments, rotate and populate Supabase function secrets before invoking uploads/vision workers.
- Voice synthesis (Whisper, Google TTS) still requires additional secrets; Gemini image generation expects `GEMINI_API_KEY` (and optional `GEMINI_IMAGE_MODEL` if you override the default `gemini-2.5-flash-image`). Favicon and logo assets now live under `public/Untitled design.svg` and `public/Untitled design (12/14).png`.
- MCP gateway should expose a single `/invoke` endpoint compatible with the JSON payload emitted by `src/lib/mcp/client.ts`.

---

## Security & Maintenance

- Run `npm audit` (or `npm audit --omit=dev`) regularly; see “Security Scan” section below.
- Restrict Supabase service-role key usage to server-side contexts only; never expose it to the browser.
- Use AWS IAM roles with least-privilege access to Textract and the specific S3 bucket.
- Consider setting up Supabase Row Level Security policies if multi-tenant support is required.

---

## Roadmap / TODO

- [ ] Wire up Whisper transcription pipeline with Supabase edge worker + queue status updates.
- [ ] Integrate Google Cloud Text-to-Speech for voice responses.
- [ ] Re-enable Gemini fallback with configurable provider selection and cost tracking.
- [ ] Add automated testing (Cypress/Playwright) for upload + analysis flow.
- [ ] Harden Supabase RLS and add auth once user accounts are introduced.

---

## License

This project currently has no explicit license. Add one before distributing or accepting external contributions.
