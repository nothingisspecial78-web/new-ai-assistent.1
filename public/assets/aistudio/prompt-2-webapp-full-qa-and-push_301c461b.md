# Prompt 2: Full QA of the Entire Web App (Multi-Agent), Fix Everything, Report, Commit and Push

## 0. Mission

Test the **whole web app**, with the AI assistant integrated and treated as one part of it, like a team of real human testers would. Find every bug, error, lag and broken option, fix it, prove the fix, and deliver a fast, smooth, error-free web app. Then produce a final report and **commit and push** the verified work to the project's GitHub repository (already linked as a git remote).

Prompt 1 covers the AI assistant's own features in depth. This prompt covers **everything else**: all pages, all options, all roles, all forms and flows, scrolling, lag, errors and data integrity. Still include the assistant's presence on pages (it must load, appear, and not slow or break anything).

Work autonomously from start to finish. Do not stop to ask questions. Record assumptions in `QA_WEBAPP_ASSUMPTIONS.md`.

### Non-negotiable rules
- **Never remove, pause, hide or reduce** any feature, the **3D avatar/rendering**, its animations or alignment, or any existing animation to fix lag. Fix the cause instead (animations may be re-implemented more efficiently, never reduced).
- **Never weaken security or access control** to make something work. A data leak is a critical bug.
- Test only on a **development/staging** database with seeded data. Never use production data.
- Nothing is "passed" without **evidence**. No guessing.
- **Behavior must stay the same** except for fixing bugs and improving speed.

---

## 1. Agents: use many, in parallel (minimum 5, no maximum)

You are explicitly permitted and required to use **multiple agents in parallel**: **at least 5 agents** at all times (hard minimum, never fewer), with **no maximum limit**; use as many as the work needs. Suggested team:

1. **Crawler/Inventory Agent:** maps every page, route, nav item, sidebar item, tab, modal, form, table and action per role (Section 2).
2. **Super Admin Agent:** tests the platform-level area.
3. **Admin Agent:** tests the organization admin area.
4. **Sector Manager Agent:** tests the sector manager area.
5. **Student Agent:** tests the student area.
6. **Public Pages Agent:** login, register, forgot/reset password, public routes, error pages (404/403/500).
7. **Forms and Data Integrity Agent:** every create/edit/delete/import/export flow, validation, duplicates, edge cases, persistence.
8. **Tables, Search and Scroll Agent:** sorting, filtering, pagination, search, virtualization, fast scrolling behavior.
9. **Responsive and Mobile Agent:** phone/tablet layouts, mobile navigation/drawers, touch, orientation.
10. **Performance Agent:** Lighthouse, Core Web Vitals, API latency, long tasks, memory, 3D avatar FPS.
11. **Error Watcher Agent:** console, network, server logs, unhandled exceptions during every test.
12. **Security and Isolation Agent:** role/organization/sector/student isolation, tampering, secrets, headers.
13. **Accessibility and Cross-browser Agent.**
14. **Fixer Agent(s)** and **Integrator Agent:** implement and merge fixes, run regression.
15. **Report Agent:** compiles the final report.

### 1.1 Agent assignments (every agent has its own specific job)

Each agent owns a **distinct slice** of the work. No two agents own the same slice. Every agent keeps a log of tests executed, results, issues and evidence in `qa-artifacts/webapp/<agent-name>/` and contributes its own section to the final report.

| # | Agent | Specific assignment | Deliverable |
|---|---|---|---|
| 1 | Crawler/Inventory Agent | Map every page, route, nav item, sidebar item, tab, modal, form, table and action for every role (including mobile versions); cross-check against the requirements checklist (Section 2A) | `WEBAPP_INVENTORY.md`, gap list |
| 2 | Super Admin Agent | Test every page and option of the platform-level area: organizations list/detail, usage analytics, audit log, password change, exports; confirm it is reachable only by Super Admin | results for this role |
| 3 | Admin Agent | Test every page and option of the organization admin area (dashboard, sectors, managers, students, finances, imports, reports, settings); confirm the old "Super Admin" label is gone and no organization switcher exists | results for this role |
| 4 | Sector Manager Agent | Test every page and option for a sector manager; confirm only their sector(s) data is visible | results for this role |
| 5 | Student Agent | Test every page and option for a student; confirm only their own data is visible | results for this role |
| 6 | Public Pages Agent | Login, register, forgot/reset password, public routes, 404/403/500 pages, session expiry behavior | public results |
| 7 | Forms and Data Integrity Agent | Every create/edit/delete/import/export flow: validation, duplicates, double-submit, persistence, totals correct against the database | flow results |
| 8 | Tables, Search and Scroll Agent | Sorting, filtering, pagination, search; **fast-scroll tests** (no blank or flickering rows, sticky elements stable, scroll smooth) on every long page | scroll and table results |
| 9 | Responsive and Mobile Agent | Every page for every role on phone/tablet/desktop, portrait and landscape; mobile navigation and drawers | responsive results |
| 10 | Performance Agent | Lighthouse and Web Vitals, navigation timings, API latency, bundle sizes, memory, 3D avatar FPS; investigates every lag and tries several fixes | performance table |
| 11 | Error Watcher Agent | Attached to every test run: console, network, server logs; enforces the zero-error policy | error log summary |
| 12 | Security and Isolation Agent | Isolation tests across all roles and organizations, tampering, secrets scan, headers, XSS/SQL injection | security report |
| 13 | Accessibility and Cross-browser Agent | Keyboard, ARIA, contrast, reduced motion, second browser engine | a11y and browser results |
| 14 | Fixer Agent(s) and Integrator Agent | Fix issues (one branch per issue), merge, add regression tests, run full regression, own the final clean run | fix branches, merge log |
| 15 | Report Agent | Compile `QA_WEBAPP_REPORT.md` from all agents' logs; verify every inventory item has a result and evidence | final report |

