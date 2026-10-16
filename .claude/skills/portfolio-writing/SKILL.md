---
name: portfolio-writing
description: Write or edit any user-facing copy in this portfolio — headlines, project descriptions, about/bio text, button/CTA labels, SEO title and description metadata. Use whenever drafting new copy, rewriting existing text, or when asked to check tone, readability, SEO, or whether copy sounds AI-generated.
---

Every piece of copy goes through the same loop: **draft → lint → fix →
verify clean.** Don't hand-write copy and call it done without running
the linter — "sounds fine to me" is exactly the failure mode this skill
exists to catch, because AI-generated cliché reads as fine to the model
that wrote it.

## 1. Draft from a template, not a blank page

| Writing | Template |
|---|---|
| Hero headline / tagline | `templates/hero-headline.md` |
| Project case study | `templates/project-description.md` |
| About/bio section | `templates/about-section.md` |
| Page `<title>` / meta description | `templates/seo-metadata.md` |

Each template gives the structural formula, a do/don't list, and a
generic-vs-specific example pair. Match the *structure*; never copy the
example sentences verbatim into the site.

## 2. Lint every draft before it ships

```bash
node .claude/skills/portfolio-writing/scripts/lint-copy.mjs <file> [file...]
```

Works on `.md` drafts and directly on `.tsx`/`.jsx` (it extracts JSX
text nodes and `title`/`description`/`alt`/`aria-label` string literals,
so you can lint a component file in place). Flags:

- **`ai-cliche`** — phrases that read as generic AI marketing copy
  ("delve into", "cutting-edge", "unlock the power of", "seamlessly
  integrate", "world-class", "boasts a", "myriad of", ...). Rewrite with
  a concrete noun/verb instead of the vague superlative.
- **`connective-tissue`** — sentences opening with "Furthermore,"
  "Moreover," "Additionally," — the tell of paragraph-by-paragraph
  AI generation. Cut the word or merge the sentences.
- **`long-sentences`** — average sentence length over ~26 words. Split it.
- **`low-readability`** — Flesch reading ease under 40. This is a
  portfolio, not a research abstract; write for a tired recruiter
  skimming on a phone.
- **`em-dash-overuse`** — more than ~3 em dashes per 100 words. One or
  two per page reads as a writer's choice; a chain of them reads as a
  model's tic.

Exit code is `1` if anything was flagged, `0` if clean — treat it as a
gate, same as a linter for code.

## 3. Check SEO metadata separately

```bash
node .claude/skills/portfolio-writing/scripts/check-seo.mjs [path]
```

Finds every `export const metadata` / `generateMetadata` in the given
path (defaults to `src`, also accepts a single file) and flags:
placeholder text left over from scaffolding (`Create Next App`,
`Lorem ipsum`, ...), titles outside 15-60 characters, descriptions
outside 70-160 characters. See `templates/seo-metadata.md` for the
target shape.

## 4. Tone consistency

This site's copy voice (derived from the project's own "Premium,
Minimal, Fast, Elegant, Intentional" UI philosophy in `CLAUDE.md`,
applied to words instead of pixels):

- **Concrete over abstract.** A real number, name, or decision beats an
  adjective every time. If a sentence would still be true on literally
  anyone else's portfolio, it's too abstract — make it specific to this
  person's actual work.
- **Confident, not hyped.** State what you built and what happened.
  Skip the superlatives ("world-class", "revolutionary") — let the
  specifics carry the confidence.
- **Short sentences, plain words.** Prefer "use" to "utilize," "build"
  to "leverage," one clause to two. This is enforced by `lint-copy.mjs`,
  not just a style preference.
- **First person, present tense** for anything about the person; match
  whatever the existing pages already use — don't mix "I build..." on
  one page with "Alvaro builds..." on another. If you're the first page
  establishing voice, default to first person.
- **Technically accurate over impressive-sounding.** Never describe a
  technology, metric, or outcome in a way you (the agent) can't verify
  from the actual project/code. If a claim can't be confirmed, flag it
  to the user rather than writing a plausible-sounding number.

## 5. Before calling copy done

- [ ] Drafted from the matching template's structure
- [ ] `lint-copy.mjs` returns 0 findings (or every flagged phrase was a
      deliberate, justified exception)
- [ ] `check-seo.mjs` is clean for any metadata touched
- [ ] Every factual/technical claim is verifiable from the codebase or
      something the user told you — not invented to sound good
- [ ] Read it aloud once. If it doesn't sound like something a person
      would say, it's not done.
