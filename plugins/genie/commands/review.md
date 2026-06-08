---
description: 계층화된 페르소나를 활용한 구조화된 코드 리뷰 — 머지 전에 실행합니다
model: sonnet
---

# `genie:review`

> Review code changes with layered personas, confidence-based filtering, and merge/dedup pipeline.

$ARGUMENTS

---

Execute the **`genie:review`** skill. Read `skills/genie:review/SKILL.md` and follow the instructions exactly. Pass `$ARGUMENTS` as the target (leave empty to review current branch, or provide a PR link).

**Workflow position:** `/genie:work` → `/genie:review` → `/genie:commit`

**Severity tiers:** CRITICAL (blocks merge) → HIGH (fix before merge) → MEDIUM (consider) → LOW (optional)

**Saves output to:** `docs/reviews/YYYY/MM/DD-<title>.md`

---

> **이 단계가 완료되면 멈추십시오.**
> 산출물을 출력한 뒤 대기합니다. 다음 단계 (`/genie:commit`)는 사용자가 직접 실행합니다.
