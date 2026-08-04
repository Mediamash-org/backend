# Build an OMSS Server Using the Official OMSS Specification

You are a senior backend engineer.

Your task is to build a backend server that implements **OMSS exactly as specified by the official documentation**.

Official documentation:

`https://omss.mintlify.site/`

## CRITICAL REQUIREMENT

**DO NOT invent, redesign, replace, simplify, or create a parallel provider specification.**

OMSS already defines how providers work.

Your job is to:

1. Fetch the complete OMSS documentation.
2. Understand the official OMSS provider specification.
3. Implement the server around that specification.
4. Allow me to install/add OMSS-compatible providers.
5. Use the provider interfaces, manifests, models, endpoints, capabilities, IDs, responses, and conventions defined by OMSS.
6. Do not create a new custom provider interface if OMSS already defines one.
7. Do not create a second provider architecture that competes with OMSS.
8. Do not rename OMSS concepts unnecessarily.
9. Do not invent endpoints when OMSS already specifies them.
10. Do not invent data models when OMSS already defines them.

**OMSS is the source of truth.**

If anything in this prompt conflicts with the OMSS documentation, follow the official OMSS documentation.

---

# 1. READ THE DOCUMENTATION FIRST

Before writing code, crawl/read the documentation starting from:

`https://omss.mintlify.site/`

Read all relevant sections, including:

* Introduction
* Explanation
* Specification
* Provider documentation
* Provider format
* Provider capabilities
* APIs
* Models
* Media types
* Sources
* Search
* Catalogs
* Metadata
* Movies
* Series
* Seasons
* Episodes
* Streams
* Subtitles
* Authentication
* Configuration
* Errors
* Provider discovery
* Provider lifecycle
* Any other sections required by the specification

Do not start implementation until you understand how OMSS providers are actually expected to work.

Create:

```text
docs/OMSS_SPEC.md
```

This document should summarize the actual specification you discovered.

---

# 2. DO NOT CREATE A NEW PROVIDER STANDARD

This is extremely important.

Do NOT create something like:

```typescript
interface MyCustomProvider {
   search()
   getMovie()
   getSeries()
   getSources()
}
```

unless the official OMSS specification itself requires exactly that.

Instead, use the provider mechanism already defined by OMSS.

If OMSS defines:

```text
Provider
Manifest
Capabilities
Resolver
Catalog
Source
```

then use those exact OMSS concepts.

If OMSS defines a particular file structure, manifest format, interface, protocol, or provider package format, implement that directly.

---

# 3. THE SERVER'S JOB

The backend should essentially act as an:

**OMSS server / OMSS provider host / OMSS aggregator**, depending on what the specification supports.

Conceptually:

```text
                    OMSS Client
                         │
                         ▼
                ┌─────────────────┐
                │   OMSS Server   │
                │                 │
                │ Official OMSS   │
                │ implementation  │
                └────────┬────────┘
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
        OMSS Provider OMSS Provider OMSS Provider
             A           B           C
```

The providers must be **actual OMSS providers**, not custom adapters invented for this project.

---

# 4. PROVIDER SUPPORT

The most important feature is that I can add existing OMSS providers.

The server should support whatever provider installation/discovery/loading mechanism OMSS specifies.

For example, if OMSS supports providers as:

* packages
* JavaScript modules
* TypeScript modules
* manifests
* directories
* configuration files
* remote providers

then implement the official mechanism.

Do not invent another mechanism unless OMSS itself does not provide one.

---

# 5. EXISTING OMSS PROVIDERS

The server should ideally allow me to take an existing provider that follows the OMSS specification and use it with this server **without rewriting the provider**.

For example:

```text
OMSS Provider
     │
     ▼
Install / Load
     │
     ▼
OMSS Server
     │
     ▼
OMSS API
```

If an existing provider requires a specific runtime or host mechanism defined by OMSS, implement that mechanism instead of rewriting the provider.

---

# 6. PROVIDER REGISTRY / DISCOVERY

If OMSS defines a provider registry or discovery mechanism, implement it exactly.

The server should be able to:

* discover providers
* load providers
* validate providers
* determine provider capabilities
* enable/disable providers
* initialize providers
* handle provider failures
* unload providers if supported
* expose provider information according to OMSS

