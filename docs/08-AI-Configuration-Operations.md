# AI Configuration and Operations

## Scope

Tino routes text generation, embeddings, transcription, and speech through configurable
capabilities. Workflow code selects a capability, not a vendor-specific model. This keeps
model choice replaceable while domain services retain validation and authority.

## Capabilities

| Field | Environment default | Providers | Typical consumers |
|---|---|---|---|
| Fast | `AI_FAST_MODEL_CHAIN` | OpenAI, Anthropic | requirements, search, narrative, extraction |
| Reasoning | `AI_REASONING_MODEL_CHAIN` | OpenAI, Anthropic | analysis, recommendation, verification, reflection |
| Synthesis | `AI_SYNTHESIS_MODEL_CHAIN` | OpenAI, Anthropic | cross-agent synthesis |
| Rebook | `REBOOK_AI_MODEL_CHAIN` or Fast | OpenAI, Anthropic | repeat-request refinement |
| Embedding | `AI_EMBEDDING_CHAIN` | OpenAI, Voyage | semantic memory |
| Transcription | `VOICE_TRANSCRIPTION_MODEL` | OpenAI | voice input |
| Speech | `VOICE_TTS_MODEL` | OpenAI | voice output |

Chains use `provider:model,provider:fallback-model` syntax. Targets are tried in order.
Unconfigured providers are skipped; failures proceed according to retry and timeout settings.

## Runtime admin controls

The protected Admin Settings page shows the effective value and whether it came from an
admin override or the environment. A save validates syntax, persists a secret-free value in
`app_settings`, updates the in-process configuration, and resets the embedding provider when
that chain changes. The ordinary settings table excludes `ai_*` rows so there is one editor.

API keys are deliberately absent. Key rotation remains an environment/secret-manager
operation and normally requires a process restart.

## Transparency

AI-powered customer routes (`/providers`, `/bookings`, `/reviews`, and `/memory`) render a
compact disclosure footer. It reads sanitized `/api/v1/config` metadata and shows configured
provider/model targets plus a fallback warning. It never exposes keys, prompts, tokens, or
private logs.

## Operational checks

After a configuration change:

- verify Admin shows `admin` as the source;
- verify `/api/v1/config` reflects the same metadata;
- run one request for every affected capability;
- confirm logs record provider, model, attempts, and failures;
- for embeddings, confirm vector length equals `AI_EMBEDDING_DIMENSIONS`;
- keep a known-good environment chain available for recovery.

## Current all-OpenAI test profile

The tested development profile uses Luna with Terra fallback for fast work, Terra with Sol
fallback for reasoning, Sol with Terra fallback for synthesis, and
`text-embedding-3-small` at 1,024 dimensions for memory. Availability varies by account and
date, so these values remain configuration rather than code defaults.

## Security boundaries

- Only admins can read or update full runtime chains.
- The public endpoint is read-only and sanitized.
- Models cannot mutate business records through the gateway.
- Rebook refinement changes only a draft returned for customer review.
- Embedding dimension changes require migration/re-index planning.
- Invalid configuration fails with HTTP 400 and is never persisted.
