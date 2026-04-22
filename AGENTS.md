# Augur Reboot Website

## Behavioral Principles

Always-on rules that shape how you think and act. Skills layer structured process on top of these when the situation calls for it.

### Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### Surgical Changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused. Don't remove pre-existing dead code unless asked.

Every changed line should trace directly to the user's request.

### Verify Before Declaring Done

- "Add a feature" → build it, then verify: `npm run typecheck`, `npm run lint`, `npm run build`
- "Fix the bug" → reproduce it visually in dev server, fix, then verify: typecheck + lint + build
- "Refactor X" → verify typecheck + lint + build pass before and after

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

## Knowledge Base

`docs/` is the persistent knowledge layer — design docs, protocol references, feature specs, whitepaper summaries.

- `docs/INDEX.md` — content catalog, start here to find relevant pages
- `docs/SCHEMA.md` — conventions and operations, read before writing to docs

Consult `docs/INDEX.md` before taking action.

## Technical Constraints

- **Astro 5.10+** — build-time HTML with selective client hydration. No full SPA mode.
- **Dual TypeScript Runtimes** — frontend (`tsconfig.app.json`) and backend scripts (`tsconfig.scripts.json`) have separate compilation contexts.
- **Static deployment only** — GitHub Pages hosting. No SSR or dynamic routes. Verify sitemap generation in GitHub Actions.
- **Astro scoped styles** — component `<style>` blocks are auto-scoped with `data-astro-cid-*`. Use `is:global` for truly global styles.

## Architectural Decisions

- **Frontend**: Astro 5.10+ with React 19 islands. Always specify hydration directives (`client:load` for critical animations). **Components without hydration are not interactive.**
- **Styling**: Tailwind v4 CSS-first via `@theme`/`@utility` directives in `src/styles/global.css`. No `tailwind.config.js` — it doesn't exist.

## Team Conventions

- **Component state**: Nanostores for global state + React Context for providers. State lives in stores/context ONLY, never in components. Components are purely reactive. Initialization logic belongs in stores, not `useEffect`.
- **Dev server**: Check port first — `lsof -ti:4321`. Only run `npm run dev` if free.
- **Quality gates**:
  - **Pre-commit** (required): typecheck, lint.
  - **Pre-merge** (required): typecheck, lint, build.
- **GPU resources**: WebGL components MUST implement `dispose()` and call it in `useEffect` cleanup. Guard with `isDisposed` flag. Never render after disposal.
- **Styling**: ALWAYS edit `src/styles/global.css` ONLY. Custom utils: `fx-glow`, `fx-glow-*`, `fx-box-glow`, `fx-box-glow-*`, `fx-pulse-glow`.
- **Skills**: `fork-gauge` for visualizations, `blogging` for content, `island-state` for state patterns, `tailwind-v4-validator` for Tailwind class validation.

## Git Workflow

- DO NOT auto-commit unless explicitly instructed.
- Stage all changes and wait for direction before committing.
