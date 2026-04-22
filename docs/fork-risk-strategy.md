---
title: Fork Risk Strategy
tags: [fork-risk, github-actions, strategy]
---

# Fork Risk Monitor: Architecture & Strategy

> **Status**: Implementation spec for the proposed workflow rewrite.
> After implementation, this content will be folded into [[fork-risk-monitoring-system]] and [[fork-risk-assessment]].
>
> **Related**: [[fork-risk-monitoring-system]] | [[fork-risk-assessment]] | [[augur-protocol-v2-reference]]

## The Problem We're Solving

The Augur fork risk meter reads live on-chain dispute state to determine
how close the Augur v2 oracle is to triggering a fork. It needs to:

1. **Discover** which markets have active disputes
2. **Read** the authoritative bond sizes from those markets
3. **Persist** knowledge of tracked markets across hourly runs
4. **Deploy** the results to a static site

## Data Flow

```
                          ┌─────────────────────┐
                          │  Augur v2 Contracts  │
                          │  (Ethereum Mainnet)  │
                          └──────────┬──────────┘
                                     │
                    RPC queries      │  on-chain reads
                    (30-day scan     │  (getSize, isFinalized,
                     on first run)   │   getNumParticipants)
                                     │
                          ┌──────────▼──────────┐
                          │  calculate-fork-risk │
                          │     (Node script)    │
                          │                      │
                          │  Inputs:             │
                          │  • Event cache       │
                          │  • Seed file         │
                          │  • RPC events        │
                          │                      │
                          │  Outputs:            │
                          │  • fork-risk.json    │
                          │  • event-cache.json  │
                          └──────────┬──────────┘
                                     │
                              artifact upload
                                     │
                          ┌──────────▼──────────┐
                          │   Astro build        │
                          │   (static site)      │
                          └──────────┬──────────┘
                                     │
                              GitHub Pages deploy
                                     │
                          ┌──────────▼──────────┐
                          │   augur.net          │
                          │   /data/fork-risk.json│
                          └─────────────────────┘
```

## Script Strategy: `calculate-fork-risk.ts`

### Market Discovery (3 sources, merged)

| Source | Location | Lifespan | Purpose |
|--------|----------|----------|---------|
| Seed file | `public/data/dispute-markets-seed.json` | Git-committed, manual update | Safety net. Guaranteed baseline when cache is cold. |
| Tracked markets | Inside `event-cache.json` | Persisted across runs via `actions/cache` | Memory of previously discovered markets. |
| Live events | RPC query of Contribution/Completed events | 30-day initial scan, incremental thereafter | Discovers newly disputed markets. |

**Priority**: Tracked markets override seed (newer `lastVerifiedBlock`). Event-discovered markets add to tracking if not already known.

### Why `DisputeCrowdsourcerCreated` events don't work

Augur v2's contract does not emit `DisputeCrowdsourcerCreated` events. Only
`DisputeCrowdsourcerContribution` and `DisputeCrowdsourcerCompleted` are
emitted. Discovery relies on Contribution events.

### Event Args Layout

Events have different indexed argument positions:

| Event | args[0] | args[1] | args[2] | args[3] |
|-------|---------|---------|---------|---------|
| Contribution | universe | reporter | **market** | crowdsourcer |
| Completed | universe | **market** | crowdsourcer | — |
| Created | universe | **market** | crowdsourcer | — |

This matters for extracting market addresses from both live EventLog objects
and serialized cached events.

### Bond Readout: `getSize()` vs `getStake()`

For each tracked market, the script reads `participants(i).getSize()` from
highest index down. `getSize()` returns the **target bond** for the round —
the value the fork threshold is measured against. `getStake()` returns
current accumulated amount (may be partial). The meter shows `getSize()` for
protocol-correct fork risk measurement.

### On-Chain Verification Lifecycle

