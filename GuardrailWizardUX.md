# Guardrail Creation Wizard UX Spec

## Goals
- Unify guardrail creation into one guided flow (template → basics → policies → preflight → LLM → review).
- Replace raw JSON editing with visual builders, keeping JSON in an advanced toggle.
- Make terminology self-explanatory with inline help and examples.
- Offer template-first and quick-start experiences.
- Add validation and a live preview before publish.

## Wizard Steps
1) Start
   - Template library cards (Use template / Deploy now).
   - “Build custom” path for bespoke guardrails.
2) Basics
   - Create new guardrail (ID, Name, Mode) or update existing guardrail.
   - Inline ID validation (format + uniqueness).
3) Policies
   - Quick-start presets (Basic Safety, Production Ready, Data Protection, Custom).
   - Searchable policy picker with phase and type explanations.
4) Input Checks (Preflight)
   - Target selector (Last user message / Full history).
   - Max length slider.
   - Rule templates + rule builder (id, mode, pattern, block on match).
   - Advanced JSON toggle (read/write).
5) LLM Config
   - Provider presets (OSS Router, OpenAI, Azure OpenAI, Custom).
   - Provider ID, base URL, model, timeout fields.
   - Advanced JSON toggle (read/write).
6) Review
   - Summary of guardrail, policies, phases.
   - Preflight + LLM JSON previews.
   - Publish toggle (disabled for new guardrails; first version auto-publishes).

## Terminology Mapping (UI Copy)
- PRE_LLM → “Before AI”
- POST_LLM → “After AI”
- HEURISTIC → “Fast pattern check”
- CONTEXT_AWARE → “AI-assisted decision”
- Preflight → “Input checks (Preflight)”

## Field Help Copy (examples)
- Guardrail ID: “Use lowercase letters, numbers, and dashes.”
- Mode: “ENFORCE blocks traffic. MONITOR logs decisions without blocking.”
- Target: “Choose which input text is scanned for preflight rules.”
- LLM Base URL: “Must be OpenAI-compatible. Credentials are configured on the engine.”

## Validation Rules
- Guardrail ID + Name required for new guardrails.
- Guardrail ID format: lowercase letters, numbers, dashes.
- Guardrail ID must be unique in project.
- At least one policy must be selected.
- Preflight rules require ID + pattern when provided.
- LLM config requires provider, base URL, model, and positive timeout.
- JSON in advanced mode must be valid.

## Component Map (UI)
- Guardrail Builder shell
  - Stepper chips (Start → Review)
  - Step sections (Start, Basics, Policies, Input Checks, LLM Config, Review)
- Template cards (with Deploy / Use template)
- Quick-start preset cards
- Policy picker (search + multi-select)
- Preflight rule builder + templates
- LLM config form + presets
- Review summary + preview
- Details modal (existing guardrail snapshots)

## Data / API Notes
- Creation flow: create guardrail → create guardrail version → optional publish.
- First version auto-publishes when a guardrail has no versions (service behavior).
- When a template is selected and policies are missing, policies are created from template config before versioning.

## Metrics to Track
- Wizard completion rate.
- Drop-off by step.
- Average time to create guardrail.
- % users choosing templates vs custom.
