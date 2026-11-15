# Prompt 1: Full QA Verification of the AI Assistant (Multi-Agent), Fix Everything, Report, Commit and Push

## 0. Mission

The AI assistant embedded in this web app has received many features. Your mission:

1. **Discover and list every feature** of the AI assistant yourself (from the code, git history, docs and earlier prompt/changes files).
2. **Test every single feature like a real human user** in a real browser, for every role, using a team of **QA agents**.
3. **Prove** each feature works (evidence for each), **fix** every problem found, **re-test** until clean.
4. Ensure **no lag, no slow loading, no errors** (console, network, server).
5. Produce a final **report**, then **commit and push** the verified work to the project's GitHub repository (already linked as a git remote).

Work autonomously from start to finish. Do not stop to ask questions. Record assumptions in `QA_ASSISTANT_ASSUMPTIONS.md`.

### Non-negotiable rules
- **Never remove, pause, hide or reduce** any feature, the **3D avatar**, its animations or alignment, or any existing animation to "pass" a test. Fix the cause instead. (Animations may be re-implemented more efficiently, never reduced.)
- **Never weaken security** or access control to make a test pass. A test that exposes a data leak is a **critical bug** to fix.
- Test only on a **development/staging** database with seeded data. Never use production data.
- Do not mark anything "passed" without **evidence** (Section 6). "It should work" is not a pass.
- Do not skip features because they are hard to test; if something truly cannot be tested automatically, test it manually through the browser agent and record how.

---

## 1. Agents: use many, in parallel (minimum 5, no maximum)

You are explicitly permitted, and required, to use **multiple agents working in parallel**. Use **at least 5 agents** (this is a hard minimum, never fewer). There is **no maximum limit**: use as many agents as the work needs, in parallel, and do not hold back. Suggested roles (combine or split as needed):

1. **Inventory Agent:** builds the complete feature list (Section 2).
2. **Data-Access and Scope Agent:** tests data lookups and strict role/organization/sector/student scoping.
3. **Chips Agent:** tests role-aware and page-aware suggested prompts.
4. **Guide and 3D Agent:** tests the Guide skill, avatar movement/pointing/voice/eye-closing, 3D presence and alignment.
5. **Chat and Memory Agent:** streaming, history, personalization, language, right-click "Ask AI", side panel, conversation management.
6. **Actions and Uploads Agent:** agent actions with confirmation, undo, audit log, Excel/CSV import, screenshots.
7. **Resilience Agent:** provider fallback chain (OpenRouter, then Gemini, then Groq), timeouts, circuit breaker, failure injection.
8. **Performance Agent:** latency, first-token time, lag, scroll smoothness, memory, FPS of the 3D avatar.
9. **Error Watcher Agent:** collects console errors/warnings, failed network requests, server errors and logs during all tests.
10. **Security Agent:** prompt injection, tampering, cross-scope attempts, secrets exposure.
11. **Mobile and Accessibility Agent:** responsive layouts, touch, keyboard, screen-reader labels.
12. **Fixer Agent(s):** implement fixes (see coordination rules).
13. **Integrator Agent:** merges fixes, resolves conflicts, runs the full regression.
14. **Report Agent:** compiles evidence into the final report.
15. (Optional) **Language and Voice Agent:** English default, optional Malayalam switch, text-to-speech behavior.

### 1.1 Agent assignments (every agent has its own specific job)

Each agent below owns a **distinct slice** of the work. No two agents own the same slice. Every agent must keep a log of the tests it executed, results, issues found and evidence, in `qa-artifacts/assistant/<agent-name>/`, and contribute its own section to the final report.

