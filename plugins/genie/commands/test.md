---
description: 테스트 주도 개발 — 실패 테스트 먼저 작성 (RED → GREEN → IMPROVE)
model: sonnet
---

# `genie:test`

> Write failing tests first (RED), implement the minimum code to pass (GREEN), then refactor (IMPROVE). 80%+ coverage required.

$ARGUMENTS

---

Invoke the **`genie:test`** agent with the task description from `$ARGUMENTS`. The agent will:

1. **RED** — Write failing tests that specify the expected behavior
2. **GREEN** — Implement the minimum code to make tests pass
3. **IMPROVE** — Refactor while keeping tests green, verify 80%+ coverage

**Workflow position:** `/genie:plan` → `/genie:test` → `/genie:work`

**Saves output to:** `docs/tests/YYYY/MM/DD-<title>.md`

---

> **이 단계가 완료되면 멈추십시오.**
> 산출물을 출력한 뒤 대기합니다. 다음 단계 (`/genie:work`)는 사용자가 직접 실행합니다.
