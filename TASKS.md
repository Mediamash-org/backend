# OMSS Implementation Tasks

Progress tracker for building the OMSS server. This file is **not** a second specification.

- Spec source of truth: [https://omss.mintlify.site/](https://omss.mintlify.site/)
- Project brief / phases: [project.md](project.md)

When uncertain, verify against the official docs rather than inventing behavior.

Status legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[-]` blocked/skipped (with note)

## Current focus

Phase 5 — Multiple Providers (next)

- Phase 1 → [docs/OMSS_SPEC.md](docs/OMSS_SPEC.md)
- Phase 2 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (host: `@omss/framework`)
- Phase 3 → `src/create-host.ts` + OMSS routes
- Phase 4 → provider plugins + [docs/PROVIDERS.md](docs/PROVIDERS.md)

Hard gate: do not start Phase N+1 until Phase N’s blocking tasks are `[x]` (Research → Design → Core → Providers). Docs may fill in as you go.

---

## Phase 1 — Research

Do not code yet. Read the complete OMSS documentation and capture findings.

- [x] Crawl / read docs starting at https://omss.mintlify.site/ (via llms.txt + OpenAPI + GitHub)
- [x] Read Introduction
- [x] Read Explanation
- [x] Read Specification (v1.1 prose + OpenAPI)
- [x] Read Provider documentation (HTTP contract + framework/core BaseProvider)
- [x] Read Provider format (framework TS class / core OMSSProvider — HTTP spec has none)
- [x] Read Provider capabilities (`movies` | `tv` | `subtitles`)
- [x] Read APIs (`/`, `/v1`, movies, TV episode, refresh)
- [x] Read Models (HomeResponse, SourcesResponse, Source, Subtitle, Diagnostic, Error)
- [x] Read Media types (source `type` / subtitle `format` enums)
- [x] Read Sources
- [x] Read Search — **out of OMSS scope** (use TMDB); documented in OMSS_SPEC
- [x] Read Catalogs — **not an HTTP API**; Core optional provider catalog only
- [x] Read Metadata — **out of OMSS scope** (use TMDB)
- [x] Read Movies (sources endpoint)
- [x] Read Series / Seasons / Episodes (TV episode **sources** only; no metadata APIs)
- [x] Read Streams (represented as Source objects)
- [x] Read Subtitles
- [x] Read Authentication — **out of OMSS HTTP scope**
- [x] Read Configuration (content negotiation, CORS, env/host config)
- [x] Read Errors (codes + diagnostics)
- [x] Read Provider discovery (`ProviderRegistry.discoverProviders` / Core registration)
- [x] Read Provider lifecycle (register, enable, health, unregister)
- [x] Read any other sections required (Core architecture, OMSS IDs, reserved namespaces, framework/template)
- [x] Write `docs/OMSS_SPEC.md`
- [x] Document: What is OMSS?
- [x] Document: What is an OMSS provider?
- [x] Document: How are providers packaged?
- [x] Document: How are providers loaded?
- [x] Document: How are providers configured?
- [x] Document: How does the client communicate with the server?
- [x] Document: What APIs exist?
- [x] Document: What models exist?
- [x] Document: What capabilities exist?
- [x] Document: How does source resolution work?

---

## Phase 2 — Compatibility Design

Determine exactly what must be implemented to host/use existing OMSS providers.

- [x] Map required host / server components from the official OMSS specification
- [x] Identify official provider packaging, loading, and discovery mechanisms (`BaseProvider` + `discoverProviders`)
- [x] Confirm runtime requirements (Node ≥ 20.6, TypeScript ESM, Fastify via `@omss/framework`, Vitest, Docker)
- [x] Write `docs/ARCHITECTURE.md` derived from OMSS (chosen host: `@omss/framework`; Core deferred)
- [x] Confirm architecture does **not** invent a custom provider interface competing with OMSS

---

## Phase 3 — Core Implementation

Implement the official OMSS protocol. Do not add custom abstractions unless necessary.

- [x] Scaffold project structure based on OMSS requirements (`src/server.ts`, `src/providers/`, package on `@omss/framework`)
- [x] Implement official OMSS endpoints only (via `@omss/framework` routes)
- [x] Implement official OMSS models / media types (framework + thin v1.1 home/`id` enrichment)
- [x] Implement official OMSS error behavior (framework error middleware)
- [x] Configuration via env (`.env.example`); auth N/A — out of OMSS HTTP scope
- [-] Search / catalogs / metadata APIs — **out of OMSS scope** (use TMDB); not implemented as OMSS routes
- [x] Movies / TV episode **sources** + subtitles via framework content routes
- [x] Ensure no custom API replaces OMSS endpoints
- [x] Ensure no custom data models replace OMSS models
- [x] Keep non-OMSS extras clearly framework-owned (`/v1/proxy`, optional Stremio/MCP off by default)
- [x] Align refresh: added `POST /v1/refresh/:id` (OpenAPI v1.1); framework `GET` retained
- [x] Minimal `README.md` quick start
- [x] Smoke: `GET /` returns providers + media; typecheck passes

---

## Phase 4 — Provider Support

Implement the official OMSS provider loading/discovery mechanism.

- [x] Implement official provider discovery (`discoverProviders` + plugin loader)
- [x] Implement provider loading / packaging support (local dir + npm/`file:` plugins via `createOmssProviders`)
- [x] Implement provider validation (framework TMDB + BaseProvider instantiation)
- [x] Implement provider initialization (registry.register / factory config)
- [x] Implement provider configuration (`config/providers.json`, env, plugin `config` bag)
- [x] Implement enable / disable (`ProviderPluginManager` + `/admin/providers/:id/enable|disable`)
- [x] Implement provider failure handling per OMSS rules (framework SourceService diagnostics)
- [x] Implement unload / lifecycle (`reload`, registry clear; unregister available via registry)
- [x] Expose provider information according to OMSS (home `providers[]`)
- [x] Write `docs/PROVIDERS.md`
- [x] Compatibility tests with example + sample provider plugin (`tests/compatibility/providers.test.ts`)
- [x] Verify: discovery → loading → initialization → OMSS request → provider response → OMSS response
- [x] Sample installable plugin: `plugins/sample-provider-plugin` (`@omss-server/sample-provider-plugin`)

---

## Phase 5 — Multiple Providers

- [ ] Support multiple OMSS providers simultaneously
- [ ] Verify installation / layout follows OMSS (do not assume `providers/` unless spec says so)
- [ ] Verify providers coexist without custom normalization unless OMSS requires it
- [ ] Verify failure of one provider does not break others beyond OMSS rules
- [ ] Verify enable/disable and capability reporting across multiple providers

---

## Phase 6 — Testing

Test against the official OMSS specification (Vitest preferred if stack allows).

- [ ] Tests: provider loading
- [ ] Tests: provider discovery
- [ ] Tests: provider configuration
- [ ] Tests: provider capabilities
- [ ] Tests: OMSS endpoints
- [ ] Tests: OMSS models
- [ ] Tests: OMSS responses
- [ ] Tests: errors
- [ ] Tests: provider lifecycle
- [ ] Tests: multiple providers
- [ ] Tests: provider failure handling
- [ ] Use official OMSS examples/fixtures where possible
- [ ] Full test suite passes

---

## Phase 7 — Docker

- [ ] Create `Dockerfile`
- [ ] Create `docker-compose.yml`
- [ ] Create `.env.example`
- [ ] Verify `docker compose up -d` runs the server

---

## Documentation (ongoing)

Fill in as the corresponding phase produces accurate content.

- [x] `README.md`
- [x] `docs/OMSS_SPEC.md` (Phase 1)
- [x] `docs/ARCHITECTURE.md` (Phase 2)
- [x] `docs/PROVIDERS.md` (Phase 4)
- [x] `docs/PROVIDER_PLUGIN_GUIDE.md` (plugin authoring)
- [ ] `docs/DEVELOPMENT.md`
- [ ] `docs/API.md` (document actual OMSS API implemented)

---

## Optional Admin (only if OMSS lacks an admin interface)

Keep separate from the OMSS protocol. Do not modify OMSS routes for these.

- [ ] Confirm OMSS has no admin interface (or document what it already provides)
- [ ] Admin: list installed providers
- [ ] Admin: enable / disable providers
- [ ] Admin: provider health
- [ ] Admin: view logs
- [ ] Admin: server status
- [ ] Admin: reload providers

---

## Final Validation (A–G)

Before declaring the project complete:

- [ ] **A.** Used the official OMSS provider specification
- [ ] **B.** An existing OMSS provider can be used without rewriting it
- [ ] **C.** No custom provider interface (unless OMSS requires it) — remove if invented
- [ ] **D.** No custom provider manifest (unless OMSS requires it) — remove if invented
- [ ] **E.** No custom API endpoints that replace OMSS endpoints — remove if invented
- [ ] **F.** No custom data models that replace OMSS models — remove if invented
- [ ] **G.** No invented functionality that OMSS already defines — use OMSS instead

---

## Usage

1. Before coding a phase: set **Current focus**, mark that phase’s tasks `[~]`.
2. After each concrete deliverable: flip to `[x]`.
3. If blocked by missing OMSS docs detail: mark `[-]` with a one-line note pointing to the Mintlify section to re-read.
4. Prefer checking off Research → Design → Core → Providers in order before advancing.
