---
description: 워크플로우 안내 — 지금 어떤 genie 커맨드를 써야 할지 알려줍니다
model: haiku
---

# `genie:help`

> 현재 상황에 맞는 다음 커맨드를 안내합니다.

---

## 워크플로우 라우팅

| 현재 상태 | 다음 단계 |
|-----------|-----------|
| 아이디어만 있음 | `/genie:brainstorm` |
| 요구사항 문서 있음 | `/genie:plan` |
| 계획 문서 있음 | `/genie:test` → `/genie:work` 또는 `/genie:team` |
| 독립 단위 3개 이상 병렬 구현 | `/genie:team` |
| 코드 작성 완료 | `/genie:review` |
| 리뷰 완료 | `/genie:commit` → `/genie:push` |
| 작업 완료, 패턴 저장 필요 | `/genie:learn` |
| 새 프로젝트 시작 | `/genie:setup` |

---

## 전체 워크플로우

```
/genie:brainstorm    요구사항 정의     → docs/brainstorms/
  ↓
/genie:plan          구현 계획         → docs/plans/
  ↓
/genie:test          테스트 먼저 작성  (RED)
  ↓
/genie:work          구현 + 리팩토링   (GREEN → IMPROVE)
  또는
/genie:team          병렬 구현         (독립 단위 3개 이상)
  ↓
/genie:review        코드 리뷰
  ↓
/genie:commit        커밋
  ↓
/genie:push          푸시
  ↓
/genie:learn         패턴 저장         → ~/.claude/skills/learned/
```

---

## 빠른 참조

- **빌드 실패** → `@genie:fix` 에이전트
- **보안 검토** → `@genie:security` 에이전트
- **TypeScript** → `@genie:ts` 에이전트
- **Python** → `@genie:py` 에이전트
- **Go** → `@genie:go` 에이전트
- **Java** → `@genie:java` 에이전트
- **Kotlin** → `@genie:kotlin` 에이전트
- **Swift** → `@genie:swift` 에이전트

---

> **이 단계가 완료되면 멈추십시오.**
> 산출물을 출력한 뒤 대기합니다. 다음 단계는 사용자가 직접 실행합니다.
