# John Plugin — 에이전트 지침

> **모든 에이전트의 단일 지침 파일입니다.**
> - Claude Code: `CLAUDE.md` → `@AGENTS.md` 로 이 파일을 로드합니다.
> - Codex: `AGENTS.md` 를 직접 읽습니다.

CE(Compound Engineering) 워크플로우를 뼈대로 삼아 ECC(Everything Claude Code)의
스킬·룰·훅 인프라를 통합한 단일 Claude Code 플러그인.

---

## 1. 핵심 워크플로우

```
/genie:brainstorm → /genie:plan → /genie:test → /genie:work → /genie:review → /genie:commit → /genie:push → /genie:learn
```

모든 기능 개발은 이 순서를 따릅니다. `/genie:plan` 완료 후 구현 전에 반드시 `/genie:test`로 테스트를 먼저 작성합니다.

1. **Brainstorm (`/genie:brainstorm`)**: 요구사항 확정.
2. **Plan (`/genie:plan`)**: 파일·인터페이스 수준까지 구현 계획 확정. 언어 감지 후 언어별 스킬/룰 자동 제안.
3. **TDD (`/genie:test`)**: `/genie:plan` 결과를 기반으로 실패하는 테스트 먼저 작성 (RED).
4. **Work (`/genie:work`)**: 테스트를 통과하는 최소 구현 후 리팩토링 (GREEN → IMPROVE). 독립 단위 3개 이상이면 `/genie:team`으로 병렬 실행.
5. **Review (`/genie:review`)**: 언어별 reviewer (프로젝트 감지 자동 선택) + security. CRITICAL 이슈는 머지 차단, HIGH는 머지 전 수정.
6. **Commit (`/genie:commit`)**: Conventional Commits 형식의 커밋 메시지 자동 생성 및 커밋 실행.
7. **Push (`/genie:push`)**: 원격 저장소에 푸시. AWS CodeCommit MFA 자동 처리.
8. **Learn (`/genie:learn`)**: 지식 자산화 및 레슨 런 정리.

---

## 2. 에이전트 역할 정의

| 역할 | 에이전트/명령어 | 출처 | 설명 |
| :--- | :--- | :--- | :--- |
| **Strategy** | `/genie:brainstorm` | Genie | 요구사항 분석 및 전략 수립 |
| **Architect** | `@genie:architect` | Genie | 시스템 설계 및 아키텍처 결정 |
| **Planner** | `@genie:planner` | Genie | 파일·인터페이스 수준 구현 계획 |
| **TDD** | `/genie:test` (`tdd`) | Genie | 테스트 먼저 작성 (RED→GREEN→IMPROVE) |
| **Parallel Work** | `/genie:team` | Genie | 독립 단위 3개 이상 병렬 구현 (같은 브랜치, 체크포인트 기반) |
| **Code Review** | `/genie:review` | Genie | 일반 코드 품질·패턴·베스트 프랙티스 |
| **Language Review** | `@genie:ts`, `@genie:py`, `@genie:go`, `@genie:kotlin`, `@genie:swift`, `@genie:java` | Genie | 언어별 전용 리뷰 (프로젝트 감지 후 자동 선택) |
| **Security** | `@genie:security` | Genie | 보안 취약점·OWASP Top 10 감사 |
| **Build Fix** | `@genie:fix`, `@genie:fix-go`, `@genie:fix-kotlin`, `@genie:fix-swift`, `@genie:fix-java` | Genie | 빌드·컴파일 에러 해결 |
| **Quality** | `@genie:refactor`, `@genie:perf`, `@genie:simplify` | Genie | 리팩토링·성능·코드 단순화 |
| **E2E** | `@genie:e2e` | Genie | 핵심 사용자 흐름 E2E 테스트 |
| **Docs** | `@genie:docs` | Genie | 문서 업데이트 |

---

## 3. 저장소 문서 관례

각 단계의 산출물 저장 경로는 해당 스킬 내부에 정의되어 있다.

**교차 단계 규칙**: 같은 작업이라면 `<제목>`을 단계 간 통일한다 — 동일한 제목으로 `docs/`를 검색하면 전체 흐름을 추적할 수 있다.

- `/genie:commit` 등 git 단계는 커밋 자체가 산출물이므로 별도 문서 불필요

---

## 4. 브랜치 보호 규칙

**보호 브랜치**: `main` · `master` · `develop` · `staging`

코드 작성, 파일 편집, 커밋, **푸시** 등 **모든 작업 요청** 전에 현재 브랜치를 확인하십시오. 현재 브랜치가 보호 브랜치이면:

1. **즉시 멈추십시오** — 요청된 작업을 시작하지 마십시오.
2. **아래 형식으로 경고를 출력하십시오:**

   ```
   [보호 브랜치] 현재 브랜치: `<현재 브랜치>`
   이 브랜치에 직접 작업하는 것은 허용되지 않습니다.
   제안 브랜치: `<작업 내용 기반 이름>`
   새 브랜치를 생성할까요? (네 / 직접 이름 입력)
   ```

