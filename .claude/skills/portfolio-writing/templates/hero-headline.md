# Hero headline

**Formula:** [what you build] + [for whom / at what level] + [the one
outcome that matters]. Cut anything that doesn't fit one of those three
slots.

**Target:** 40-70 characters for the primary line (fits one viewport
line at most sizes, matches the SEO title budget checked by
`check-seo.mjs`). A supporting subline (1 sentence, ~80-140 chars) can
carry detail the headline can't.

## Do

- Lead with a concrete noun (what you build / do), not an adjective
  about yourself ("Full-stack engineer who ships fast" not "Passionate
  full-stack engineer").
- Name a real outcome or specialization, not a category everyone shares
  ("Building checkout flows that convert" beats "Building great
  software").
- Read it aloud. If it sounds like it could headline anyone's site,
  rewrite it.

## Don't

- Don't open with "Welcome to my portfolio" or "Hi, I'm ___" as the
  entire headline — that's a caption for a photo, not a value
  proposition.
- Don't stack more than one adjective before a noun ("innovative,
  cutting-edge, scalable solutions" — pick the one true claim).
- Don't promise a superlative you can't back up two lines later
  ("world-class", "best-in-class", "unparalleled").

## Examples

| Generic (avoid) | Specific (prefer) |
|---|---|
| "Passionate developer creating innovative solutions" | "I build data pipelines that stop breaking at 3am" |
| "Full-stack engineer with a passion for technology" | "Full-stack engineer — React on the front, Postgres on the back" |
| "Welcome to my creative portfolio" | "Interfaces for tools people use every day, not once" |

Run `node .claude/skills/portfolio-writing/scripts/lint-copy.mjs <file>`
after drafting — it catches the clichés in the left column above.
