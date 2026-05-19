---
name: review
description: "계층화된 페르소나 에이전트, 신뢰도 기반 필터링, 머지/중복 제거 파이프라인을 사용한 구조화된 코드 리뷰입니다. PR을 생성하기 전에 코드 변경 사항을 검토할 때 사용합니다."
argument-hint: "[현재 브랜치를 리뷰하려면 공백으로 두거나, PR 링크를 제공하세요]"
allowed-tools:
  - gem
---
> **기본 가이드라인**: 이 스킬에는 [SKILL.md](../SKILL.md)가 적용됩니다.

# 코드 리뷰

**다중 에이전트 페르소나 병렬 실행 → 발견 사항 병합·중복 제거 → 자동 수정 또는 loop-back.**

`--add gemini` 감지 시 `gem` 도구로 초안 검토 후 결과 통합, 산출물 상단에 협업 메모 추가.

**Tradeoff:** 다중 에이전트 커버리지는 완성도가 높지만 레이턴시가 있습니다. 소규모 diff는 빠른 단축 경로로 처리합니다.

---

## 1. 인자 파싱 — **인식된 토큰을 제거한 뒤 나머지를 타겟으로 처리한다**

| 토큰 | 효과 |
|------|------|
| `mode:autofix` / `mode:report-only` / `mode:headless` | 모드 선택 |
| `base:<sha-or-ref>` | diff 베이스 직접 지정, 범위 감지 건너뜀 |
| `plan:<path>` | 요구사항 검증용 플랜 로드 |

충돌하는 모드 플래그 → 중단.

## 2. 빠른 단축 경로 — **인자가 빠른 리뷰를 나타내면 멀티 에이전트를 건너뛴다**

내장 `/review [대상]` 실행 후 중단. 내장 리뷰가 없으면 전체 파이프라인 진행. `mode:autofix|report-only|headless`는 이 경로를 우회.

## 3. 모드 — **모드별 동작을 한눈에 파악한다**

| 모드 | 조건 | 질문 | 수정 | 결과물 저장 |
|------|------|------|------|------------|
| **Interactive** (기본) | 모드 토큰 없음 | 예 | `safe_auto` 자동, 나머지 선택 | `docs/reviews/YYYY/MM/` |
| **Autofix** | `mode:autofix` | 없음 | `safe_auto`만 | `/tmp/genie/review/` |
| **Report-only** | `mode:report-only` | 없음 | 없음 | 없음 |
| **Headless** | `mode:headless` | 없음 | `safe_auto` 단일 패스 | `/tmp/genie/review/` |

Interactive 첫 질문 전 `ToolSearch select:AskUserQuestion` 한 번 사전 로드 (Claude Code 전용).

## 4. 심각도 — **P0는 머지 차단, P1은 수정 권장, P2·P3는 재량**

| 레벨 | 의미 |
|------|------|
| **P0** | 치명적 파손·악용 가능 취약점·데이터 손실 |
| **P1** | 일반 사용 시 발생 가능성 높은 영향력 큰 결함·계약 위반 |
| **P2** | 엣지 케이스·성능 저하·유지보수 함정 |
| **P3** | 낮은 영향·사소한 개선 |

## 5. 라우팅 — **autofix_class로 누가 다음에 행동할지 결정한다**

| autofix_class | 기본 소유자 | 의미 |
|---------------|------------|------|
| `safe_auto` | `review-fixer` | 국부적·결정론적, API/계약/보안/권한 변경 없음 |
| `gated_auto` | `downstream-resolver` | 계약·권한·경계를 변경 — 기본 자동 적용 금지 |
| `manual` | `downstream-resolver` | 외부 전달 필요 |
| `advisory` | `human` / `release` | 보고 전용 |

의견 불일치 시 더 보수적인 경로 선택. `safe_auto`만 스킬 내 수정 큐에 자동 진입.

---

## 실행 흐름

### Stage 1: 범위 결정 — **base: → PR → 브랜치 → 현재 브랜치 순으로 diff를 확정한다**

명령어 상세: @./references/scope-detection.md