**If you use more than these agents (there is no maximum):** split further so each extra agent owns one distinct slice (for example one agent per role and per major page group, or one per viewport). Never leave an agent without a specific assignment, and never let two agents duplicate the same slice.

**Coordination rules:**
- Each testing agent uses its **own browser context and its own test accounts/data partition** so they do not interfere.
- Fixes are done in **separate git branches or worktrees**, merged by the Integrator one at a time with the tests re-run after each merge. Never let two agents edit the same file simultaneously without careful merging.
- All findings go into a shared `QA_WEBAPP_ISSUES.md` (id, severity, role, page, steps, evidence, status).
- The agent that found an issue re-tests the fix; a different agent runs regression.

---

## 2. Phase 1: Map the entire app (Crawler/Inventory Agent)

Produce `WEBAPP_INVENTORY.md` (and a machine-readable `webapp-inventory.json`) containing, for **each role** (Super Admin platform, Admin, Sector Manager, Student, public/pre-login; use the role names that actually exist in the project):

- Every **page/route** and how to reach it.
- Every **navigation bar item, sidebar item and sub-item, sub-heading, tab, breadcrumb, dropdown and menu**, including the **mobile navigation** versions.
- Every **button, link, form, input, table, chart, modal, drawer, toast, file upload and export/import action** on each page.
- Every **API endpoint** each page calls.
- Every **animation, 3D element and the AI assistant widget** presence on each page.
- Expected behavior of each item.

This inventory is the **test plan**. No page or option may remain untested.

---

## 2A. Requirements checklist (the project's full history of requirements)

Cross-check the inventory against this checklist. Everything below was requested for this project and **must exist and work**. Any missing or partly implemented item is a **defect**: implement it (without removing anything else), then test it like the rest.

1. **Role structure:** Super Admin (new platform owner with a separate page and login; credentials stored hashed in the database, never in code or browser), Admin (renamed from the old "Super Admin"; sees only its own organization; no organization switching or cross-organization view), Sector Manager (own sector(s) only), Student (own data only). The old "Super Admin" label must not appear in the Admin UI; old URLs redirect properly.
2. **Organization isolation:** an Admin can never see another organization's data by any route, search, export or API call.
3. **Every page and option** for each role works with correct data, validation and permissions.
4. **No lag:** smooth navigation between nav bar items and sidebar items, smooth scrolling, fast typing and modal opening, fast API responses.
5. **No blank rows or flicker** when scrolling fast; scroll position restored on back navigation.
6. **No errors** of any kind (console, network, server).
7. **Responsive:** phone, tablet, desktop; mobile navigation and drawers work.
8. **AI assistant integrated:** loads on every page, opens, shows role- and page-appropriate chips, answers scoped questions, runs guides, shows the 3D avatar; does not slow or break the app.
9. **3D avatar and all animations** always present and smooth on every page; nothing reduced or removed.
10. **Security:** secrets never exposed, login hardening, rate limits, secure cookies and headers.
11. **Data integrity:** totals, balances and counts correct; imports go to the right organization and sector.

Record the cross-check result (item, found/missing, test result) in `WEBAPP_INVENTORY.md`.

## 3. Test environment

1. Seed script (for example `npm run seed:qa`): 1 Super Admin, at least 2 organizations each with an Admin, several Sector Managers, thousands of students, tens of thousands of payments, funds, classes, documents, imports (valid and invalid), plus edge cases (empty sector, student with no payments, duplicate names, very long names, special characters, Malayalam text).
2. Run the **production build** for all measurements and most tests.
3. Browsers: Chromium (primary) plus Firefox or WebKit for core flows. Viewports: phone 360x800, tablet 768x1024, desktop 1440x900 (and a large 1920x1080). Run also with **CPU 4x throttling** and **Fast 4G** network throttling.

