# Documentation Index

Start here to find the right doc. Read deeper only when the task calls for it.

## Core Systems

| Doc | When to Read |
|---|---|
| [Fork Risk Monitoring System](fork-risk-monitoring-system.md) | GitHub Actions pipeline: three-job workflow, cache strategy, concurrency, failure handling, RPC costs |
| [Fork Risk Assessment](fork-risk-assessment.md) | Fork risk calculation methodology, thresholds, blockchain data sources, market tracking, RPC failover strategy |
| [Fork Risk Strategy](fork-risk-strategy.md) | Implementation spec for the workflow rewrite — design rationale, proposed job structure, edge case analysis. Will be absorbed into other docs after implementation. |

## Architecture & UI

| Doc | When to Read |
|---|---|
| [Technical Architecture](technical-architecture.md) | React/TypeScript component hierarchy, state management (Context API), UI patterns, visual rendering |
| [FAQ Feature](faq-feature.md) | FAQ page design, route, collapsible Q&A, landing page/footer integration |
| [Blog Feature](blog-feature.md) | Blog frontmatter schema, MDX integration, RSS feed, Learn section |

## Protocol Reference

| Doc | When to Read |
|---|---|
| [Augur Protocol v2 Reference](augur-protocol-v2-reference.md) | Fork triggers, dispute bonds, REP migration, security model, protocol constants (275K REP, 60-day fork) |

## Protocol & Whitepaper Summaries

Distilled knowledge from source whitepapers — read when building features related to Augur's market/oracle system or the next-generation Lituus oracle. Original PDFs live in `docs/raw/` and are immutable.

| Doc | When to Read |
|---|---|
| [Augur v2 Whitepaper Summary](augur-v2-whitepaper-summary.md) | Augur v2 — market lifecycle, dispute mechanics, forking, security |
| [Lituus Whitepaper Summary](lituus-whitepaper-summary.md) | Lituus — MBUFSR oracle, escalation game, fee economics, oracle class comparison |
| [Protocol Evolution: Augur to Lituus](protocol-evolution-augur-to-lituus.md) | How Augur v2 (MBUF) evolved into Lituus (MBUFSR) |