### Stage 2: 의도 파악 — **2~3줄 의도 요약을 모든 리뷰어 프롬프트에 전달한다**

- PR/URL: PR 제목·본문·커밋 메시지 사용
- 브랜치·독립형: `git log --oneline ${BASE}..HEAD`
- 모호 시 Interactive → `AskUserQuestion` 한 가지 질문, 기타 모드 → 보수적으로 추론 후 Coverage에 기록

의도는 *어떤 리뷰어를 선택할지*가 아닌 *각 리뷰어가 얼마나 꼼꼼히 살펴볼지*를 결정합니다.

### Stage 2b: 플랜 탐색 — **plan: → PR 본문 → 브랜치 키워드 순으로 플랜을 찾는다**

플랜을 찾으면 R-ID + U-ID 저장. 없어도 리뷰 중단 금지.

### Stage 3: 리뷰어 선택 — **diff 내용으로 판단하되 키워드 매칭에 의존하지 않는다**

**항상 활성화:**

| 에이전트 | 중점 사항 |
|---------|---------|
| `genie:review-correctness` | 로직 에러, 엣지 케이스, 상태 버그, 에러 전파 |
| `genie:review-testing` | 테스트 커버리지 공백, 약한 단언문, 취약한 테스트 |
| `genie:review-maintainability` | 결합도, 복잡성, 네이밍, 데드 코드 |
| `code-reviewer` | CLAUDE.md·AGENTS.md 준수 + 에이전트 접근성 |
| `code-explorer` | `docs/solutions/` 과거 이슈 검색 |

**교차 조건부 (diff 기반 선택):**

| 에이전트 | 선택 조건 |
|---------|---------|
| `genie:security` | 인증, 공용 엔드포인트, 사용자 입력, 권한 |
| `genie:perf` | DB 쿼리, 캐싱, 비동기, 데이터 변환 |
| `genie:review-adversarial` | 50줄 이상 또는 인증/결제/데이터 수정/외부 API |
| `database-reviewer` | 마이그레이션, 스키마 변경, 백필 |
| `silent-failure-hunter` | 에러 핸들링, 재시도, 타임아웃, 백그라운드 작업 |
| `pr-test-analyzer` | 기존 리뷰 코멘트가 있는 PR |

**스택 전용 (해당 스택의 의미 있는 변경 시):**

`genie:ts` / `genie:py` / `genie:swift` / `genie:go` / `genie:java` / `genie:kotlin`

**보호된 결과물:** `docs/brainstorms/`, `docs/plans/`, `docs/solutions/` — 삭제·gitignore 발견 사항 폐기.

파일 타입 인지: 지침 산문 파일(Markdown, JSON 설정)만 변경 시 Adversarial 건너뜀.

### Stage 3b: 프로젝트 표준 탐색 — **CLAUDE.md·AGENTS.md 경로를 리뷰어 프롬프트에 전달한다**

`**/CLAUDE.md`, `**/AGENTS.md` glob 후 변경된 파일의 조상 디렉토리로 필터링.

### Stage 4: 서브 에이전트 할당 — **제한된 병렬로 실행하고 슬롯이 비면 채운다**

- `genie:review-correctness`, `genie:security`, `genie:review-adversarial` → 세션 모델 상속
- 나머지 → `model: "sonnet"`
- 서브 에이전트는 프로젝트에 **읽기 전용**
- 출력 계약: @./references/findings-schema.json
- 서브 에이전트 프롬프트 구조: @./references/subagent-template.md

### Stage 5: 발견 사항 병합 — **검증 → 중복 제거 → 합의 → 라우팅 정규화 순으로 처리한다**

