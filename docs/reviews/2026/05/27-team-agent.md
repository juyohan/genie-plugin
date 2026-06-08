---
date: 2026-05-27
title: team-agent
branch: feat/session-resume-prompt
status: completed
---

# 코드 리뷰: Team Agent 아키텍처

## 요약

`genie:team` 병렬 오케스트레이터 + `unit-worker` 에이전트 도입 변경을 검토했습니다.
아키텍처 방향은 올바르며, 아래 3건의 이슈를 식별하고 모두 수정했습니다.

---

## 이슈 목록

### [CRITICAL] P1 — `.agent-bus/` 상대 경로: 워크트리에서 잘못된 위치 참조

**영향 파일**: `plugins/genie/agents/unit-worker.md`, `plugins/genie/skills/team/SKILL.md`

**문제**: `unit-worker` 에이전트는 `.worktrees/team/<unit-id>/` 디렉토리 안에서 실행됩니다.
이 상태에서 `.agent-bus/<unit-id>-context.md` 같은 상대 경로는
프로젝트 루트가 아닌 `.worktrees/team/<unit-id>/.agent-bus/`로 해석되어
컨텍스트 파일을 찾지 못하고 워커가 실패합니다.

**수정**: 두 파일 모두 `PROJECT_ROOT=$(git rev-parse --show-toplevel)` 로 절대 경로 확보 후
`"$PROJECT_ROOT/.agent-bus/..."` 형식으로 참조하도록 수정.

---

### [HIGH] P2 — `unit-worker`가 사용자 공개 README에 노출됨

**영향 파일**: `README.md`

**문제**: `@genie:unit-worker`가 "도구" 섹션에 사용자 호출 가능 에이전트로 등재되어 있었습니다.
이 에이전트는 `genie:team` 오케스트레이터가 내부적으로 파견하는 에이전트로,
직접 호출 시 컨텍스트 패키지 없이 실행되어 무의미하게 실패합니다.

**수정**: README 도구 테이블에서 `unit-worker` 행 제거.

---

### [HIGH] P2 — 병합 후 테스트 실패 시 롤백 경로 미정의

**영향 파일**: `plugins/genie/skills/team/SKILL.md`

**문제**: SKILL.md 4-6절에 "실패 시 수정 후 재실행"이라고만 명시되어 있어
수정이 복잡한 경우 어떻게 해야 할지 지침이 없었습니다.
잘못된 병합이 브랜치에 남으면 이후 웨이브 실행에 영향을 줄 수 있습니다.

**수정**: 간단한 수정과 복잡한 수정 두 경로를 명시하고,
복잡한 경우 `git revert -m 1 HEAD`로 병합 롤백 후 사용자에게 안내하도록 추가.

---

## 수정 결과

| 이슈 | 심각도 | 상태 |
|------|--------|------|
| `.agent-bus/` 절대 경로 미사용 | CRITICAL | ✅ 수정 완료 |
| unit-worker README 노출 | HIGH | ✅ 수정 완료 |
| 병합 롤백 경로 누락 | HIGH | ✅ 수정 완료 |

**결론**: CRITICAL·HIGH 이슈 전부 수정. 머지 준비 완료.

---

## 다음 단계

`/genie:commit`