---

## 4. Phase 2: Test everything (all agents in parallel)

### A. Navigation and every option (role agents)
For **each role**, click through **every** navigation bar item, sidebar item and sub-item, tab and sub-heading, in order and in random order, using mouse, keyboard and (on mobile) touch. For every page verify:
- It loads with correct content, with **no errors** (console/network/server), no blank or half-loaded states, no infinite spinners, no layout jumps.
- Correct permissions: only this role's pages are accessible; direct URL access to other roles' pages is denied with the proper response; old URLs redirect correctly.
- Back/forward buttons, refresh on every page, deep links, and rapid repeated clicking (race conditions, stale data) all behave.
- Every button, link, dropdown, modal, drawer, tooltip, date picker and toggle works.

### B. Forms and data flows (Forms and Data Integrity Agent)
For every form and flow (add/edit/delete student, create sector, add/assign manager, record payment/fee, add fund, import students from Excel, export reports, change settings, change password, profile edit, login/register/forgot password, and every other flow in the inventory):
- Happy path; validation errors (empty, too long, wrong format, duplicates, invalid dates/amounts, special characters, Malayalam text, emoji); cancel/close behavior; double-click/double-submit protection; refresh in the middle; browser back after submit.
- **Data persists correctly** and appears in all related lists/dashboards (no stale data); totals and balances are computed correctly (verify with independent database queries); deletions and updates cascade properly; imports go only to the correct organization/sector.
- Error states: server error, network offline, slow network, expired session (graceful message and redirect to login, no data loss where possible).

### C. Tables, search and scrolling (Tables, Search and Scroll Agent)
- Sorting, filtering, pagination, search-as-you-type (debounce works, no flicker), empty states, very large tables (thousands of rows).
- **Fast-scroll test:** scroll quickly and repeatedly top to bottom and back on every long list/table/page. Check that **no rows or sections go blank, flicker, overlap or jump**, that virtualized lists render rows promptly (adjust overscan/row height if blanks appear), that sticky headers/sidebars stay in place, that images and content do not pop in late, and that scrolling stays smooth (target 60 fps on desktop, at least 30 fps on mid-range phone). Test scroll restoration after navigating back.
- Check scroll-linked effects, infinite scroll/pagination triggers and the sidebar/nav scroll behavior.

### D. Responsive and mobile (Responsive and Mobile Agent)
- Test **every page for every role** at phone, tablet and desktop sizes, in portrait and landscape: navigation bar, hamburger/drawer, bottom navigation, sidebars collapsing/expanding, modals, tables (horizontal scroll or card layout), forms, charts, long text, keyboard overlap on inputs.
- No horizontal page scroll, no cut-off buttons, no overlapping elements, tap targets large enough, the AI assistant panel and 3D avatar positioned correctly and not blocking essential controls.

### E. Performance and lag (Performance Agent; Error Watcher runs in parallel)
- Lighthouse and Web Vitals on all key pages per role (mobile-throttled): LCP under 2.5 s, INP under 200 ms, CLS under 0.1.
- **Navigation test:** 20+ transitions per role across all nav items: visual response under 100 ms, meaningful content under 300 ms warm / 1 s cold, no long tasks over 100 ms.
- API latency (p50/p95/p99) for every endpoint used; query counts (detect N+1); slow queries (EXPLAIN ANALYZE); response sizes; compression and caching headers.
- 3D avatar: always present and animating on every page, steady FPS, no impact on navigation or scrolling (do not reduce or disable it; optimize implementation).
- Memory/leak test: 100 navigation clicks and 50 form interactions; heap and GPU memory stable.
- Find **every lag** (navigation, scroll, typing, opening modals/drawers, switching tabs), diagnose the exact cause with traces/profilers, **try several candidate fixes**, measure each, and keep the best. Typical causes to check: remounting layouts, request waterfalls, large bundles, unvirtualized lists, heavy re-renders from global state, scroll listeners, expensive CSS effects, unindexed queries, missing caching, cross-region API/database.

### F. Errors (Error Watcher Agent; attached to every test of every agent)
**Zero-error policy:** no uncaught exceptions, no console errors or warnings (except documented, justified ones), no failed network requests (except intentionally tested 401/403/404), no server 5xx, no unhandled promise rejections, no React/framework warnings (keys, hydration, act), no errors in server logs, no broken images/fonts/404 assets, no mixed-content or CORS issues. Any appearance fails the test.