1. 필수 필드·타입·값 제약 검증. 잘못된 형식 폐기.
2. 지문 `normalize(file) + line_bucket(line,±3) + normalize(title)` 중복 제거. 최고 심각도 앵커 유지.
3. 2명 이상 동일 발견 → 앵커 한 단계 상승 (50→75→100).
4. `pre_existing: true` → 별도 리스트.
5. 의견 불일치 시 더 보수적인 경로 유지.
6. 권장 조치 도출:

   | autofix_class | suggested_fix | 권장 조치 |
   |---------------|---------------|-----------|
   | `safe_auto` | — | Apply |
   | `gated_auto` | 있음 | Apply |
   | `gated_auto` | 없음 | Defer |
   | `manual` | 있음 | Apply |
   | `manual` | 없음 | Defer |
   | `advisory` | — | Acknowledge |

   교차 리뷰어 동점 처리: `Skip > Defer > Apply > Acknowledge` 순서.
7. P2/P3 + advisory + testing/maintainability만 → 격하·억제 (모드 인식).
8. 앵커 75 미만 억제. 예외: P0 + 앵커 50 이상은 통과.
9. P0→P1→P2→P3, 앵커 내림차순 정렬. 단조 증가 `#` 할당 — 재매기기 금지.
10. **Coverage 데이터 수집.** 전체 리뷰어의 `residual_risks` + `testing_gaps` 합산.
11. **에이전트 출력물 보존.** learnings/agent-native/schema-drift/deployment-verification 출력물 유지 — 스키마 불일치를 이유로 비구조화 출력 버리지 말 것.
12. **에이전트 출력물 보존 완료.** learnings/agent-native/schema-drift/deployment-verification — Stage 6에서 별도 섹션으로 제시.

### Stage 5b: 검증 패스 — **headless·autofix·옵션C에서만 발견 사항별 검증자를 할당한다**

| 모드 | 실행 여부 |
|------|---------|
| `headless`, `autofix` | 예 |
| interactive 워크스루 | 아니오 (사용자가 검증자) |
| interactive 베스트 저지먼트 | 아니오 (수정 도구 결과가 검증) |
| interactive 티켓 생성 (C) | 예 (트래커 할당 전) |
| interactive 보고 전용 (D), report-only | 아니오 |

15개 초과 시 P0 우선 상위 15개만 검증. 나머지는 Coverage에 기록.

상세: @./references/validator-template.md

### Stage 6: 종합 및 제시 — **파이프 구분 마크다운 테이블로 렌더링한다**

출력 템플릿: @./references/review-output-template.md

출력 섹션 순서 (해당 없는 섹션 생략):

1. **헤더** — 범위, 의도, 모드, 리뷰어 팀
2. **발견 사항** — `### P0 -- Critical` ~ `### P3 -- Low` 심각도 그룹
3. **요구사항 완료 여부** — Stage 2b에서 플랜 발견 시만
4. **적용된 수정 사항** — 수정 단계 실행 시만
5. **잔여 실행 가능 작업** — 미해결 발견 사항
6. **기존 존재 사항** — 별도 섹션, 평결 미합산
7. **학습 내용 및 과거 솔루션** — `code-explorer` 결과
8. **에이전트 접근성 공백** — `code-reviewer` 결과, 없으면 생략
9. **스키마 드리프트 확인** — `database-reviewer` 실행 시
10. **배포 노트** — `database-reviewer` 실행 시
11. **커버리지** — 억제 수, 격하 수, 검증자 폐기, 잔여 위험, 테스트 공백, 실패 리뷰어
12. **평결** — Ready to merge / Ready with fixes / Not ready

규칙:
- 발견 사항은 자유 형식 텍스트로 렌더링 금지 — 테이블 필수
- 빈 심각도 레벨 생략
- `explicit` 플랜 누락 요구사항 → P1 발견 사항, `inferred` 누락 → P3 advisory
- 시간 추정치 포함 금지

---

## 리뷰 후 처리

### Step 1: 조치 세트 구축 — **발견 사항을 세 큐로 분류한다**

- 발견 없음 → 수정·전달 단계 건너뜀
- `safe_auto` → 수정 도구 큐
- `gated_auto`/`manual` → 잔여 실행 가능 큐
- `advisory` → 보고 전용 큐 (수정 작업이나 티켓으로 변환 금지)

### Step 2: 모드별 정책 — **P0/P1 미해결 시 plan을 자동 갱신하고 루프를 안내한다**

**Interactive:**

