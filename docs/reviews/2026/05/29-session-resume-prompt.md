---
branch: feat/session-resume-prompt
date: 2026-05-29
reviewers: [review-correctness, review-maintainability, security, architect]
verdict: Ready with fixes applied
---

# 코드 리뷰: feat/session-resume-prompt

## 범위

브랜치 전체 diff — 29개 파일, +495/-999 라인.

**변경 범주:**
1. JS 훅 버그 수정 (`brainstorm-suggest.js`, `quality-gate.js`)
2. 문서·설정 업데이트 (`AGENTS.md`, `README.md`, `help.md`)
3. 멀티 에이전트 사전 분석 패턴 추가 (4개 스킬)
4. 에이전트 메타데이터 (`internal: true`, `model: sonnet`)

---

## 발견 사항 (리뷰 시점 — 수정 전)

### P1 — 머지 전 수정 권장

| # | 파일 | 문제 | 상태 |
|---|------|------|------|
| 1 | `quality-gate.js` | `findProjectRoot`가 `go.mod` 마커 미인식 → 순수 Go 프로젝트에서 go vet이 잘못된 디렉토리에서 실행됨 | ✅ 수정됨 |
| 2 | `brainstorm/SKILL.md`, `plan/SKILL.md`, `work/SKILL.md` | `security-reviewer` (미정의) → `genie:security`로 통일 필요 | ✅ 수정됨 |
| 3 | `plan/SKILL.md` Section 7 | `code-architect`, `docs-lookup`, `performance-optimizer` — 존재하지 않는 에이전트명 | ✅ 수정됨 (`architect`, `docs`, `genie:perf`) |
| 4 | `brainstorm/SKILL.md`, `plan/SKILL.md` | 병렬 에이전트 미지원 환경 폴백 미명시 (work·tdd는 있음) | ✅ 수정됨 |

### P2 — 수정 권장

| # | 파일 | 문제 | 상태 |
|---|------|------|------|
| 5 | `brainstorm-suggest.js` | `promptKey` 결정이 키 존재 여부 기반 → `extractMessage`의 값 기반 폴백과 불일치 | ✅ 수정됨 |
| 6 | `brainstorm-suggest.js` | `catch` 블록 무음 처리 → 디버깅 어려움 | ✅ 수정됨 (stderr 로깅 추가) |
| 7 | `AGENTS.md` Section 2 | `architect`, `planner` 출처를 ECC로 표기 (실제로는 `plugins/genie/agents/`에 존재) | ✅ 수정됨 |
| 8 | `brainstorm-suggest.js` | `{ ...data }` 스프레드 — Claude Code 페이로드 스키마 암묵적 신뢰 (문서화 누락) | 수용 — 페이로드 스키마 안정적, 신뢰 경계 주석 추가는 향후 스키마 변경 시 |

### P3 — 참고

| # | 파일 | 문제 |
|---|------|------|
| 9 | work/SKILL.md ↔ review/SKILL.md | `genie:review-correctness`가 work 사전 분석 + review 단계에서 2회 실행 가능 (비용 중복) |
| 10 | brainstorm·plan·work SKILL.md | 단계 간 `code-explorer` 분석 결과 재사용 메커니즘 없음 (각 단계마다 독립 실행) |

---

## 적용된 수정 사항

### quality-gate.js
- `findGoModRoot()` 함수 추가 — `go.mod`를 마커로 올라가며 Go 모듈 루트 탐색
- Go 파일 처리 시 `findProjectRoot` → `findGoModRoot` 변경

### brainstorm-suggest.js
- `promptKey` 로직을 값 기반 폴백으로 수정 (`data.prompt ? ... : data.content ? ...`)
- `promptKey`가 없는 경우 pass-through 처리 명시
- `catch` 블록에 stderr 로깅 추가

### brainstorm/SKILL.md, plan/SKILL.md, work/SKILL.md
- `security-reviewer` → `genie:security` 전체 교체

### plan/SKILL.md Section 7
- `code-architect` → `architect`
- `docs-lookup` → `docs`
- `performance-optimizer` → `genie:perf`

### brainstorm/SKILL.md, plan/SKILL.md
- 폴백 문구 추가: "병렬 에이전트 미지원 환경에서는 `code-explorer`만 순차 실행한다"

### AGENTS.md
- `architect`, `planner` 출처 `ECC` → `Genie`, 명령어를 `@genie:architect`, `@genie:planner`로 수정

---

## 평결

**Ready to merge** — P1/P2 이슈 모두 리뷰 즉시 수정 적용됨. P3는 향후 개선 가능.