Every run, every tracked market is verified:
1. `isFinalized()` → true: **removed from tracking** (dispute resolved)
2. `getNumParticipants()` == 0: **removed** (no dispute activity)
3. Participants have `getSize()` > 0: **kept** with bond data
4. Read error: **kept** in tracking (conservative — don't lose track)

### Event Cache Behavior

The cache (`event-cache.json`) holds:
- **Raw events**: 7-day rolling window, pruned each run
- **Tracked markets**: Never pruned by the event window

Pruning events is fine because events are only used for *discovery* — once a
market is in the tracked markets list, it stays until on-chain verification
removes it. Old events for tracked markets are redundant.

### Scan Modes

| Mode | When | Block range | Purpose |
|------|------|-------------|---------|
| Fresh/cold start | `lastQueriedBlock == 0` or `full-rebuild` | 30 days (~216K blocks) | Discover all recent disputes |
| Incremental | Cache is warm | `lastQueriedBlock - 32` to current | Catch new events only |

Incremental queries ~50 blocks (1 hour of blocks) instead of ~216,000.
The `FINALITY_DEPTH` of 32 blocks ensures no events are missed due to
chain reorganizations at the boundary.

### Cache Key Problem (Current Bug)

The `actions/cache` key is:
```
event-cache-${{ runner.os }}-${{ hashFiles('public/cache/event-cache.json') }}
```

This derives the key from the file's content hash. Since the script updates
tracked markets (and their `lastVerifiedBlock`) every run, the file changes
every run. This means:
1. Run 1 saves cache with hash X
2. Run 2 restores cache by hash X → hits
3. Run 2 updates the file → new hash Y
4. Run 2 saves cache with hash Y (new key)
5. Run 3 restores cache by hash Y → the *save* step created key Y, but...

Actually, `actions/cache` with `hashFiles` works like this:
- **Restore**: Tries exact key match, then falls back to `restore-keys` prefix
- **Save**: Always saves with the exact key

So: Run 1 saves `event-cache-Linux-abc123`. Run 2 restores it (hash of
downloaded file = `abc123`), updates it, now the file hash is `def456`. Run 2
saves `event-cache-Linux-def456`. Run 3 tries to restore
`event-cache-Linux-def456` — but the file on disk was updated by the script,
not by the cache restore. The hash is computed from the *current* file on disk.

Wait — the restore step runs *before* the script. At restore time, there is no
file (fresh runner). `hashFiles` computes the hash of the file... which doesn't
exist. So the key is always based on the file that was *previously saved*. The
restore-keys prefix `event-cache-Linux-` catches it. This actually works — the
prefix match restores the most recent cache entry.

Actually, re-reading the actions/cache docs: the key is computed at *step
evaluation time*. The `save` step at the end computes a new hash from the
updated file. So we get a growing list of cache entries with different hashes,
all matching the prefix. The most recent one is restored. This works but is
wasteful — each run creates a new cache entry.

**Better approach**: Static key like `event-cache-v1`. Always overwrite the
same cache entry. No wasted entries, always restores the latest.

## Workflow Strategy

### What the workflow needs to do (and nothing more)

1. Run the calculation script (produces `fork-risk.json` + updates cache)
2. Build the Astro site with the produced `fork-risk.json`
3. Deploy the built site to GitHub Pages

That's it. The script handles all the intelligence. The workflow is orchestration.

### Why `risk-changed` gating doesn't apply

The old workflow gated `build` and `deploy` on `risk-changed == 'true'`. This
assumed risk would often be unchanged between hourly runs, so skipping
build/deploy saves CI minutes. But:

1. The gate was based on `git diff HEAD` against a file that was never
   committed — it was always broken.
2. Even if it worked, the savings are marginal: one Astro build per hour
   on a static site is negligible CI cost.
3. With direct on-chain reads (`getSize()`), any block could change the
   risk percentage. An optimization that assumes stability is wrong.
4. The complexity of conditional build/deploy caused the original bug
   (data never reaching the site).

**Decision**: Always build and deploy on every run. Simple and reliable.

### Why `cache-rebuild` is redundant

The `cache-rebuild` job runs `full-rebuild` mode when cache validation fails.
But `full-rebuild` does exactly the same thing as a cold-start incremental
run: 30-day scan from scratch. The script already self-heals from an empty
cache. A separate job that does the same thing but doesn't feed into build
or deploy is dead code.

**Decision**: Remove `cache-rebuild`. The script handles cache recovery.

### Why `check-risk` is redundant

`check-risk` compares `fork-risk.json` against `HEAD` via `git diff`. But
`fork-risk.json` is never committed to the repo (it's generated in CI and
passed via artifact). The diff is always "everything is new", making
`risk-changed` always true. Even if we committed the file, comparing against
the previous commit's data doesn't tell us anything useful — the data is
authoritative from the chain, not from git history.

**Decision**: Remove `check-risk`. No gating based on data change.

### Why the bootstrap step must go

The bootstrap creates a `fork-risk.json` with `riskLevel: "none"` and zeros.
This is dishonest — "none" means "we checked and there are no disputes," but
we actually couldn't check. The artifact was missing.

**What should happen instead:**

- **risk-monitor fails** → pipeline stops. No build, no deploy. Site stays
  on last good deploy. The "last updated" timestamp tells the user it's stale.
- **risk-monitor succeeds** → artifact carries real data → build → deploy.
  Site shows fresh data.
- **First-ever deploy** (no previous deploy exists) → if risk-monitor fails,
  build fails because there's no `fork-risk.json`. Fix the issue, re-run.
  Site appears once risk-monitor succeeds at least once.

The `download-artifact` step must not have `continue-on-error`. If the
artifact isn't there, the build fails explicitly:

```yaml
- name: Download fork-risk data from risk-monitor
  uses: actions/download-artifact@v4
  with:
    name: fork-risk-data
    path: public/data

- name: Verify fork-risk data exists
  run: test -f public/data/fork-risk.json
```

No bootstrap. No fake data. If we don't have real data, we don't deploy.

**Decision**: Remove the bootstrap step and `continue-on-error`.

### Proposed Job Structure

```
risk-monitor          →  build           →  deploy
(calculate risk)         (build site)       (deploy to Pages)
     │                      │                   │
     │  upload artifact     │                   │
     ├──────────────────────┤                   │
     │                      │  upload Pages     │
     │                      ├───────────────────┤
     │                      │                   │
     │  save cache          │                   │
     ├──────────┐           │                   │
     │          cache       │                   │
```

Concurrency: top-level group `fork-risk-pipeline` ensures the entire
pipeline finishes before the next run starts. Prevents duplicate artifacts
and cache races.

Three jobs, sequential, always run on `main`:

| Job | Runs on | What it does |
|-----|---------|--------------|
| `risk-monitor` | All events (push, PR, schedule) | Run script, upload `fork-risk.json` artifact, save cache |
| `build` | All events | Download artifact, build Astro site, upload Pages artifact |
| `deploy` | `main` only | Download Pages artifact, deploy to GitHub Pages |

For PRs: `risk-monitor` + `build` run (validates the script works and the site builds).
No deploy.

### Workflow Triggers

| Trigger | risk-monitor | build | deploy |
|---------|-------------|-------|--------|
| Schedule (hourly) | ✓ | ✓ | ✓ (main only) |
| Push to main | ✓ | ✓ | ✓ |
| PR to main | ✓ | ✓ | ✗ |
| workflow_dispatch | ✓ | ✓ | ✓ (main only) |

### Cache Configuration

```yaml
- uses: actions/cache@v5
  with:
    path: public/cache/event-cache.json
    key: event-cache-v1  # Static key — always overwrite with latest
```

Restore happens before the script. Save happens after. The static key means
each run overwrites the previous entry. No cache key proliferation.

### Concurrency

Top-level concurrency group for the entire workflow:

```yaml
concurrency:
  group: fork-risk-pipeline
  cancel-in-progress: false
```

This prevents the duplicate-artifact issue (where two runs produce separate
`github-pages` artifacts, confusing the deploy step) and eliminates cache
race conditions. The per-job `fork-risk-cache` group on `risk-monitor`
becomes unnecessary — the top-level group is stricter.

### Checkout Depth

`risk-monitor` uses `fetch-depth: 0` currently. This is overkill — it only
needs the current commit's `public/data/dispute-markets-seed.json`. Shallow
checkout (`fetch-depth: 1`) is sufficient and faster.

`build` also only needs a shallow checkout — it builds from the current
commit's source code.

---

## Known Issues (as of current `main`)

1. ~~Artifact passing~~ **Fixed** in `c43b7f0`. The `risk-monitor` → `build`
   artifact chain now works.

2. **Cache key proliferation** — each run creates a new cache entry due to
   `hashFiles` key. Wasteful but functional. Fix: static key.

3. **`cache-rebuild` job is dead code** — produces output that nothing consumes.
   Fix: remove it.

4. **`check-risk` step is broken** — `git diff` against a file never committed.
   Fix: remove it.

5. **Bootstrap step is necessary** — not redundant with client fallback,
   because GitHub Pages serves the *previous deploy's* `fork-risk.json` on
   a successful fetch, not a 404. Without the bootstrap, stale data persists
   silently.

6. **`validateCacheHealth` is correct but low-value** — it extracts
   crowdsourcer addresses from fresh events (args[2] for Created/Completed,
   args[3] for Contribution) and compares against cached
   `disputeCrowdsourcerAddress`. The comparison is valid. However, validation
   failure only triggers the now-redundant `cache-rebuild` job, and the
   tracked-markets strategy makes cache corruption self-healing. Consider
   whether the extra RPC calls for validation are worth keeping.

7. **Live site serving stale data** — `augur.net` serves a `fork-risk.json`
   from December 2025 with the old schema. The latest deploy (c43b7f0) failed
   due to duplicate `github-pages` artifacts from concurrent runs. A re-run
   should fix this, but the duplicate artifact issue needs addressing.

8. **`CACHE_VERSION` not bumped** — we added `trackedMarkets` to the cache
   schema but kept `CACHE_VERSION = '1.0.0'`. The migration in `validateCache`
   handles this (adds empty `trackedMarkets`), but a version bump would be
   cleaner for debugging.

---

## Stress-Test: Edge Cases & Accepted Risks

### Partial cold-start scan

If the 30-day scan fails partway (e.g., rate-limited at chunk 400 of 650),
the script stops early, uses partial data, and saves the cache with
`lastQueriedBlock = currentBlock`. Next run is incremental and only scans
the next hour's blocks. Markets in the unscanned portion are invisible to
event discovery.

**Mitigation**: Seed file covers known markets. A meaningful dispute that's
been active for weeks with zero recent contributions is extremely unlikely —
bond-doubling rounds require new contributions roughly every 7 days.

**Accepted risk**.

### Parallel runs

Without top-level concurrency, a push at :59 and a schedule at :00 overlap.
Both produce `github-pages` artifacts. Deploy fails with "Multiple artifacts
named 'github-pages' were unexpectedly found."

**Fix**: Top-level `concurrency: fork-risk-pipeline`. Already in proposal.

### Seed file staleness

When markets resolve, the script removes them from tracking. But the seed
file still lists them — they're silently ignored (isFinalized check). New
disputes that emerge rely on event discovery + 30-day scan.

A dispute 31+ days old with zero contributions in the last 30 days would be
invisible to both seed and events. But disputes escalate via bond-doubling
rounds that require regular contributions. A 31-day gap means the dispute
window expired → market finalized → not a concern.

**Accepted risk**.

### Missing artifact in build job

If artifact download fails, the build fails, the deploy doesn't run. The site
stays on the last good deploy with its "last updated" timestamp indicating
staleness. For first-ever deploys, the site doesn't exist until risk-monitor
succeeds at least once.

**Mitigation**: Fail the build on missing artifact. No bootstrap.

### Push + schedule overlap

A push deploy and scheduled deploy can queue back-to-back with the concurrency
group. The second deploy is redundant (same data) but harmless. ~8 minutes of
CI time wasted.

**Accepted**.

---

*Last updated: 2026-04-22*
