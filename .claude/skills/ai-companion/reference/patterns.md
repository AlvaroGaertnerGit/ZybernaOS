# AI companion patterns — detail

Verified against Vercel AI SDK v5 docs (`/vercel/ai`, `ai_5_0_0`) via
Context7. Re-check Context7 if the installed `ai`/`@ai-sdk/*` version
differs — v4→v5 changed `useChat`'s API shape substantially (message
`parts[]`, `sendMessage` instead of `handleSubmit`+`input` state,
`@ai-sdk/react` as a separate package), so don't pattern-match old
tutorials without checking the version actually installed.

## Prompt engineering structure

Every system prompt should have these sections, in this order (see
`system-prompt.ts.template`):

1. **Identity** — who it's speaking as, in what person/voice.
2. **Grounding** — what it actually knows, and the explicit instruction
   to say "I don't have that" rather than generate a plausible guess.
   This is the single highest-leverage line against hallucination.
3. **Injected context** — real, current data (project summaries, etc.)
   passed as a parameter, not hardcoded into the prompt string. Keeps
   the prompt truthful as the site's content changes.
4. **Response shape** — length, format, when to break the default (a
   chat widget default should be short; let the visitor's question
   pull for more detail).
5. **Boundaries** — what it redirects away from, stated as a redirect
   ("that's not what I'm here for, but...") not a hard refusal.

Keep the whole prompt as short as it can be while covering these — an
unnecessarily long system prompt adds latency (more tokens to process
before the first output token) and gives the model more surface to
contradict itself against.

## Context window management

- `convertToModelMessages(messages)` sends the full UI message history
  by default. For a long-running conversation, trim to the last N
  turns (or summarize older ones) before calling `streamText` — don't
  let the request grow unbounded turn over turn.
- Don't persist/replay tool-call or reasoning parts back to the model
  unless the provider's docs say to — replay only `text` parts for a
  simple companion (no tools yet, per this skill's initial scope).

## Latency techniques, roughly in order of impact

1. **Stream, always.** Never buffer the full response server-side
   before sending — `toUIMessageStreamResponse()` starts sending as
   soon as the first token arrives. This is the single biggest
   perceived-latency win; without it every other optimization is moot.
2. **Optimistic user-message render.** `useChat`'s `sendMessage` already
   renders the user's own message before the network call resolves —
   don't add a manual "sending..." gate in front of it.
3. **Short system prompt.** Every token in the system prompt delays
   time-to-first-output-token. Keep it as tight as §Prompt engineering
   allows.
4. **Right-sized model.** A faster/smaller model for a casual portfolio
   Q&A companion will usually feel more responsive than the largest
   available model, at a lower cost — pick deliberately, don't default
   to "biggest = best" for a UX that's chat-latency sensitive.
5. **`maxDuration` set deliberately**, not left at a platform default —
   see `route.ts.template`. Too short kills legitimate long answers; too
   long delays failure feedback to the user when something's actually
   stuck.
6. **Forward `abortSignal`.** If the visitor navigates away or hits
   Stop, the upstream provider call should actually cancel (saves cost,
   frees the connection) — see `route.ts.template`'s `abortSignal:
   req.signal`.

## Loading/error state matrix

`useChat`'s `status` is one of `"ready" | "submitted" | "streaming" |
"error"` — map all four, not just the happy path:

| Status | UI |
|---|---|
| `ready` | Input enabled, send button enabled when there's text |
| `submitted` | Input disabled, "Thinking…" indicator, Stop button visible |
| `streaming` | Input disabled, tokens appending live, Stop button visible |
| `error` | Error banner + Retry (`regenerate()`), input re-enabled |

`audit-companion.mjs`'s `chat-hook-missing-error-state` /
`-status-state` rules exist because it's easy to wire up the happy path
and ship without ever testing what the other three look like.
