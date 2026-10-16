# Project description

Structure every project as **Problem → Approach → Outcome**, in that
order. Skip any section you can't fill with a specific, true sentence —
a vague sentence is worse than a missing one.

## 1. Problem (1-2 sentences)

What was actually broken or missing, for whom. Name the constraint that
made it hard (deadline, legacy system, no budget, scale, ambiguous
spec) — the constraint is what makes the work interesting.

> Not: "This project needed a modern, responsive solution."
> Instead: "The existing checkout took 6 steps and lost ~30% of users
> before payment."

## 2. Approach (2-4 sentences)

What you actually did and why — the real decision, not the tech-stack
list. One genuine trade-off you made beats five buzzwords.

> Not: "Leveraged cutting-edge technologies to build a robust,
> scalable solution."
> Instead: "Cut checkout to 2 steps by moving address+payment onto one
> screen; traded a bit of form complexity for far fewer drop-off
> points."

## 3. Outcome (1-2 sentences)

A number if you have one (%, time saved, users, load time). If there's
no metric, say what changed concretely instead of inventing a vague
win — "shipped and in production since March" is honest and fine.

> Not: "The result was a seamless, game-changing user experience."
> Instead: "Conversion went from 68% to 79% in the first month; no
> regressions in returning-user checkout time."

## Tech stack line

List it separately, after the narrative, as plain facts — not folded
into the prose as adjectives ("built with a powerful, modern stack of
React, Node, and PostgreSQL"). Example: `React · Node.js · PostgreSQL ·
deployed on Vercel`.

## Checklist before shipping a project description

- [ ] Problem names a real constraint, not just "it needed to be better"
- [ ] Approach states one actual decision/trade-off you made
- [ ] Outcome has a number, or an honest concrete statement if it doesn't
- [ ] No word from the cliché list would trigger `lint-copy.mjs`
- [ ] Every technical claim is something you can defend in an interview
