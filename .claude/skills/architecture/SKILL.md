---
name: architecture
description: Protect this project's architecture — duplication, folder organization, complexity, separation of concerns. Use before adding a new module/component/util, when a PR touches multiple files, when asked to refactor, find duplicated code, or review structure, or when a file/function is growing large.
---

This skill is about **structure**, not styling or copy — see the
`design-system` skill for tokens/CSS, `ui-components` for component
API/composition patterns, and `performance` for Server/Client Component
boundaries. Load whichever of those applies alongside this one; don't
duplicate their rules here.

## 1. Before adding anything new: check for duplication

```bash
node .claude/skills/architecture/scripts/find-duplicates.mjs src
```

Line-shingling duplicate detector (6-line windows by default,
`--lines=N` to adjust). Run it on the files you're about to touch
*before* writing new code — if the logic you're about to add already
exists elsewhere, extend/import it instead of retyping it. Run it again
after, on the full `src/` tree, before calling a refactor done.

## 2. Check structural health

```bash
node .claude/skills/architecture/scripts/audit-structure.mjs src
```

Heuristic (regex-based, not a real parser — treat findings as leads to
investigate, not absolute truth). Flags:

| Rule | Default threshold | Why |
|---|---|---|
| `large-file` | >300 lines | A file this long is usually doing more than one job — split by responsibility |
| `high-complexity` | branch-count >10 per function | Deep nesting/many branches — extract sub-functions or early-return |
| `duplicate-name-different-folders` | same basename in 2+ folders | Usually means something got reinvented instead of imported — verify, then delete or merge |
| `deep-nesting` | >5 folders under `src/` | Hard to navigate — usually a sign the folder needs flattening or a route group |

Override thresholds with `--max-loc=`, `--max-complexity=`, `--max-depth=`.
Both scripts accept either a directory or a single file, and `--json`
for scripting.

## 3. Where things go (this project's actual conventions)

Source of truth: `components.json` aliases + Next.js App Router rules.

- `src/components/ui/` — shadcn-managed generic primitives.
- `src/components/<feature>/` — feature-specific components. The moment
  one is imported from a second feature, promote it to `src/components/`
  or `ui/` (see `ui-components` skill, §6).
- `src/lib/` (`@/lib`) — framework-agnostic logic: formatting, data
  transforms, API clients. Not React components.
- `src/hooks/` (`@/hooks`) — shared React hooks. A hook used by only one
  component can stay colocated with it; promote once reused.
- `src/app/` — routes. Next.js explicitly supports colocating
  route-specific components/helpers directly inside a route folder
  (optionally under a `_private` prefix to opt out of routing) — that's
  not a violation. What *is* a violation: something colocated in one
  route that a second route also needs. That's the signal to move it to
  `src/components/` or `src/lib/`, not copy it.

If you're unsure where a new file belongs, that uncertainty is itself a
signal — smaller, single-purpose files are easier to place correctly
than large multi-purpose ones.

## 4. Reusable abstraction vs. premature abstraction

- **Don't abstract on first use.** One implementation is not a pattern.
  Write it inline the first time.
- **Extract on the third occurrence** (rule of three), not the second —
  two similar-looking things are still often coincidence, not a shared
  concept. `find-duplicates.mjs` finding the same block 2-3 times is
  the trigger to actually extract it, not just note it.
- When extracting, name the abstraction after **what it does**, not
  after the two call sites that happened to prompt it — if you can't
  name it without referencing "the thing from page A and page B," it's
  not ready to be a shared abstraction yet.
- Prefer composition (a function/component that takes the varying part
  as a prop/argument) over a config-flag branch inside one big function.
  A `variant` prop with 2 values is fine; a function with 5 boolean
  flags controlling unrelated behavior is not — split it.
- Delete unused abstractions on sight. An abstraction with one caller
  left after a refactor is dead weight — inline it back.

## 5. Refactor checklist

Before proposing or landing a refactor:

- [ ] Ran `find-duplicates.mjs` on the affected area — no new duplication introduced
- [ ] Ran `audit-structure.mjs` — no new large-file/high-complexity findings
- [ ] Each extracted function/module has one clear responsibility you can
      state in one sentence
- [ ] The change reduces total surface area (fewer places to update
      next time), not just moves the same complexity around
- [ ] Naming matches project convention — check a sibling file before
      inventing a new naming pattern