3. **사용자의 응답을 기다리십시오.** 응답 전에 어떤 작업도 수행하지 마십시오.
4. 사용자가 새 브랜치를 선택하면 `git checkout -b <branch-name>`으로 생성 후 작업을 진행합니다.

보호 브랜치에서의 직접 작업(커밋·푸시 포함)은 **어떠한 경우에도 허용되지 않습니다.** 사용자가 계속 요청하더라도 매번 경고를 반복하고 브랜치 생성을 요구하십시오.

이 규칙은 세션 내 **매 작업 요청마다** 적용됩니다. 이전 요청에서 이미 경고했더라도 브랜치가 여전히 보호 브랜치라면 다시 확인하고 경고합니다.

---

## 5. 플러그인 구조

```
plugins/genie/
  .codex-plugin/   — 플러그인 메타데이터 (name: "genie", Codex용)
  commands/        — Claude Code 커맨드 (/genie:brainstorm, /genie:plan 등)
  agents/          — 전문 에이전트 (@genie:ts, @genie:review 등)
  skills/          — Genie 스킬 구현 (brainstorm, plan, work, team 등)
  scripts/hooks/   — 훅 자동화 (quality-gate, branch-guard, session 등)
.claude-plugin/    — Claude Code 플러그인 메타데이터 (프로젝트 루트)
rules/             — 코딩 규칙 (설치 후 ~/.claude/rules/john/ 에 복사)
docs/              — 프로젝트 문서 (brainstorms, plans, reviews 등)
```

---

## 6. Git 작업 핸드오프 규칙

**우선순위**: Section 4(브랜치 보호 규칙)가 이 섹션보다 **먼저** 적용됩니다. 보호 브랜치에서 commit/push 의도가 감지되면 스킬 실행 전 반드시 브랜치 보호 경고를 출력하고 대기합니다.

사용자가 **commit** 의도를 표현하면 (`커밋해줘`, `커밋 고`, `커밋하자`, `커밋해`, `commit 해줘` 등):
- **즉시** `Skill("genie:commit")`을 실행합니다. 확인 요청 없음.
- 이미 `genie:commit` 스킬이 실행 중인 경우 중복 호출하지 않습니다.
- AWS CodeCommit 저장소이면 `genie:commit`이 MFA 자격증명을 사전에 확인합니다 (Step 0).

사용자가 **push** 의도를 표현하면 (`푸시 고`, `푸쉬 고`, `push해줘`, `올려줘`, `푸시해` 등):
- **즉시** `Skill("genie:push")`을 실행합니다. 확인 요청 없음.
- 이미 `genie:push` 스킬이 실행 중인 경우 중복 호출하지 않습니다.
- AWS CodeCommit 저장소이면 `genie:push`가 자격증명 유효성을 확인하고, 만료 시 MFA 코드를 요청합니다.

---

## 7. 자동 핸드오프 파이프라인

각 스킬은 완료 후 다음 스킬을 자동으로 실행합니다. **사람 판단이 필요한 지점에서만** 일시 정지합니다.

```
/genie:brainstorm → /genie:plan → /genie:test → /genie:work → /genie:review
                                                                      │ P0/P1
                                                                      ↓
                                                               /genie:plan (루프)
                                                                      │ 통과
                                                                      ↓
                                                               /genie:learn
```

**자동 진행 조건** (사용자 확인 없이 즉시 다음 단계 실행):

| 전환 | 자동 진행 조건 |
|------|--------------|
| brainstorm → plan | Synthesis Summary 확인 완료 (Inferred 항목 없거나 확인됨) |
| plan → test | Open Questions 없음 + 신뢰도 체크 통과 |
| plan → work | Lightweight 또는 즉시 구현 가능 범위 |
| test → work | RED 확인 + 커버리지 경로 검증 완료 |
| work → review | 테스트·린팅 통과 (이미 자동 실행 중) |
| review(P0/P1) → plan | 자동 loop-back (review 스킬이 처리) |
| review(pass) → learn | 자동 실행 (review 스킬이 처리) |

**반드시 일시 정지 조건** (사람 판단 대기):

1. **brainstorm**: Synthesis Summary에 Inferred 항목이 있고 미확인 — 확인 전 plan 진행 금지
2. **plan**: Open Questions ≥ 2개 또는 고위험 도메인 미해결 — 질문 후 사용자 답변 대기
3. **review**: P0/P1 + 아키텍처 범위 변경 필요 (단순 수정 불가) — 사용자 결정 대기
4. **어느 단계든**: 예외·빌드 실패·테스트 오류·환경 문제 발생 시

**learn 이후**: 자동 핸드오프 없음. 학습 완료 후 `/genie:commit` 실행을 안내하고 대기합니다.