`safe_auto` 묻지 않고 자동 적용. `gated_auto`/`manual` 없으면 라우팅 질문 건너뜀.

**P0/P1 자동 loop-back:** `safe_auto` 적용 후 P0 또는 P1이 남아 있으면 라우팅 질문 없이 자동으로:

1. Stage 2b 플랜 파일 끝에 `## Review Pass N — Fix Units` 섹션 추가. 플랜 없으면 `docs/plans/YYYY/MM/DD-NNN-fix-<브랜치명>-plan.md` 신규 생성.
   - 각 미해결 발견 사항 → 새 U-ID (title, 대상 파일, suggested_fix, 테스트 시나리오 1개 이상)
   - `N` = 기존 `## Review Pass` 섹션 수 + 1
2. 출력 후 중단:

```
Plan updated: <plan-path>
Added <N> fix unit(s) for unresolved P0/P1 findings.

Fix loop:
  /genie:test   — write failing tests for the new fix units
  /genie:work   — implement against the updated plan
  /genie:review — re-review
```

**라우팅 질문 (P2/P3 잔여 시):** `AskUserQuestion` — (A) 워크스루 (B) 자동 해결 (C) 티켓 생성 (D) 보고만.

상세 프로토콜: @./references/walkthrough.md · @./references/tracker-defer.md · @./references/bulk-preview.md

**Autofix:** `safe_auto`만 적용. `fixes_applied_count > 0`이면 커밋은 `/genie:commit`으로.

**Report-only / Headless:** Stage 6 후 중단. 커밋·푸시·PR 없음.

### Step 3: 수정 도구 — **수정 도구 서브 에이전트 하나만 할당한다**

- `max_rounds: 2`. 베스트 저지먼트는 단일 패스.
- `requires_verification: true` → 타겟 검증 후 `applied`. 실패 시 `failed`.
- `suggested_fix` 없는 `gated_auto`/`manual` → `failed`.
- 동시 브라우저 테스트와 함께 수정 시작 금지.

### Step 4: 결과물 발행 — **모드에 따라 docs/ 또는 /tmp/에 저장한다**

**Interactive:** `date +%Y/%m/%d`로 날짜 확인 후 `mkdir -p docs/reviews/YYYY/MM` 실행. 최종 보고서를 `docs/reviews/YYYY/MM/DD-<제목>.md`로 저장.

**Autofix / Headless:** `/tmp/genie/review/<run-id>/`에 `metadata.json` 포함 저장.

**Report-only:** 저장 없음.

### Step 5: 최종 다음 단계 (Interactive 전용)

> **워크플로우 루프**: `/genie:plan` → `/genie:test` → `/genie:work` → `/genie:review` → _(P0/P1 발견 시 plan 자동 갱신 후 루프 재시작)_

`fixes_applied_count > 0` → 커밋·푸시·PR은 `/genie:commit`으로.

## 품질 게이트

- 모든 발견 사항은 구체적 조치를 명시해야 합니다 ("고려하십시오" 금지)
- 훑어보기 위양성 없음 — 주변 코드를 실제로 읽었는지 확인
- 심각도 적절히 보정 — 스타일 지적은 P0 불가, SQL 인젝션은 P3 불가
- 줄 번호는 파일 내용과 대조 확인
- 린터 출력과 중복 금지 — 시맨틱 이슈에 집중

## 폴백

병렬 서브 에이전트 미지원 시 순차 실행. 활성 동시성 제한 시 제한된 큐 규칙 사용.

---

## 포함된 참조

### 페르소나 카탈로그
@./references/persona-catalog.md

### 서브 에이전트 템플릿
@./references/subagent-template.md

### Diff 범위 규칙
@./references/diff-scope.md

### 범위 감지 명령어
@./references/scope-detection.md

### 발견 사항 스키마
@./references/findings-schema.json

### 리뷰 출력 템플릿
@./references/review-output-template.md

### 워크스루
@./references/walkthrough.md

### 트래커 감지 및 지연 실행
@./references/tracker-defer.md

### 일괄 작업 미리보기
@./references/bulk-preview.md

### 검증자 템플릿
@./references/validator-template.md