| # | Agent | Specific assignment | Suites (Section 4) | Deliverable |
|---|---|---|---|---|
| 1 | Inventory Agent | Search code, git history, docs and prompt/changes files; build the feature inventory; cross-check it against the requirements checklist (Section 2A); list missing or half-implemented items | Phase 1 | `ASSISTANT_FEATURE_INVENTORY.md`, gap list |
| 2 | Data-Access and Scope Agent | Ask real data questions as every role (student details by name and admission number, class reports, finances, defaulters, exports, comparisons); verify values against the database; test disambiguation, follow-ups, refusal of out-of-scope data | A | scope and data results |
| 3 | Chips Agent | For every role and every page, check the suggested prompts shown when the assistant opens; dynamic and follow-up chips; language; tampering | B | chips matrix with screenshots |
| 4 | Guide Agent | Run every guide end to end (for example "I want to add a student, guide me"); verify step-by-step advance, controls, voice, captions, resume, mobile | C | guide results with videos |
| 5 | 3D Avatar Agent | Verify the 3D avatar on every page and viewport: present, aligned, animating, pointing, lip-sync, eye-closing on password fields, FPS | C (3D part), G | avatar report with screenshots |
| 6 | Chat and Memory Agent | Open methods, streaming, history per user, personalization, memory clearing, language switch, conversation management | D | chat results |
| 7 | Actions and Uploads Agent | Write actions with confirmation, undo, audit log; Excel/CSV import (valid and invalid); screenshot understanding | E | action and upload results |
| 8 | Resilience Agent | Provider chain (OpenRouter first, then Gemini, then Groq), failure injection, circuit breaker, mid-stream failure | F | resilience results |
| 9 | Performance Agent | Response speed, first token, lookup latency, chip load, scroll smoothness with the assistant open, memory, FPS | G | performance table |
| 10 | Error Watcher Agent | Attached to every test run: console, network, server logs; enforces the zero-error policy | G | error log summary |
| 11 | Security Agent | Isolation attacks, prompt injection, secrets scan, rate limits | H | security report |
| 12 | Mobile and Accessibility Agent | Phone/tablet checks of all suites, keyboard, ARIA | I | responsive and a11y results |
| 13 | Fixer Agent(s) | Fix issues from `QA_ISSUES.md`, one branch per issue, add regression tests | Phase 3 | fix branches |
| 14 | Integrator Agent | Merge fixes, run full regression, own the final clean run | Phase 3 | merge log, regression results |
| 15 | Report Agent | Compile `QA_ASSISTANT_REPORT.md` from all agents' logs; verify every inventory item has a result and evidence | Section 6 | final report |

**If you use more than these agents (there is no maximum):** split the work further so each extra agent owns one distinct slice, for example "Student role + data scope", "Sector Manager role + chips", "Admin role + guides", "Super Admin role + platform questions", "Phone viewport + all suites", "Firefox/WebKit + core flows". Never leave an agent without a specific assignment, and never let two agents duplicate the same slice.

**Coordination rules (to avoid chaos):**
- Each testing agent uses its **own browser context/profile and its own test accounts or data partition** so tests do not interfere.
- Fixes are made in **separate git branches or worktrees** per issue/area; the Integrator merges them one by one, re-running tests after each merge. Never let two agents edit the same file at the same time without merging carefully.
- All agents write findings to a shared `QA_ISSUES.md` (id, severity, area, steps to reproduce, evidence link, status).
- After fixes, the original finder agent **re-tests** the issue; a different agent then runs regression.

---

## 2. Phase 1: Discover every feature (Inventory Agent)

Do **not** rely on memory or on this prompt's examples. Search the codebase, git log, README, CHANGES/AUDIT/VERIFICATION files, prompt files, config, routes, tools and UI components, and produce `ASSISTANT_FEATURE_INVENTORY.md` listing **every** assistant feature with: id, name, description, which roles can use it, where it appears (page/entry point), expected behavior, and how it will be tested. Cover at least (and add everything else found):

- Chat widget: floating button, side panel, right-click "Ask AI", streaming, markdown rendering, copy buttons, resize/collapse, mobile bottom sheet.
- Roles and scoping: Super Admin (platform), Admin (organization), Sector Manager, Student, public/pre-login mode (use the role names that actually exist in the project).
- Data access tools: find/get/list/summarize/report/export for every entity (students, classes, sectors, funds, payments, receipts, users, imports, etc.), entity resolution (name, partial name, admission number, phone, roll number + class), disambiguation, follow-up focus entity, pagination, exports, number accuracy.
- Out-of-scope refusal (questions unrelated to the app).
- Suggested prompt chips (role-aware and page-aware, dynamic chips, follow-up chips, language).
- Guide skill: all guides (login, register, import students, add student, find student details, etc.), avatar movement/pointing, spotlight, captions, voice, controls (next/back/repeat/pause/mute/exit/ask), resume after refresh.
- 3D avatar: presence, animation, alignment, lip-sync, eye-closing on password fields, behavior on every page and viewport.
- Agent actions: confirmation flow, tokens, undo, audit log, bulk actions.
- File features: Excel/CSV upload, validation preview, import; screenshot/image understanding.
- Per-user history, personalization/memory, "clear my memory", conversation list/rename/delete.
- Language: English default, optional Malayalam switch, voice.
- LLM provider chain and resilience: OpenRouter first, then Gemini, then Groq; timeouts, circuit breaker, mid-stream failure handling.
- Performance features: caching, prefetching, lazy loading, streaming.
- Security features: auth, rate limiting, prompt-injection defenses, field-level protections, audit logs.
- Admin/Super Admin assistant capabilities (platform usage analytics, organization lookups) and their isolation.

