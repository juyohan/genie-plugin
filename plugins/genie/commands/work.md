---
description: 플랜에 따라 구현을 실행합니다 — 기능을 완성해서 배포합니다
model: sonnet
---

> **[스테이지 경계]** 이 단계가 완료되면 **반드시 멈추십시오.**
> 산출물을 출력한 뒤 대기합니다. 다음 단계 (`/genie:review`)는 사용자가 직접 실행합니다.



# `genie:work`

> Execute against the plan's guardrails — figure out the HOW with code in front of you, ship complete features, hand off to a clean PR.

`genie:work` is the **execution** skill. It takes a plan (or, for smaller scope, a bare prompt), executes the implementation against the plan's guardrails, runs tests continuously, dispatches subagents in isolated worktrees when scope warrants, runs quality gates, and hands off to a commit + PR flow. It treats the plan as a **decision artifact** — authoritative for scope, decisions, units, and tests — and figures out the actual implementation itself. **It is the HOW phase that `genie:plan` deliberately does not pre-write.**

This is the fourth and final step in the compound-engineering ideation chain:

```text
/genie:think         /genie:brainstorm      /genie:plan             /genie:work
"What's worth      "What does this     "What's needed       "Build it."
 exploring?"        need to be?"        to accomplish
                                        this?"
```

`genie:work` is software-focused — it commits, runs tests, opens PRs, and integrates with code review skills. For non-software plans (study plans, hot-water-tank maintenance, trip planning) the chain effectively ends at `genie:plan` and a human executes those themselves.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Reads a plan (or scopes a bare prompt), executes against the guardrails, runs tests continuously, ships a reviewed PR |
| When to use it | Implementing a `genie:plan` plan; small/medium bare-prompt work; resuming partly-shipped work |
| What it produces | Commits + a PR (or just commits, no-PR path) |
| What's next | Review the PR; run `/genie:learn` to capture learnings |
| Distinguishing | Plan-aware idempotency, subagent dispatch with worktree isolation, tiered review with residual gate, operational validation in PR |

---

## The Problem

Asking an agent "implement this plan" goes wrong in predictable ways:

- **Reimplementing already-shipped work** when picking up a partly-finished branch
- **Treating the plan as a script** — editing the literal files listed even when a different shape would be cleaner
- **Tests with everything mocked** — proves logic in isolation; says nothing about whether layers interact correctly
- **Half-finished features** — visible work done, callbacks unwired, edge cases untouched
- **Parallel work with silent data loss** — multiple agents writing the same file in a shared directory; only the last write survives
- **No quality gate** — the diff goes straight to PR with no simplification pass, no review, no operational monitoring

## The Solution

`genie:work` runs execution as a structured process with explicit gates:

- The plan is authoritative for **WHAT**; the agent figures out **HOW** with code in front of it
- An idempotency check before each task — if verification is already satisfied, skip it
- Scope-appropriate dispatch (inline / serial subagents / parallel subagents in isolated worktrees)
- Test discovery + integration coverage + a system-wide test check before any task is marked done
- Tiered code review with a residual-work gate — accept, file, fix, or stop, but never silently ship
- Every PR carries an operational validation plan — what to monitor, what triggers rollback

---

## What Makes It Novel

### 1. Plan-aware execution — honors the WHAT/HOW separation

`genie:work` reads the plan as a decision artifact, not a script. Scope, decisions, U-IDs, files, test scenarios, and verification criteria are authoritative — the agent figures out the actual implementation itself. The plan body stays read-only during execution; progress lives in git commits and the task tracker.

### 2. Idempotent re-execution

Before each task, `genie:work` checks whether the unit's work is already present and matches the plan's intent. If verification is already satisfied, mark the task complete and move on. **No silent reimplementation.** This matters most when resuming after context compaction, picking up someone else's branch, or returning to a partly-shipped plan weeks later.

### 3. Worktree-isolated parallelism — explicit conflicts, not silent data loss

For independent units that can run in parallel, `genie:work` defaults to per-subagent worktree isolation when the harness supports it: each subagent on its own branch in its own directory. Predicted overlaps surface as merge conflicts the orchestrator handles explicitly. When isolation isn't available, subagents are barred from staging or committing and the orchestrator merges the batch serially. Either way, **no silent overwrites.**

### 4. U-ID anchoring across execution

When the plan defines U-IDs, they propagate as task prefixes, into commit messages, and into the final summary. This works *across plan edits* — a deepening pass that splits a unit doesn't break references because U-IDs are stable. Brainstorm-origin IDs (R/A/F/AE) are similarly preserved when present.

### 5. Test quality gates before "done"

A task isn't done when the code compiles. Before marking any feature-bearing task complete, `genie:work` discovers the existing test files for what's being changed, checks that test scenarios cover the categories that apply (happy path, edges, error paths, integration), and traces two levels out for callbacks, middleware, and observers the change might affect. Mocking everything proves logic in isolation; integration coverage is what proves the layers actually work together.

### 6. Tiered code review with explicit residual handling

Every change gets reviewed. Default is harness-native (e.g., `/review` in Claude Code) — fast, sufficient for most diffs. Escalate to `genie:review` only on a real signal: sensitive surface, large and diffuse change, or explicit request. When a deeper review surfaces residuals the autofix didn't resolve, `genie:work` doesn't silently ship — it surfaces a four-option gate (apply / file tickets / accept with durable sink / stop). "Accept" requires a real durable record; findings can't live only in the transient session.

### 7. Operational validation as a default

Every PR description includes a `Post-Deploy Monitoring & Validation` section: log queries, metrics to watch, expected healthy signals, failure signals, rollback triggers. If there's truly no production impact, the section still exists with that as the recorded decision rather than an implicit one.

