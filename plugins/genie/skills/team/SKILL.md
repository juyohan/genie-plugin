---
name: team
description: 플랜의 독립적인 구현 단위(U-ID)를 병렬 워크트리에서 동시 실행하는 루트 오케스트레이터. genie:plan 플랜을 읽고 의존성 그래프로 실행 웨이브를 구성하며, 각 단위에 정제된 컨텍스트 패키지를 전달하고 unit-worker 에이전트를 병렬 파견합니다. 완료 결과를 수집해 의존 단위의 컨텍스트에 주입하며 의존성 순서대로 병합합니다.
argument-hint: "[계획 문서 경로. 비우면 docs/plans/에서 최신 활성 플랜 자동 사용]"
allowed-tools:
  - gem
---
> **기본 가이드라인**: 이 스킬에는 [SKILL.md](../SKILL.md)가 적용됩니다.

# 팀 병렬 실행 — 루트 오케스트레이터

<input_document> #$ARGUMENTS </input_document>

`--add gemini` (또는 `--add gem`) 플래그가 있으면: gem 도구로 의존성 그래프 검토 요청 후 결과 통합.

---

## 1. 플랜 로드

1. `$ARGUMENTS`가 파일 경로면 해당 플랜 사용. 비어 있으면 `docs/plans/`에서 가장 최근 `status: active` 플랜 선택
2. 플랜이 없으면 안내 후 종료:
   > "`/genie:plan`으로 플랜을 먼저 작성하세요."
3. 플랜의 `Implementation Units` 섹션에서 추출:
   - 각 U-ID, 이름, 설명
   - 담당 파일 목록
   - `Depends on:` 필드 (없으면 독립 단위)
   - `Test Scenarios` 및 `Verification` 기준

---

## 2. 의존성 그래프 및 웨이브 구성

추출한 단위로 DAG를 구성하고 실행 웨이브를 산출합니다:

```
웨이브 N = 이전 웨이브에서만 의존하거나 의존성 없는 단위들의 집합
```

분석 결과 출력:
```
웨이브 1 (병렬 3): U1 · U2 · U4
웨이브 2 (병렬 2): U3(→U1) · U5(→U2)
웨이브 3 (직렬 1): U6(→U3,U5)
총 3 웨이브 / 6 단위
```

단위가 2개 이하이거나 모든 단위가 선형 종속이면:
> "병렬화 이점이 없습니다. `genie:work`를 대신 사용하는 것을 권장합니다."
계속 진행 여부를 사용자에게 묻습니다.

---

## 3. 공유 버스 초기화

```bash
mkdir -p .agent-bus
echo "# Agent Bus — $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .agent-bus/README.md
```

`.agent-bus/` 디렉토리는 오케스트레이터와 워커 에이전트 간 상태 공유에 사용됩니다:

| 파일 | 생성자 | 역할 |
|------|--------|------|
| `<unit-id>-context.md` | 오케스트레이터 | 워커에게 전달할 정제된 컨텍스트 |
| `<unit-id>-result.md` | 워커 | 구현 결과 및 후속 단위 전달 사항 |

`.agent-bus/`를 `.gitignore`에 추가합니다 (임시 상태 파일, 커밋 불필요):
```bash
grep -qxF '.agent-bus/' .gitignore 2>/dev/null || echo '.agent-bus/' >> .gitignore
```

---

## 4. 웨이브 실행

각 웨이브를 순서대로 실행합니다.

### 4-1. 파일 겹침 확인

웨이브 내 단위들의 파일 목록을 교차 확인합니다.
겹치는 파일이 있는 단위들은 직렬로 강등하고 사유를 출력합니다:
```
U3 · U5 → 직렬 강등 (파일 겹침: src/shared/utils.ts)
```

### 4-2. 컨텍스트 패키지 빌드 (오케스트레이터)

각 단위를 파견하기 전, 해당 단위에 필요한 정보만 담은 컨텍스트 패키지를 작성합니다.
불필요한 섹션은 제외하여 워커가 노이즈 없이 작업에 집중할 수 있게 합니다.

```markdown
# 컨텍스트 패키지: <unit-id>

## 이 단위에서 할 일
<플랜의 해당 U-ID 설명, Execution note, 검증 기준>

## 담당 파일
<이 단위가 수정할 파일 목록만>

## 건드리지 않을 것
<다른 단위 담당 파일 명시 — 실수로 수정하지 않도록>

## 의존성 결과 (선행 단위 완료 요약)
<.agent-bus/<dep-id>-result.md 의 "후속 단위에 전달할 사항" 섹션>
※ 첫 번째 웨이브는 이 섹션 없음

## 테스트 시나리오
<플랜의 이 단위 Test Scenarios>

## 프로젝트 컨벤션
<AGENTS.md 또는 CLAUDE.md의 핵심 규칙 요약 — 전체 파일 대신 관련 내용만>
```

컨텍스트 패키지를 `.agent-bus/<unit-id>-context.md`에 저장합니다.

### 4-3. 워크트리 생성 및 unit-worker 파견 (병렬 단위)

각 병렬 단위에 대해:

**워크트리 생성:**
```bash
bash "${CLAUDE_SKILL_DIR:-.}/scripts/worktree-manager.sh" create team/<unit-id>
```

**`unit-worker` 에이전트 파견** (`isolation: "worktree"`, `run_in_background: true`):

오케스트레이터가 워커에게 전달하는 내용:
- 워크트리 경로: `.worktrees/team/<unit-id>`
- 컨텍스트 패키지 경로: `.agent-bus/<unit-id>-context.md`
- 결과 기록 경로: `.agent-bus/<unit-id>-result.md`
- 제약: push 금지, 범위 외 파일 수정 금지

모든 파견 완료 후 대기합니다.

### 4-4. 직렬 단위 인라인 실행

직렬 강등된 단위는 워크트리 없이 현재 브랜치에서 직접 구현합니다.
동일하게 컨텍스트 패키지를 먼저 빌드하고 `.agent-bus/<unit-id>-result.md`에 결과를 기록합니다.

### 4-5. 결과 수집 및 다음 웨이브 컨텍스트 준비

완료된 단위들의 결과 파일을 읽습니다:
```bash
cat .agent-bus/<unit-id>-result.md
```

실패한 단위가 있으면:
- 실패 사유 출력
- 해당 단위를 직렬로 재실행할지 건너뛸지 사용자에게 묻습니다

성공한 단위의 "후속 단위에 전달할 사항"을 수집해 다음 웨이브 컨텍스트 패키지에 주입합니다.

### 4-6. 병합

워커 완료 후 의존성 순서대로 병합합니다:
```bash
git merge --no-ff team/<unit-id>
```

충돌 발생 시:
1. 충돌 파일과 관련 단위를 출력합니다
2. 직접 해결 후 커밋합니다

**병합 직후 즉시 테스트 실행** — 실패 시 수정 후 재실행합니다.

### 4-7. 워크트리 제거

```bash
git worktree remove .worktrees/team/<unit-id>
```

---

## 5. 최종 검증

모든 웨이브 완료 후:

1. 전체 테스트 스위트 실행
2. 린터 실행
3. 플랜의 `Requirements` 항목 전체 충족 여부 확인
4. `.agent-bus/` 정리 (gitignore 적용 중이므로 선택적)
5. 플랜 frontmatter `status: active → completed` 전환

---

## 6. 완료 보고

```
팀 실행 완료
  웨이브:    3 (총 6개 단위)
  병렬 처리: U1 · U2 · U4 / U3 · U5
  직렬 처리: U6
  실패:      없음
  다음 단계: /genie:review
```

`/genie:review`를 다음 단계로 권장합니다.