Do not invent a custom provider registry format if OMSS already has one.

---

# 7. PROVIDER CONFIGURATION

Follow the OMSS specification for provider configuration.

If providers require:

```text
API keys
URLs
credentials
configuration
environment variables
provider-specific settings
```

support them using the official OMSS mechanism.

Do not hardcode provider configuration into the core server.

---

# 8. MULTIPLE PROVIDERS

The server should support multiple OMSS providers simultaneously.

For example:

```text
providers/
    provider-a
    provider-b
    provider-c
    provider-d
```

However, the exact installation structure should follow OMSS.

Do not assume that `providers/` is the correct structure if OMSS specifies another structure.

---

# 9. NO CUSTOM NORMALIZATION LAYER UNLESS OMSS REQUIRES IT

Do not create a custom normalization system such as:

```text
Provider → Custom Model → OMSS Model
```

if OMSS providers already return OMSS-compatible objects.

Use the official OMSS models directly.

Only perform transformation when the OMSS specification explicitly requires it.

---

# 10. NO CUSTOM API

Do not create a separate API such as:

```text
/api/providers
/api/movies
/api/series
/api/sources
```

just because they seem useful.

First determine the actual OMSS API.

Implement the official OMSS endpoints and behavior.

Optional administrative endpoints are acceptable only when they do not interfere with OMSS.

Keep them clearly separated, for example:

```text
OMSS API
    ↓
Official specification

Admin API
    ↓
Server management only
```

---

# 11. ADMINISTRATION

If OMSS does not define an administration interface, a small server-specific admin API may be created for:

* listing installed providers
* enabling/disabling providers
* checking provider health
* viewing logs
* viewing server status
* reloading providers

But this must remain separate from the OMSS protocol.

Do not modify the OMSS API to accommodate these features.

---

# 12. TECHNOLOGY

Use a modern, maintainable backend stack.

Preferred:

* Node.js
* TypeScript
* Fastify
* Zod where runtime validation is necessary
* Pino
* Vitest
* Docker

However:

**Do not force these technologies if the OMSS specification or its official provider ecosystem requires another runtime.**

Compatibility with existing OMSS providers is more important than the preferred stack.

---

# 13. PROVIDER COMPATIBILITY TEST

Create a compatibility test using at least one real/example OMSS provider from the official ecosystem if available.

The test should verify:

```text
Provider discovery
       ↓
Provider loading
       ↓
Provider initialization
       ↓
OMSS requests
       ↓
Provider response
       ↓
OMSS response
```

If the official documentation provides example providers, use those.

Do not create a fake custom provider when a real official OMSS example provider exists.

---

# 14. PROVIDER DEVELOPMENT

Create documentation explaining:

**"How do I add an OMSS provider?"**

But do not invent your own provider API.

Instead, explain the official OMSS provider development process.

The documentation should answer:

* Where providers go
* How providers are discovered
* How providers are configured
* How providers are loaded
* How providers expose capabilities
* How providers implement searches
* How providers provide metadata
* How providers provide sources
* How providers provide subtitles
* How providers handle errors
* How providers are tested

All answers must come from the OMSS specification.

---

# 15. ARCHITECTURE

Before implementation, create:

```text
docs/ARCHITECTURE.md
```

The architecture should be derived from OMSS.

Do not start with an invented architecture and then force OMSS into it.

Instead:

```text
Official OMSS specification
          ↓
Identify required components
          ↓
Implement those components
          ↓
Add server infrastructure around them
```

---

# 16. CODE STRUCTURE

Choose the project structure based on the actual OMSS specification.

Do NOT blindly use a predefined structure from this prompt.

The resulting project should be clean and modular, but OMSS compatibility comes first.

For example, it may contain:

```text
src/
    omss/
    server/
    providers/
    config/
    admin/
    utils/
```

But determine the exact structure based on the implementation requirements.

---

# 17. ERROR HANDLING

Follow OMSS error behavior exactly.

Do not invent custom response formats for OMSS requests.

Provider failures should be handled according to OMSS's rules.

Internal server errors can be logged internally without exposing sensitive implementation details.

---

# 18. SECURITY