### 8. Smart triage on bare prompts

Not every invocation has a plan. `genie:work` accepts a bare prompt and triages by complexity: trivial work (a couple of files, no behavioral change) goes straight to implementation; small/medium work builds a task list; large or sensitive work surfaces a recommendation to use `/genie:brainstorm` or `/genie:plan` first. The triage is what makes `genie:work` reasonable for direct invocation on small work, without forcing the full chain for everything.

---

## Quick Example

A plan with four implementation units arrives. `genie:work` reads it, picks up an `Execution note: test-first` on one unit, and notes a deferred-implementation question to keep in mind. It builds a task list with U-ID prefixes and confirms the current branch name is meaningful.

The Parallel Safety Check finds no file overlap across the four units and worktree isolation is available — so all four dispatch in parallel, each on its own branch. They complete; the orchestrator merges them in dependency order; tests pass after each merge. The idempotency check catches that one unit's verification was already satisfied by a prior session and marks it complete without reimplementation.

The diff isn't on a sensitive surface and isn't large/diffuse, so harness-native review handles it; the two suggested findings are addressed inline. Final validation passes; the operational validation plan is drafted; the plan's frontmatter flips `active → completed`; and `genie:commit` opens the PR with summary, testing notes, the operational section, and a Compound Engineered badge.

---

## When to Reach For It

Reach for `genie:work` when:

- A `genie:plan` plan is ready and you're ready to ship
- You have small or medium work without a plan — bare-prompt mode handles it
- You're resuming partly-shipped work
- You want parallel execution with safe isolation
- You want a complete shipping flow — tests, simplify, review, residuals, operational validation, PR

Skip `genie:work` when:

- Product behavior isn't decided yet → `/genie:brainstorm`
- Implementation guardrails aren't established for non-trivial work → `/genie:plan`
- The bug has a known root cause and an obvious fix → `/genie:fix`
- The task is non-software — execution there is a human activity

---

## Use as Part of the Chained Workflow

```text
/genie:think          (optional)
   |
   v
/genie:brainstorm
   |  requirements / brief
   v
/genie:plan
   |  guardrails — U-IDs, files, test scenarios, scope, risks
   v
/genie:work
   |  honors the guardrails; figures out the HOW with code in front of it
   |  derives progress from git, not plan body
   |  ships through quality gates to PR
   v
/genie:review     (optional escalation; auto-invoked at Tier 2)
   |
   v
/genie:learn        — capture the learning
```

After shipping, `/genie:learn` captures any reusable learning (bugs encountered, patterns established, conventions adopted) into `docs/solutions/` so future runs of `genie:plan` and `genie:work` benefit from the institutional memory.

---

## Use Standalone

Many people reach for `genie:work` directly with a bare prompt — `genie:plan` is overkill when scope is small and the agent can scope it itself.

- **Bug fixes with a clear root cause** — direct implementation if trivial; task list if small/medium
- **Small refactors** — extract a helper, rename a concept, consolidate duplication
- **Resuming a partly-shipped plan** — idempotency prevents reimplementation
- **Wiring a feature you've already designed** in your head, where formal planning would be ceremony
- **Multi-feature parallel work** — worktree isolation lets you push several independent features through simultaneously without git contention

For large bare-prompt scope (cross-cutting, sensitive surfaces, many files), `genie:work` recommends `/genie:brainstorm` or `/genie:plan` first — but proceeds with your choice.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Auto-uses the latest plan in `docs/plans/` |
| `<plan path>` | Origin-sourced execution |
| `<bare prompt>` | Triage by complexity (Trivial / Small-Medium / Large) |

Output: commits and (typically) a PR via `genie:commit`. The plan body is read-only during execution; only the frontmatter `status` flips to `completed` at shipping.

---

## FAQ

**Why doesn't `genie:work` just write all the code from the plan's exact signatures?**
Because the plan deliberately doesn't have exact signatures — it has decisions, units, files, scope, and test scenarios. The plan is the WHAT; `genie:work` is the HOW. This separation keeps plans portable across weeks of code change and across implementer.

**What if I don't have a plan?**
Bare-prompt mode triages by complexity. Trivial goes straight to implementation; small/medium builds a task list; large surfaces a recommendation to plan first.

**What's the difference between worktree-isolated and shared-directory parallel mode?**
Worktree isolation gives each subagent its own branch in its own directory — overlapping writes surface as merge conflicts the orchestrator handles explicitly. Shared-directory mode bars subagents from staging, committing, or running the test suite (the orchestrator does those after the batch). Both are safe; worktree isolation is the cleaner experience.

**Why does it check whether work is already done before each task?**
Resuming after context compaction, picking up someone else's branch, or returning to a partly-shipped plan are all common. Idempotency ensures `genie:work` doesn't silently reimplement what's already there.

**What's the Residual Work Gate?**
When a deeper code review tier surfaces things the autofix didn't resolve, `genie:work` won't silently ship them. It asks: apply now / file tickets / accept (with durable sink) / stop. "Accept" requires a real durable record — findings can't live only in the session.

**Does `genie:work` support non-software plans?**
Not directly. The chain effectively ends at `genie:plan` for non-software work — `genie:work` commits, runs tests, and opens PRs, none of which apply to maintenance routines or trip plans.

---

## See Also

- [`genie:plan`](./plan.md) — produces the guardrails `genie:work` executes against
- [`genie:brainstorm`](./brainstorm.md) — defines what the plan should accomplish
- [`genie:think`](./think.md) — upstream "what's worth exploring" discovery
- [`genie:review`](./review.md) — Tier 2 escalation target
- [`genie:learn`](./learn.md) — capture reusable learning after shipping