The inventory is the **test plan**. No feature may remain untested.

---

## 2A. Requirements checklist (the project's full history of requirements)

Cross-check the feature inventory against this checklist. Everything below was requested for this project and **must exist and work**. Any item that is missing or only partly implemented is a **defect**: implement it (without removing anything else), then test it like the rest.

1. **Widget:** embeddable on any web app; floating button and right-click "Ask AI" (captures clicked element/route/selection); side panel; streaming.
2. **App-only knowledge (RAG):** answers only about the connected web app, politely refuses everything else.
3. **Full data access (A to Z):** can fetch any data the user's role may see: students by name, partial name, admission number, phone, class and roll number; student finances; class, sector and fund reports; defaulters; collections by period and fund; comparisons; exports (Excel/CSV/PDF); disambiguation when several matches; follow-up questions on the same entity; numbers computed by code; pagination.
4. **Roles and strict scoping:** Super Admin (platform owner, all organizations), Admin (formerly "Super Admin", own organization only, no organization switching), Sector Manager (own sector(s) only), Student (own data only). Scoping enforced in backend code; nothing outside the role is shown.
5. **Per-user history and personalization:** separate conversations per user, memory/preferences, clear-memory option, language setting.
6. **Suggested prompt chips:** appropriate to the role and the current page/window (student window shows student chips, admin shows admin chips, sector manager shows sector chips); dynamic chips; follow-up chips after answers.
7. **Guide skill:** "guide me" requests close the chat and the **3D avatar** (the project's existing model) moves to each element, points, highlights, speaks (English default, Malayalam optional), and advances step by step until done; works on public login/register pages too; avatar closes its eyes while a password is typed; guides exist for all main tasks (login, register, add a student, import students, find student details, etc.).
8. **Agent actions:** perform actions for the user after explicit confirmation, with undo and audit log; Excel/CSV import with preview; screenshot understanding.
9. **LLM providers:** OpenRouter first, then Gemini, then Groq, moving to the next only when the previous fails; timeouts and circuit breaker; fast first token.
10. **Speed:** streaming, small prompts, caching, no lag, no long loads, no errors.
11. **Multi-organization platform:** separate Super Admin page and login (credentials stored hashed in the database, never in code/browser), organization isolation for Admins.
12. **3D and animations:** the 3D avatar and all existing animations are always present and smooth; nothing reduced.

Record the cross-check result (item, found/missing, test result) in `ASSISTANT_FEATURE_INVENTORY.md`.

## 3. Test environment

1. Create/verify a seed script (for example `npm run seed:qa`) that builds: 1 Super Admin, at least 2 organizations each with 1 Admin, several Sector Managers per organization, many students (thousands total) including duplicate names across sectors, similar spellings, students with no payments, overdue students, plus realistic fees, payments, funds and documents.
2. Run the **production build** of the app and backend (not the dev server) for all measurements; keep a dev-mode run only for debugging.
3. Use real provider keys from the environment for end-to-end tests (kept out of logs). Use controlled failure injection (blocking a provider, forcing timeouts/429/5xx) for resilience tests.
4. Test in Chromium (primary) plus at least one more browser engine (Firefox or WebKit) for core flows, and at three viewports: phone (360x800), tablet (768x1024), desktop (1440x900), including CPU throttling (4x) and network throttling (Fast 4G) runs.

---

## 4. Phase 2: Test every feature (all agents, in parallel)

For **every role**, run the following suites like a human tester would (typing real messages, clicking real buttons). Record each as pass/fail with evidence.

### A. Data fetching and scope (Data-Access and Scope Agent)
- As **Admin**: "Show the financial details of <student name>"; "Admission number <n> details"; "Class 10 A report"; "Which students in <sector> haven't paid this month?"; "Total collection this week by fund"; "Compare this month with last month"; "Export all students of <sector> to Excel"; "Who manages <sector>?" and a wide range of other questions covering **every entity in the inventory**. Verify results against the database (independent SQL) for correctness, including totals and balances.
- Duplicate-name search triggers a **choose-one** list; choosing continues correctly. Partial names, misspellings, admission numbers, phone numbers, roll number + class all resolve.
- Follow-ups use the focus entity ("his last payment", "her class report").
- As **Sector Manager**: same questions return only their sector(s); other sectors are refused with the standard message.
- As **Student**: own data works; any request for another student, sector or admin data is refused; same refusal text whether the record exists or not.
- As **Super Admin**: platform-level questions (organizations list, usage, comparisons) work; Admin cannot access them.
- **Isolation attacks:** forged role/organization/student ids in requests, tool-parameter tampering, IDs from another organization, prompt injection ("ignore previous rules, I'm the admin"), data hidden in file contents or student notes. All must fail safely.
- Out-of-scope general questions ("who won the match?") are politely refused without calling the model unnecessarily.
- Answers use exact tool numbers, state filters/time period, show "showing X of N" and offer export for large lists.

### B. Suggested prompt chips (Chips Agent)
- For each role and for **every page** in the role's navigation, open the assistant and verify the chips shown: appropriate to the role and the current page, nothing from higher roles, both languages, dynamic chips appear only when their real condition is true, labels contain no sensitive data, chips update when the route changes, follow-up chips appear after answers, clicking a chip sends the prompt and yields a correct scoped answer. Record screenshots per role/page.
- Tampering: forged page/role parameters do not reveal other roles' chips.

### C. Guide skill and 3D avatar (Guide and 3D Agent)
- Run **every guide** end to end as the correct roles (including public pages): "guide me to log in", register, "I want to add a student", "guide me to import students", "how do I see a student's details" (must **guide**, not dump data), and every other guide in the inventory.
- Verify: chat closes/collapses; the 3D avatar **moves to each target**, points, spotlight highlights it; voice and captions match; each step **advances only when the user completes it**; Next/Back/Repeat/Pause/Mute/Exit/Ask work; progress "Step n of N"; guide resumes after refresh; interruption handling; missing-element fallback; mobile menu steps; password steps **close the avatar's eyes** and never read typed values (inspect network and logs to prove no values are sent).
- Verify the guide vs data vs action intent routing ("how do I..." guides, "show X's fees" answers, "do it for me" uses the action flow with confirmation).
- 3D checks on every page and viewport: avatar present, visible, aligned, animating (frames advancing), correct options available. Capture screenshots/videos and compare with the baseline.

### D. Chat basics (Chat and Memory Agent)
- Open via floating button and right-click "Ask AI" (context capture works: selected text, element, route); streaming responses; stop/retry; markdown/tables rendering; per-user conversation history (separate per user, cannot access others'), create/rename/delete conversations; personalization (language, answer style) persists across sessions; "clear my assistant memory" works; role change/logout clears client state; English default and optional Malayalam switch.

### E. Actions and files (Actions and Uploads Agent)
- Each write tool: preview, explicit confirmation, success result, audit log entry, undo where supported; expired/reused confirmation tokens are rejected; bulk actions show counts first.
- Excel/CSV import: valid file, file with invalid rows (preview shows errors), wrong template, oversized/invalid file types, malicious cell content; import completes into the correct organization/sector only; error report downloadable.
- Screenshot/image: upload a screenshot of an error or screen; the assistant explains the problem and solution using app docs; sensitive screenshots are not stored unexpectedly.

### F. Provider chain and resilience (Resilience Agent)
- Normal run: **OpenRouter is used first** (verify via logs/debug endpoint) and the others are not called.
- Inject failures: OpenRouter timeout/429/5xx leads to Gemini; both failing leads to Groq; all failing shows a clean, friendly error. Circuit breaker opens/closes. Mid-stream failure sends a reset and retries without duplicated text. Tool-calling and image requests only use capable providers. Time-to-first-token timeout triggers fallback within the configured limit.

### G. Speed, lag and errors (Performance Agent and Error Watcher Agent: run during ALL tests)
- Measure: time to first token, total answer time, data lookup latency, report generation time, widget open time, guide start time, chip load time (target under 100 ms), avatar FPS (target 60 fps desktop, at least 30 fps mid-range phone), main-thread long tasks, scroll smoothness inside the chat and on the host page with the assistant open, memory growth after 50 conversations and 20 guide runs.
- **Zero-error policy:** no uncaught exceptions, no console errors or warnings (except explicitly documented and justified ones), no failed network requests other than intentionally tested 401/403/404, no server 5xx, no unhandled promise rejections, no errors in server logs. The Error Watcher attaches to every test and fails the run if any appear.
- Acceptance targets: first token under 1.5 s typical, simple data lookups under 3-4 s end to end, no UI freezes, no layout shifts, no loading spinners that hang.

### H. Security (Security Agent)
- Secrets: search built frontend, network responses, logs and repository for API keys, Super Admin credentials, tokens, password hashes; none may appear.
- Rate limits, upload limits, CORS, auth required on all non-public assistant endpoints; public mode limited to its permitted guides/help.
- Prompt injection inside documents, files, student notes and tool results has no effect.

### I. Mobile and accessibility (Mobile and Accessibility Agent)
- All suites above spot-checked on phone and tablet viewports; touch interactions; bottom-sheet chat; keyboard navigation; focus management; ARIA labels; contrast; captions announced.

---

## 5. Phase 3: Fix, re-test, repeat

For every failure or issue:
1. **Reproduce** and record exact steps and evidence.
2. Find the **root cause** (not just the symptom).
3. **Fix** it (Fixer Agent) following the project's conventions; add or update automated tests so it cannot regress.
4. The agent that found it **re-tests**; then the Integrator runs the **full regression** (all suites, all roles).
5. Update `QA_ISSUES.md` status. Repeat until **no open issues** remain. Severity guidance: critical (data leak, wrong data, crash, lost feature) and high (feature broken, visible lag/error) must be fixed; medium/low should be fixed unless risky, with justification if deferred.

Final regression requirement: one **complete clean run** of the entire suite (all roles, all viewports) with **zero failures, zero console/network/server errors**, after the last code change.

---

## 6. Evidence and report

Keep evidence in `qa-artifacts/assistant/` (screenshots, short videos, traces, HAR files, logs) **but do not commit large binaries to git** (add `qa-artifacts/` large files to `.gitignore` or use Git LFS; commit only the markdown reports and small summary files).

Produce **`QA_ASSISTANT_REPORT.md`** containing:
1. Summary: what was tested, number of tests, pass/fail counts, final status.
2. The full **feature inventory table** with each feature's result (pass/fail), roles tested, viewports tested, and evidence reference.
3. **Issues found** (list): id, severity, description, root cause, fix, retest result.
4. **Performance results:** before/after numbers (first token, lookups, chip load time, FPS, memory).
5. **Security results:** isolation tests passed, secrets scan result.
6. **Agents used:** which agents ran what.
7. Known limitations or items needing my action (with reasons).
8. Exact commands to re-run the full QA suite (`npm run qa:assistant`).

Also add automated tests to the repository so this QA can be re-run: Playwright end-to-end suites for the assistant (all roles) wired to a single command.

---

## 7. Commit and push to GitHub

Do this **only after** the final clean regression run passes.

1. Check the repository state: `git status`, current branch, remote (`git remote -v` shows the GitHub repository already linked by me). Do **not** change or add remotes.
2. **Secret safety before committing:** make sure `.env`, credentials, API keys, database dumps/backups, `qa-artifacts/` large files, and any file containing Super Admin credentials are **not** tracked (update `.gitignore`). Run a secret scan on the staged diff (for example `gitleaks` or a regex scan for keys/passwords/tokens). If anything sensitive is found, remove it and fix history before pushing (never push secrets).
3. Make **clear, logical commits** (for example: fixes grouped by area, tests, reports), with descriptive messages. Include `QA_ASSISTANT_REPORT.md` and the new tests.
4. Pull/rebase from the remote first to avoid conflicts; resolve conflicts carefully; re-run the quick test suite after resolving.
5. **Push** to the remote. Never use `--force` (or `--force-with-lease`) unless I explicitly ask. If the branch is protected or the push is rejected, push to a new branch named `qa/assistant-verified` and tell me clearly in the final summary.
6. Verify the push succeeded (`git log origin/<branch> -1`), and include the branch name and commit hash in the final summary.

---

## 8. Definition of done

- Every item in the requirements checklist (Section 2A) is implemented, tested and passing, and any missing item found was implemented and tested.
- Every feature in `ASSISTANT_FEATURE_INVENTORY.md` is tested with evidence and passes for every applicable role and viewport.
- Chips are correct for every role and page; Guide and 3D avatar work end to end; data access is correct and strictly scoped; provider fallback works; no lag; no errors anywhere.
- All fixes re-tested and a final full clean regression run passed.
- `QA_ASSISTANT_REPORT.md` is complete; automated QA suite committed; work pushed to GitHub with no secrets.
- Final message to me: a concise summary (what was tested, what was broken and fixed, final results, branch and commit pushed, anything needing my action).

Start now with Phase 1 (feature discovery) and continue until everything above is complete.
