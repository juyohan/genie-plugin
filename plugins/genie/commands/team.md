---
description: 병렬 플랜 실행 — 독립적인 구현 단위들을 격리된 워크트리에서 동시에 실행합니다
model: sonnet
---

> **[스테이지 경계]** 이 단계가 완료되면 **반드시 멈추십시오.**
> 산출물을 출력한 뒤 대기합니다. 다음 단계 (`/genie:review`)는 사용자가 직접 실행합니다.



# `genie:team`

> Execute a plan's independent units in parallel worktrees — coordinate multiple agents, merge in dependency order.

`genie:team` is the **parallel execution** skill. It reads a `genie:plan` plan, builds a dependency graph from the U-IDs, and dispatches multiple agents simultaneously — each in an isolated git worktree. Independent units run in parallel; dependent units wait for their prerequisites. The orchestrator merges branches in dependency order, runs tests after each merge, and hands off to review.

Use `genie:work` for single-unit or small-scope work. Use `genie:team` when your plan has multiple independent implementation units that benefit from simultaneous execution.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Reads a plan, builds execution waves from dependency graph, dispatches parallel agents in isolated worktrees, merges in order |
| When to use it | Plans with 3+ independent units; large features where parallel execution saves time |
| What it produces | Committed implementation across all plan units, ready for review |
| What's next | `/genie:review` |
| vs `genie:work` | `work` decides internally whether to parallelize; `team` always orchestrates explicitly with visible wave structure |

---

## How It Works

```text
/genie:plan
    |  U-IDs, files, dependencies, test scenarios
    v
/genie:team
    |  Wave 1: [U1, U2, U4] → parallel worktrees → merge → test
    |  Wave 2: [U3, U5]     → parallel worktrees → merge → test
    |  Wave 3: [U6]         → inline             → test
    v
/genie:review
```

### Waves

A wave is a batch of units with no dependencies on each other — only on units from earlier waves. Units in the same wave run simultaneously in isolated worktrees.

### Worktree Isolation

Each unit gets its own branch (`team/<unit-id>`) in its own directory (`.worktrees/team/<unit-id>`). Filesystem-level conflicts are impossible during parallel work; overlaps surface as merge conflicts when branches are integrated, and the orchestrator handles them explicitly.

### Merge Order

After each wave, branches merge into the target branch in dependency order. Tests run after each merge. Conflicts are resolved before continuing to the next wave.

---

## When to Reach For It

Reach for `genie:team` when:

- Your plan has 3 or more independent implementation units
- Parallel execution would meaningfully reduce total implementation time
- You want explicit, visible orchestration rather than `genie:work`'s internal decision

Skip `genie:team` when:

- The plan has 1–2 units, or all units are sequentially dependent → `genie:work`
- You don't have a plan yet → `genie:plan` first
- The scope is small enough that parallelism adds overhead without benefit

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Auto-uses the latest active plan in `docs/plans/` |
| `<plan path>` | Use the specified plan |

---

## See Also

- [`genie:plan`](./plan.md) — produces the plan `genie:team` executes
- [`genie:work`](./work.md) — single-unit or small-scope execution
- [`genie:worktree`](./worktree.md) — create a single isolated worktree manually
- [`genie:review`](./review.md) — review after all units are implemented
- [`genie:learn`](./learn.md) — capture reusable learning after shipping
