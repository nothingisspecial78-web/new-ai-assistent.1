# Embeddable AI Assistant & Multi-App Workspace

A reusable, multi-tenant AI Assistant (React widget + standalone `<script>` bundle + Express/SSE backend) that plugs into any web application via an `appId`.

---

## Architecture Overview

```
packages/
  core/       Shared TypeScript types, Zod schemas, SSE event contracts
  server/     Express + SSE backend, OpenRouter/OpenAI SDK, RAG, Sharp vision, SheetJS/Papaparse, tools, security
  widget/     React component (@ai-assistant/widget) + Vite IIFE <script> bundle (dist/assistant.js)
apps/
  demo-college-finance/   Demo 1: College Finance API (students, sectors, funds, import, template.xlsx)
  second-demo-app/        Demo 2: Campus Library Manager API (catalog, loans, declarative tools)
profiles/
  college-finance/        Profile config, 6 markdown docs, students-template.json, eval.json (15 cases)
  second-demo/            Profile config with declarative customTools, 2 markdown docs, eval.json
supabase/
  migrations/001_init_pgvector.sql   Supabase pgvector tables, indexes, and match_assistant_chunks RPC
```

### Core Guarantees
- **App-Only Knowledge (Strict `appId` Isolation):** Every document chunk is stored and queried strictly under its `appId` namespace. If the top retrieval similarity score is below `profile.retrieval.minScore`, the server returns `profile.refusalMessage` immediately without calling the chat LLM.
- **Confirmation-Gated Write Agent:** `read` tools execute automatically using the user's own auth token. `write` tools (`importStudents`, `createSector`, `addFund`, or declarative profile tools) emit `confirmation_required` with an HMAC-signed confirmation token tied to `(actionId, appId, userId, argsHash)`. Nothing mutates until the user clicks **Confirm**, and executed actions are logged with created IDs for **Undo**.
- **Prompt Injection Defense:** Retrieved docs, spreadsheet values, DOM right-click context, and vision inputs are wrapped in escaped `<untrusted_data>` delimiters.
- **Speed & Resilience:** `MODEL_FAST` handles streamed Q&A, `MODEL_STRONG` handles tool-calling (max 6 steps + identical-call breaker), `MODEL_VISION` inspects Sharp-compressed screenshots, and `MODEL_FALLBACK` retries once on upstream failure. Identical Q&A queries are cached per `(appId, language, route)`.

---

## Setup Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure environment:**
   Copy `.env.example` to `.env` and fill in `OPENROUTER_API_KEY` (or `GEMINI_API_KEY` for automatic fallback) and optionally `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`:
   ```bash
   cp .env.example .env
   ```
3. **(Optional) Initialize Supabase pgvector:**
   Run `supabase/migrations/001_init_pgvector.sql` in your Supabase SQL editor. When Supabase env vars are omitted, the server automatically uses its namespace-isolated `InMemoryVectorStore`.
4. **Build the standalone widget bundle & run ingestion:**
   ```bash
   npm run build:widget
   npm run ingest -- --app college-finance
   ```
5. **Start the workspace server (port 3000):**
   ```bash
   npm run dev
   ```

---

## Running Both Demo Apps & Standalone Embed

- **Demo 1 — College Finance:** Open `http://localhost:3000/`
- **Demo 2 — Campus Library Manager:** Click **Switch to Library App** in the top bar (or open `http://localhost:3000/library`)
- **Plain HTML `<script>` Embed Demo:** Open `http://localhost:3000/embed-demo.html`

---

## Ingestion, Evaluation & Tests

- **Ingest docs for an app:**
  ```bash
  npm run ingest -- --app college-finance
  ```
- **Run evaluation suite (15 questions including 5 out-of-scope):**
  ```bash
  npm run eval -- --app college-finance
  ```
- **Run unit & integration tests (Vitest):**
  ```bash
  npm test
  ```

---

## Adding a New App (Zero Core Code Changes)

1. Create a folder `profiles/<new-app-id>/`.
2. Add `profile.json` specifying `appId`, `displayName`, `systemPrompt`, `languages`, `refusalMessage`, `retrieval`, `api` (`baseUrl` + `meEndpoint`), and declarative `customTools` (GET/POST/PUT/DELETE endpoints with Zod parameter specs and optional `undoPath`).
3. Add markdown guides under `profiles/<new-app-id>/docs/*.md` and optional import templates under `profiles/<new-app-id>/templates/*.json`.
4. Run `npm run ingest -- --app <new-app-id>` (or restart the server).
5. Embed `<AssistantWidget appId="<new-app-id>" apiUrl="..." getAuthToken={() => token} />` or the `<script>` tag.

---

## Switching Models & Providers via `.env`

All models and provider URLs are environment-driven:
- **OpenRouter (default):** `LLM_BASE_URL="https://openrouter.ai/api/v1"` + `OPENROUTER_API_KEY`
- **Groq:** `LLM_BASE_URL="https://api.groq.com/openai/v1"`, `MODEL_FAST="llama-3.1-8b-instant"`, `MODEL_STRONG="llama-3.3-70b-versatile"`
- **Qwen / DashScope:** `LLM_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"`, `MODEL_FAST="qwen-plus"`, `MODEL_STRONG="qwen-max"`

---

## Embedding the Widget

### React (`@ai-assistant/widget`)
```tsx
import { AssistantWidget } from '@ai-assistant/widget';

<AssistantWidget
  appId="college-finance"
  apiUrl="http://localhost:3000"
  getAuthToken={() => userToken}
  theme={{ primaryColor: '#0f172a', accentColor: '#1d4ed8', position: 'right' }}
  rtl={false}
/>;
```

### Non-React HTML (`<script>` bundle)
```html
<script
  src="/widget/assistant.js"
  data-app-id="college-finance"
  data-api-url="http://localhost:3000"
  data-auth-token="your-session-token"
  data-title="College Finance Assistant"
></script>
```

---

## Assumptions Noted
- **Single-Port Preview:** For seamless local & AI Studio runtime execution, `server.ts` mounts both demo app APIs (`/api/demo/college-finance`, `/api/demo/second-demo`), the assistant API (`/api/*`), the compiled `/widget/assistant.js` bundle, and the React SPA on port `3000`. Each package in `packages/*` and `apps/*` remains decoupled and can also run independently.
- **Offline / Keyless Fallback:** When `OPENROUTER_API_KEY` is unset, if `GEMINI_API_KEY` is present the LLM gateway automatically routes to Gemini's OpenAI-compatible endpoint; if no external API key is provided (e.g., in Vitest or offline CLI evals), deterministic local embeddings + grounded doc synthesis are used so tests and out-of-scope guards remain reproducible.
