---
name: documentation
description: >
  Teaches AI agents how to operate the LLM-maintained documentation at docs/ in the project root.
  Triggered on session boot (for orientation), when the user wants to capture knowledge
  ("remember this", "add to docs", "ingest"), when asking questions against accumulated
  knowledge ("what do we know about", "query docs"), or when requesting maintenance
  ("lint docs", "health check").
---

# Documentation Skill

The documentation is the persistent, agent-agnostic knowledge layer for this project. It's a
collection of interlinked markdown pages that any LLM incrementally builds and maintains.
Knowledge is compiled once and kept current — not re-derived on every session.

The documentation lives at `docs/` in the project root.

---

## 1. Orientation (do this on boot)

When starting work on this project:

1. Read `docs/SCHEMA.md` — understand conventions and operations.
2. Read `docs/INDEX.md` — scan the content catalog for what exists.
3. Read specific documentation pages relevant to the current task (be selective, not exhaustive).
4. Absorb the content. Do not recite it back; let it inform your work.

If `docs/INDEX.md` does not exist, the documentation is empty. Skip orientation.

---

## 2. When to Write to Docs

Apply this litmus test:

> "Would this be useful next week, from a different agent, after a fresh clone?"

If yes — write it. If no — leave it in conversation or native memory.

**Write to the documentation when:**
- A user preference, working style, or constraint is confirmed
- A project reaches a meaningful milestone or architecture decision
- Feedback is given that should shape future agent behavior
- A reference fact is established (infrastructure, naming conventions, tool config)
- Something was hard to find or figure out and will be hard again
- A query answer is worth preserving as synthesized knowledge

**Do not write to the documentation for:**
- Debugging sessions and one-off fixes
- Code patterns (those belong in code or project docs)
- Git history (that's what commits are for)
- Ephemeral state (current branch, what's in the diff right now)

When in doubt, write it. A weak page can be pruned. Missing knowledge costs re-discovery.

---

## 3. Operations

### Ingest

When the user provides information to capture directly, or a new source document needs to be synthesized:

1. Read the source document fully.
2. Discuss key takeaways with the user (skip if they prefer speed).
3. For each piece of durable knowledge:
   - Check `docs/INDEX.md` — does a page for this topic already exist?
   - If yes: read the page, update it with new information, maintain cross-references.
   - If no: create a new page with frontmatter, body, and Obsidian-compatible wikilinks to related pages.
4. Update existing pages that reference or relate to the new content.
5. Update `docs/INDEX.md` with new or changed entries.
6. Commit all changes: `git add docs/ && git commit -m "docs: ingest | <source name>"`

### Query

When the user asks a question against the documentation:

1. Read `docs/INDEX.md` to find relevant pages.
2. Read those pages. Synthesize an answer with references to documentations pages.
3. If the answer represents valuable synthesis, offer to file it:
   - Create a new documentation page with the answer.
   - Update `docs/INDEX.md`.
   - Commit: `git add docs/ && git commit -m "docs: query | <question summary>"`

### Lint

When the user requests a health check (`lint docs`, `health check`):

1. Read all documentation pages (or a targeted subset).
2. Check for:
   - Contradictions between pages
   - Orphan pages with no inbound `[[wikilinks]]`
   - Stale claims superseded by newer information
   - Concepts mentioned across pages but lacking their own page
   - Missing cross-references that should exist
3. Fix what you can. Report what needs user input.
4. Commit fixes: `git add docs/ && git commit -m "docs: lint | <summary>"`

---

## 4. Page Conventions

- **Filename:** lowercase, hyphenated. Must match the wikilink reference.
- **Frontmatter:** YAML with `title` (required) and `tags` (list, optional).
- **Cross-references:** Use `[[page-name]]` Obsidian-compatible wikilinks. The LLM maintains these.
- **Structure:** No fixed template. Entities, concepts, summaries, and synthesis pages
  each have natural shapes. Let the content dictate the form.

Example frontmatter:

```yaml
---
title: ws CLI
tags: [tooling, workspace]
---
```

---

## 5. Updating Pages

When facts change — a project version bumps, infrastructure moves, preferences shift:

- Update the existing page. Do not create a duplicate.
- Update cross-references on pages that link to the changed page if needed.
- Update the index entry if the summary changed.

Pages are living documents. Replace stale facts; don't append changelogs.
