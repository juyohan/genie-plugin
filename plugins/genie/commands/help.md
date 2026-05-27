---
description: 워크플로우 안내 — 지금 어떤 genie 커맨드를 써야 할지 알려줍니다
model: haiku
---

# `genie:help`

> Get routed to the right command for your current situation.

---

## Workflow Routing Guide

| 현재 상태 | 다음 단계 |
|-----------|-----------|
| 아이디어만 있음 | `/genie:think` 또는 `/genie:brainstorm` |
| 요구사항 문서 있음 | `/genie:plan` |
| 계획 문서 있음 | `genie:test` → `/genie:work` |
| 코드 작성 완료 | `/genie:review` |
| 리뷰 완료 | `/genie:commit` |
| 작업 완료, 정리 필요 | `/genie:learn` |
| 막혔을 때 | `/genie:fix` |
| 성능 이슈 | `/genie:optimize` |
| 제품 방향 확인/수정 | `/genie:strategy` |
| 프로젝트 맞춤 도구 확인 | `node scripts/detect-project.js` |

---

## Full Workflow

```
/genie:think        (선택) 아이디어 탐색
  ↓
/genie:strategy      (선택) 전략 정렬
  ↓
/genie:brainstorm    요구사항 정의  → docs/brainstorms/
  ↓
/genie:plan          구현 계획      → docs/plans/
  ↓
tdd-guide         테스트 먼저    → docs/tests/
  ↓
/genie:work          구현           → docs/work/
  ↓
/genie:review   코드 리뷰      → docs/reviews/
  ↓
/genie:commit        커밋
  ↓
/genie:learn      지식 자산화    → docs/compounds/
```

---

## Quick Fixes

- **빌드 실패** → `build-error-resolver` agent
- **보안 검토** → `security-reviewer` agent
- **TypeScript** → `typescript-reviewer` agent
- **Python** → `python-reviewer` agent
- **Go** → `go-reviewer` agent
- **Java** → `java-reviewer` agent
- **Kotlin** → `kotlin-reviewer` agent
- **Swift** → `swift-reviewer` agent

Run `node scripts/detect-project.js` to get language-specific recommendations for the current project.

---

> **이 단계가 완료되면 멈추십시오.**
> 산출물을 출력한 뒤 대기합니다. 다음 단계는 사용자가 직접 실행합니다.
