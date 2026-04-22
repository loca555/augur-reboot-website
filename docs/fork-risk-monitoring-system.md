---
title: Fork Risk Monitoring System
tags: [fork-risk, github-actions, monitoring]
---

# Fork Risk Monitoring System

> **Purpose**: How we continuously monitor Augur fork risk 24/7 using GitHub Actions.
> **Complementary doc**: See [[fork-risk-assessment]] for calculation methodology and risk thresholds.
> **Implementation spec**: See [[fork-risk-strategy]] for the rationale behind each design decision.

---

## Overview

| Aspect | Value |
|--------|-------|
| Frequency | Hourly (`0 * * * *`) + push + manual trigger |
| Architecture | Three-job pipeline: `risk-monitor` → `build` → `deploy` |
| Cache | `actions/cache` with static key (`event-cache-v1`) |
| Concurrency | Top-level group `fork-risk-pipeline`, queued not cancelled |
| Data integrity | Fail the build if fork-risk data is missing — no fake data, no stale deploys |

---

## Why Hourly Monitoring is Sufficient

Augur disputes have 7-day resolution windows. Hourly checks provide:
- Detection within ~60 minutes of any dispute activity
- 168 data points per dispute window (far exceeds requirements)
- Negligible RPC cost (~175 calls per incremental run)

See: `scripts/calculate-fork-risk.ts` (incremental query logic) for implementation.

---

## Architecture

### Three-Job Pipeline

```
risk-monitor          →  build              →  deploy
(calculate risk)         (build site)          (deploy to Pages)
     │                      │                      │
     │  upload artifact     │                      │
     ├──────────────────────┤                      │
     │                      │  upload Pages         │
     │                      ├───────────────────────┤
     │                      │                      │
     │  save cache          │                      │
     ├──────────┐           │                      │
     │          cache       │                      │
```

**Job 1: `risk-monitor`** (always runs)
- Shallow checkout (`fetch-depth: 1`)
- Restore event cache from `actions/cache`
- Run `scripts/calculate-fork-risk.ts`
- Save updated cache to `actions/cache`
- Upload `fork-risk.json` as artifact

**Job 2: `build`** (always runs)
- Download `fork-risk-data` artifact
- Verify `fork-risk.json` exists — **fail if missing**
- Build Astro site
- Upload `github-pages` artifact

**Job 3: `deploy`** (main branch only)
- Download `github-pages` artifact
- Deploy to GitHub Pages

### Why no `cache-rebuild` job

The script self-heals from an empty or corrupted cache. When the cache is
missing, it performs a 30-day event scan from scratch. A separate
`cache-rebuild` job doing the same thing without feeding into the build
pipeline is dead code.

### Why no `risk-changed` gate

The old workflow skipped build/deploy when risk hadn't changed. This assumed
stability between runs, but direct on-chain reads (`getSize()`) can produce
different values on any block. The gate also never worked — it compared
against a file that was never committed to git. The complexity caused the
original bug where data never reached the site.

Building and deploying a static Astro site once per hour is negligible CI
cost. Always building is simpler and more reliable.

### Why no bootstrap fallback

The old workflow created a `fork-risk.json` with `riskLevel: "none"` when the
artifact was missing. This is dishonest — "none" claims we checked and found
no disputes, but we actually couldn't check.

**What happens instead:**

| Scenario | Result |
|----------|--------|
| `risk-monitor` succeeds | Fresh data → build → deploy |
| `risk-monitor` fails | Pipeline stops. Site stays on last good deploy. "Last updated" timestamp shows staleness. |
| First-ever deploy, `risk-monitor` fails | Build fails (no `fork-risk.json`). Site doesn't exist until a run succeeds. |

No `continue-on-error`. No fake data. If we don't have real data, we don't deploy.

---

## Concurrency

Top-level concurrency group for the entire workflow:

```yaml
concurrency:
  group: fork-risk-pipeline
  cancel-in-progress: false
```

This prevents:
- **Duplicate artifacts** — two runs producing separate `github-pages` artifacts
  (caused a deploy failure on the old workflow)
- **Cache races** — two runs writing to the cache simultaneously
- **Queues rather than cancels** — preserves data integrity

---

## Cache Strategy

### Static cache key

```yaml
- uses: actions/cache@v5
  with:
    path: public/cache/event-cache.json
    key: event-cache-v1
```

Each run overwrites the same entry. No proliferation of cache entries.

**Why not `hashFiles`**: The old workflow used
`event-cache-${{ runner.os }}-${{ hashFiles('public/cache/event-cache.json') }}`.
Since the script updates tracked markets every run, the file hash changes every
run, creating a new cache entry each time. The repo accumulated 148+ entries.
A static key keeps it to one.

### What the cache holds

| Field | Purpose | Pruned? |
|-------|---------|---------|
| `lastQueriedBlock` | Where to resume incremental scanning | Updated each run |
| `trackedMarkets` | Known dispute markets | Only removed when `isFinalized()` on-chain |
| `events` | Recent contribution/completed events | 7-day rolling window |

