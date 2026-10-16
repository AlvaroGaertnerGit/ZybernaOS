---
name: ai-companion
description: Build or change the AI Companion chat experience — the conversational interface embedded in this portfolio. Use whenever implementing chat UI, a companion API route, streaming responses, the system prompt, or provider/model config, or when reviewing that feature for separation of concerns, latency, or graceful loading/error states.
---

This skill is scoped to what's specific to *conversational AI*.
Everything else about this feature routes to a skill that already
covers it — load whichever applies alongside this one, don't duplicate
their rules here:

- **`design-system`** — colors/spacing/radius for the chat UI.
- **`ui-components`** — composition, `data-slot`, accessible primitives.
- **`portfolio-writing`** — the companion's voice/tone, cliché-checking.
- **`performance`** — Server/Client Component boundaries, bundle size.
- **`architecture`** — duplication, file size/complexity, folder layout.

API shapes below verified against Vercel AI SDK v5 docs (`/vercel/ai`)
via Context7 at authoring time — re-verify if the installed version
differs (v4→v5 was a breaking rewrite of `useChat`).

## Architecture (non-negotiable split)

```
src/lib/ai/providers.ts        ← ONE place provider/model config lives
src/lib/ai/system-prompt.ts    ← ONE place the prompt is built
src/app/api/companion/chat/route.ts  ← server-only: streamText, never imported by a client component
src/hooks/use-companion-chat.ts      ← ONE place useChat() is called
src/components/companion/ChatPanel.tsx ← presentational only, zero AI imports
```

Server-only AI SDK code (`ai`, `@ai-sdk/*`) must never be imported by a
`"use client"` file — it reads API keys and its provider logic has no
business in a client bundle. The hook is the seam: it's the only client
file allowed to know an endpoint exists; everything below it is plain
props.

## Building it: start from the templates, not a blank file

| File | Template |
|---|---|
| `src/lib/ai/providers.ts` | `templates/provider-registry.ts.template` |
| `src/lib/ai/system-prompt.ts` | `templates/system-prompt.ts.template` |
| `src/app/api/companion/chat/route.ts` | `templates/route.ts.template` |
| `src/hooks/use-companion-chat.ts` | `templates/use-companion-chat.ts.template` |
| `src/components/companion/ChatPanel.tsx` | `templates/ChatPanel.tsx.template` |
| First-run UX / suggested prompts | `templates/onboarding-flow.md.template` |

Every template was instantiated as a real file and verified clean
against `tsc --noEmit`, `eslint`, and the `design-system`/`architecture`
audits before being committed here — copy the structure, don't
freehand a different shape.

**Adding a provider later** (the multi-provider requirement) is meant
to be a one-line change to `createProviderRegistry({...})` in
`providers.ts` — if a second provider needs touching more than that
one file, the abstraction has leaked; fix the registry, not the call
sites.

## After writing or changing companion code

```bash
node .claude/skills/ai-companion/scripts/audit-companion.mjs src
```

| Rule | Catches |
|---|---|
| `server-only-ai-import-in-client` | `"use client"` file importing `ai`/`@ai-sdk/<provider>` — leaks provider logic (and the code path to API keys) into the client bundle |
| `hardcoded-secret` | API key literals instead of `process.env` reads |
| `scattered-provider-config` | Provider calls/imports outside `src/lib/ai/` in 2+ files — should be centralized in the registry |
| `chat-hook-missing-error-state` | `useChat()` used but `error` never referenced — no error/retry UI |
| `chat-hook-missing-status-state` | `useChat()` used but `status` never referenced — no loading/streaming UI |

Exit code `1` if anything's flagged. Run the `performance` skill's
audit too — this one won't catch a generic unnecessary `"use client"`,
only AI-specific leaks.

## Deep dives

Read `reference/patterns.md` for the reasoning behind: prompt structure
and grounding (anti-hallucination), context-window trimming, the six
latency techniques in priority order, and the full loading/error state
matrix (`ready`/`submitted`/`streaming`/`error` → four different UI
states, not just happy-path).

## Before calling a companion change done

- [ ] `audit-companion.mjs` clean
- [ ] All four `status` values have visibly different UI (§ state matrix
      in `reference/patterns.md`) — not just `ready` and `streaming`
- [ ] System prompt has a grounding line telling the model to admit what
      it doesn't know, and every injected fact is real/current data
- [ ] Manually killed the network mid-stream (devtools offline toggle)
      and confirmed the UI recovers instead of hanging
- [ ] Copy in the empty state / suggested prompts passes
      `portfolio-writing`'s `lint-copy.mjs`
