# SEO metadata (Next.js `Metadata` / `generateMetadata`)

Verified against this project's Next.js version — `title` accepts a
plain string or `{ default, template }`; `description` is always a
plain string. See `src/app/layout.tsx` for the root export.

## Title

- **Length:** 15-60 characters. Longer gets truncated in search results.
- **Shape:** `[Primary identity] — [what you do / one differentiator]`.
- Set the site-wide default + template in `app/layout.tsx`:

  ```ts
  export const metadata: Metadata = {
    title: {
      default: "Álvaro Gaertner — what you build",
      template: "%s | Álvaro Gaertner",
    },
  }
  ```

- Every route below the root only needs its own short `title` string —
  the template appends the suffix automatically. Don't repeat the name
  in every page's title.

## Description

- **Length:** 70-160 characters. This is what renders under the title
  in search results — write it as the pitch, not a keyword list.
- One sentence, concrete, no filler ("a website showcasing my work" says
  nothing a search engine or a human needs).

```ts
export const metadata: Metadata = {
  description: "Portfolio of [name], a [role] who [one concrete thing you do/ship].",
}
```

## Per-project pages (if using `generateMetadata`)

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const project = await getProject(params.slug)
  return {
    title: project.name, // becomes "Project Name | Álvaro Gaertner" via the template
    description: project.oneLineSummary, // 70-160 chars, the Outcome line from project-description.md
  }
}
```

## Verify

```bash
node .claude/skills/portfolio-writing/scripts/check-seo.mjs src
```

Flags placeholder text (`Create Next App`, `Lorem ipsum`, ...) and any
title/description outside the ranges above. Must be clean before a page
ships.