### Cold start (cache evicted)

When the cache is missing, the script:
1. Creates an empty cache (`lastQueriedBlock: 0`)
2. Performs a 30-day event scan (~810 RPC calls, ~7 minutes)
3. Loads the seed file (`public/data/dispute-markets-seed.json`) for guaranteed market coverage
4. Verifies all markets on-chain
5. Saves the warm cache for the next run

The seed file ensures no markets are missed even when the event scan is partial.

---

## Data Flow

```
GitHub Actions (hourly)
    │
    ▼
calculate-fork-risk.ts
    │
    ├── Restore cache (actions/cache)
    ├── Load seed file (dispute-markets-seed.json)
    ├── Query events (incremental: ~50 blocks, cold: 30 days)
    ├── Merge sources: seed + tracked markets + events
    ├── Verify each market on-chain (isFinalized, getNumParticipants, getSize)
    ├── Calculate risk % = (largest bond / forkThreshold) × 100
    ├── Save cache + fork-risk.json
    │
    ▼
artifact: fork-risk-data
    │
    ▼
Astro build → dist/data/fork-risk.json
    │
    ▼
GitHub Pages deployment
    │
    ▼
Frontend fetches JSON → displays gauge
```

---

## Workflow Triggers

| Trigger | risk-monitor | build | deploy |
|---------|-------------|-------|--------|
| Schedule (hourly) | ✓ | ✓ | ✓ (main only) |
| Push to main | ✓ | ✓ | ✓ |
| PR to main | ✓ | ✓ | ✗ |
| `workflow_dispatch` | ✓ | ✓ | ✓ (main only) |

---

## Output: fork-risk.json

```json
{
  "lastRiskChange": "2026-04-22T02:04:47.000Z",
  "blockNumber": 24931325,
  "riskLevel": "low",
  "riskPercentage": 0.79,
  "metrics": {
    "largestDisputeBond": 2162,
    "forkThresholdPercent": 0.79,
    "activeDisputes": 3,
    "disputeDetails": [
      {
        "market": "0x963eed85...",
        "description": "Artemis Market",
        "bondSize": 2162,
        "round": 5,
        "participants": 6
      }
    ]
  },
  "rpcInfo": {
    "endpoint": "https://ethereum-rpc.publicnode.com",
    "latency": 632,
    "fallbacksAttempted": 0
  },
  "calculation": {
    "forkThreshold": 274859
  },
  "cacheValidation": {
    "isHealthy": true
  }
}
```

See: `src/types/gauge.ts` for TypeScript interface.

---

## Failure Handling

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| RPC endpoint down | Connection timeout | Auto-fallback to next endpoint |
| All RPC endpoints down | All 4 fail | Script fails, pipeline stops, retry next hour |
| Cache corruption (reorg) | Script self-heals | 30-day rescan on next run if data looks wrong |
| GH Actions cache miss | No restore hit | 30-day scan + seed file, then warm for next run |
| Artifact upload/download fails | Missing file check | Build fails, no deploy, site stays on last good version |
| Workflow failure | Job fails | Cache unchanged from last successful save, retry next hour |

---

## RPC Cost Analysis

**Incremental run (warm cache, common case):**
- Block number query: 1 call
- Event queries: ~3 calls (~250 blocks, 1 chunk × 3 event types)
- On-chain verification: ~24 calls (3 markets × ~8 participant reads)
- **Total: ~28 calls** — negligible

**Cold start (cache evicted):**
- 30-day scan: ~810 calls (270 chunks × 3 event types)
- On-chain verification: ~24 calls
- **Total: ~835 calls, ~7 minutes**
- Happens only when cache is lost

**Daily budget (24 incremental runs):**
- ~670 calls/day — well within free tier limits

---

## Code References

| Component | Location |
|-----------|----------|
| Workflow | `.github/workflows/build-and-deploy.yml` |
| Calculation script | `scripts/calculate-fork-risk.ts` |
| Diagnostic probe | `scripts/probe-fork-state.ts` |
| Seed file | `public/data/dispute-markets-seed.json` |
| TypeScript interface | `src/types/gauge.ts` |
| Data provider | `src/providers/ForkDataProvider.tsx` |
| Gauge display | `src/components/ForkGauge.tsx` |
| Details card | `src/components/ForkDetailsCard.tsx` |

---

## References

- [[fork-risk-assessment]] — calculation methodology and risk thresholds
- [[fork-risk-strategy]] — implementation spec and design rationale
- [[augur-protocol-v2-reference]] — fork triggers, dispute bonds, REP migration
- [Etherscan Forked Blocks](https://etherscan.io/blocks_forked)
- [GitHub Actions Caching](https://docs.github.com/en/actions/using-workflows/caching-dependencies-and-artifacts)
- [Ethereum PoS Finality](https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/)