### G. Security and isolation (Security and Isolation Agent)
- Strict isolation: Admin sees only own organization (no organization switching, cross-organization IDs return not found); Sector Manager only own sector(s); Student only own data; Super Admin area reachable only by the Super Admin; tokens of one role rejected by other roles' endpoints; forged IDs/params ignored.
- Login hardening (rate limit, lockout, generic errors), secure cookies, security headers, CSRF where applicable, no secrets or credentials in frontend bundles, responses, logs or the repository.
- Input handling: XSS payloads in names/notes, SQL injection strings, oversized inputs, malicious files in uploads.

### H. Accessibility and cross-browser
- Keyboard-only navigation of all pages and menus, visible focus, labels/ARIA for forms and buttons, contrast, reduced-motion behavior, and core flows in a second browser engine.

### I. AI assistant integration check (light; full coverage is in Prompt 1)
- On every page for every role the assistant loads, opens, shows role- and page-appropriate chips, answers a basic scoped question, and starts a basic guide, without errors, without lag, and without slowing page navigation or scrolling.

---

## 5. Phase 3: Fix, re-test, repeat

For each issue: reproduce, find the **root cause**, **fix** it (Fixer Agent), add or update automated tests, have the finder agent **re-test**, then the Integrator runs the **full regression** across all roles and viewports. Update `QA_WEBAPP_ISSUES.md`. Repeat until no open issues remain.

Severity: critical (data leak, wrong data, crash, lost feature/3D) and high (broken feature, visible lag or error) must be fixed. Medium/low should be fixed unless risky, with justification if deferred.

Required end state: **one complete clean run** of the entire QA suite (all roles, all pages, all viewports) with **zero failures, zero errors and all performance targets met**, after the last code change.

---

## 6. Evidence and report

Keep evidence in `qa-artifacts/webapp/` (screenshots, videos, traces, HAR files, Lighthouse reports, logs). **Do not commit large binaries**; ignore them in `.gitignore` or use Git LFS and commit only the markdown reports and small summary files.

Produce **`QA_WEBAPP_REPORT.md`** with:
1. Summary: scope, number of tests, pass/fail counts, final status.
2. The full **inventory table** (each page/option per role) with result, viewports tested and evidence reference.
3. **Issues found:** id, severity, role/page, description, root cause, fix, retest result.
4. **Performance:** before/after table (Lighthouse, Web Vitals, navigation timings, scroll FPS, API latency, bundle sizes, memory).
5. **Security and isolation results**, secrets scan result.
6. **Agents used** and what each covered.
7. Remaining limitations or items needing my action (for example hosting region, infrastructure plan), with reasons.
8. Exact commands to re-run the QA suite (`npm run qa:webapp`).

Also add the automated Playwright end-to-end suites to the repository, wired to a single command, so the QA can be repeated.

---

## 7. Commit and push to GitHub

Do this **only after** the final clean regression run passes.

1. Check `git status`, the current branch and `git remote -v` (the GitHub repository is already linked by me). Do **not** change or add remotes.
2. **Secret safety:** ensure `.env`, credentials, API keys, database dumps/backups, large QA artifacts and anything containing Super Admin credentials are **not tracked** (update `.gitignore`). Run a secret scan on the staged diff (for example `gitleaks` or a regex scan). If anything sensitive is found, remove it (and clean history) **before** pushing.
3. Make **clear, logical commits** (fixes grouped by area, tests, reports) with descriptive messages.
4. Pull/rebase from the remote first, resolve conflicts carefully, and re-run the quick test suite.
5. **Push.** Never use `--force` or `--force-with-lease` unless I explicitly ask. If the branch is protected or the push is rejected, push a new branch `qa/webapp-verified` and tell me clearly.
6. Verify the push (`git log origin/<branch> -1`) and report the branch name and commit hash.

---

## 8. Definition of done

- Every item in the requirements checklist (Section 2A) is implemented, tested and passing, and any missing item found was implemented and tested.
- Every page, navigation item, sidebar item, tab, form and option for every role is tested with evidence and passes, on phone, tablet and desktop.
- No lag (navigation, scrolling, typing, modals), no blank rows on fast scroll, no loading hangs, no errors of any kind (console, network, server).
- Isolation and security checks pass; no secrets exposed.
- 3D avatar and all animations present and smooth everywhere; the AI assistant integrated and working on all pages.
- All fixes re-tested; final full clean regression passed; `QA_WEBAPP_REPORT.md` complete; automated QA suite committed; work pushed to GitHub without secrets.
- Final message to me: concise summary (what was tested, what was broken and fixed, final numbers, branch and commit pushed, anything needing my action).

Start now with Phase 1 (map the entire app) and continue until everything above is complete.