Implement normal backend security:

* environment variables for secrets
* input validation
* request limits
* timeouts
* safe logging
* CORS where required
* rate limiting where appropriate
* protection against SSRF
* no credential leakage

However, do not interfere with legitimate provider functionality required by OMSS.

---

# 19. TESTING

Test against the official OMSS specification.

Tests should verify:

* provider loading
* provider discovery
* provider configuration
* provider capabilities
* OMSS endpoints
* OMSS models
* OMSS responses
* errors
* provider lifecycle
* multiple providers
* provider failure handling

Where possible, use official OMSS examples and fixtures.

---

# 20. DOCUMENTATION

Create:

```text
README.md

docs/
├── OMSS_SPEC.md
├── ARCHITECTURE.md
├── PROVIDERS.md
├── DEVELOPMENT.md
└── API.md
```

### OMSS_SPEC.md

Explain what was learned from the official specification.

### ARCHITECTURE.md

Explain how this implementation maps directly to OMSS.

### PROVIDERS.md

Explain how to install and manage OMSS providers.

### DEVELOPMENT.md

Explain how to develop the server.

### API.md

Document the actual OMSS API implemented by the server.

---

# 21. IMPLEMENTATION PHASES

Follow this exact process.

## Phase 1 — Research

Read the complete OMSS documentation.

Do not code yet.

Produce:

```text
docs/OMSS_SPEC.md
```

Identify:

```text
What is OMSS?
What is an OMSS provider?
How are providers packaged?
How are providers loaded?
How are providers configured?
How does the client communicate with the server?
What APIs exist?
What models exist?
What capabilities exist?
How does source resolution work?
```

---

## Phase 2 — Compatibility Design

Determine exactly what must be implemented to host/use existing OMSS providers.

Produce:

```text
docs/ARCHITECTURE.md
```

---

## Phase 3 — Core Implementation

Implement the official OMSS protocol.

Do not add custom abstractions unless necessary.

---

## Phase 4 — Provider Support

Implement the official OMSS provider loading/discovery mechanism.

Test with a real OMSS-compatible provider if one is available.

---

## Phase 5 — Multiple Providers

Verify that multiple providers can coexist.

---

## Phase 6 — Testing

Run the full test suite.

Verify behavior against OMSS documentation.

---

## Phase 7 — Docker

Create:

```text
Dockerfile
docker-compose.yml
.env.example
```

The server should run with:

```bash
docker compose up -d
```

---

# 22. FINAL VALIDATION

Before declaring the project complete, answer:

### A.

Did you use the official OMSS provider specification?

### B.

Can an existing OMSS provider be used without rewriting it?

### C.

Did you create any custom provider interface?

If yes, remove it unless OMSS requires it.

### D.

Did you create any custom provider manifest?

If yes, remove it unless OMSS requires it.

### E.

Did you create custom API endpoints that replace OMSS endpoints?

If yes, remove them.

### F.

Did you create custom data models that replace OMSS models?

If yes, remove them.

### G.

Did you invent any functionality that OMSS already defines?

If yes, use the OMSS implementation instead.

---

# 23. GOLDEN RULE

The project should be:

```text
             OFFICIAL OMSS
                  │
                  ▼
        ┌──────────────────┐
        │   OMSS SERVER    │
        │                  │
        │ Official models  │
        │ Official APIs    │
        │ Official provider│
        │ mechanism        │
        └────────┬─────────┘
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
      OMSS     OMSS     OMSS
    Provider Provider Provider
```

NOT:

```text
Custom Server
     ↓
Custom Provider Interface
     ↓
Custom Models
     ↓
Custom API
     ↓
OMSS Adapter
```

The second architecture is explicitly NOT what I want.

---

# FINAL OBJECTIVE

I want a server where I can obtain an existing OMSS-compatible provider and simply install/load it.

I should **not have to rewrite the provider to fit this server**.

I should **not have to write an adapter for every provider**.

I should **not have to create my own provider specification**.

The server exists to provide a runtime/host/API for the **existing OMSS ecosystem**.

Implement OMSS as faithfully as possible.

When uncertain, go back to:

`https://omss.mintlify.site/`

and verify the specification rather than guessing.
