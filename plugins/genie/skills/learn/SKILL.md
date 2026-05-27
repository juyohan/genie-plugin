---
name: learn
description: 작업 세션에서 행동 패턴을 추출하여 ~/.claude/skills/learned/에 스킬로 저장합니다.
allowed-tools:
  - gem
---
> **기본 가이드라인**: 이 스킬에는 [SKILL.md](../SKILL.md)가 적용됩니다.

# /genie:learn

`--add gemini` (또는 `--add gem`) 플래그가 있으면: gem 도구로 Gemini에 초안 검토 요청, 결과 통합, 산출물 상단에 "Gemini와의 협업을 통해 검토 및 보완되었습니다." 추가.

병렬 하위 에이전트를 조율하여 세션의 행동 패턴을 스킬로 추출합니다.

## 핸드오프 모드

`$ARGUMENTS`에 `--handoff` 플래그가 포함된 경우, 사용자에게 묻지 않고 자동으로 실행합니다:

- 모드 선택 질문 생략 — 항상 Lightweight 모드로 실행
- 세션 히스토리 질문 생략 — 현재 세션 전체(brainstorm/plan/work 대화 포함)를 자동 참조
- 완료 후 "다음 작업" 질문 생략 — 조용히 종료
- 패턴 미감지 시: 스킬 파일을 생성하지 않고 조용히 종료

## 목적

현재 세션에서 발견된 행동 패턴을 `~/.claude/skills/learned/[slug].md`로 저장합니다. `session-start.js`가 매 세션 시작 시 `## When to Use` 섹션(220자 한도)을 컨텍스트에 주입합니다 — 최신순 최대 6개. Claude는 관련성이 있을 때 이 스킬을 참조하여 적용합니다.

## 추출 기준 — 하나 이상 해당 시 추출

| 신호 | 추출 여부 |
|------|---------|
| 사용자 명시 지시 ("이렇게 해", "하지 마") | 항상 추출 |
| 리뷰에서 P0/P1로 지적됐다가 수정된 패턴 | 추출 |
| 동일 접근법을 2회 이상 반복 적용 | 추출 |
| 명시적 트레이드오프 결정 ("A 대신 B를 선택한 이유…") | 추출 |
| 이 코드베이스에서만 통하는 프로젝트 고유 컨벤션 | 추출 |
| 표준 보일러플레이트·범용 구현 | 추출 안 함 |
| 재현 불가능한 일회성 조작 | 추출 안 함 |

## 사전 확인된 컨텍스트

**Git 브랜치:** !`git rev-parse --abbrev-ref HEAD 2>/dev/null || true`

확인된 브랜치 이름은 단계 1 에이전트에 전달하십시오.

## 지원 파일

- `assets/resolution-template.md` — 스킬 파일 섹션 구조 (조립 시 읽음)

하위 에이전트 생성 시 관련 파일 내용을 작업 프롬프트에 전달하십시오.

## 실행 전략

`AskUserQuestion`으로 모드를 선택하십시오 (스키마 미로드 시 `ToolSearch`로 `select:AskUserQuestion` 먼저 호출). 질문을 소리 없이 건너뛰지 마십시오.

```
1. Full (추천) — 병렬 하위 에이전트로 패턴 추출·중복 확인 후 저장
2. Lightweight — 단일 패스로 빠르게 저장. 중복 감지·교차 참조 없음
```

Full 모드 선택 시 추가 질문:
```
세션 히스토리를 검색하여 이전 학습 내용을 보강하시겠습니까? (시간·토큰 증가)
```

---

### Full 모드

<critical_requirement>
주요 출력물은 단 하나의 파일입니다. 하위 에이전트는 텍스트 데이터만 반환하고, 오케스트레이터만 파일을 작성합니다: `~/.claude/skills/learned/[slug].md`.
</critical_requirement>

#### 단계 0.5: 자동 메모 스캔

시스템 프롬프트의 "user's auto-memory" 블록에서 관련 항목을 스캔합니다. 관련 항목 발견 시 단계 1 에이전트에 전달하십시오.

#### 단계 1: 추출 — 병렬 실행

**Context Analyzer**, **Skill Extractor**, **Related Skills Finder**를 백그라운드 병렬로, **Session Historian**을 포그라운드로 실행합니다.

**Context Analyzer**
- 대화 히스토리에서 반복 패턴·의사결정 원칙·모범 사례를 식별합니다.
- 반환: 패턴 목록, 제안 파일 슬러그 (`[pattern-slug].md`, kebab-case), 적용 범위.

**Skill Extractor**
- 대화에서 구체적인 행동 지침을 추출합니다.
- 반환: `When to Use` (220자 이내·간결), `Guidance`, `Why This Matters`, `When to Apply`, `Examples`.

**Related Skills Finder**
- `~/.claude/skills/learned/`에서 `## When to Use`를 읽어 의미론적 유사성을 평가합니다.
- 반환: 관련 스킬 목록과 중복도 (High/Moderate/Low).

**Session Historian** (사용자 동의 시만)
- `~/.claude/projects/`, `~/.codex/sessions/`에서 7일치 세션을 검색합니다.
- 반환: 이전 세션의 관련 패턴 요약.

#### 단계 2: 조립 및 작성

모든 단계 1 에이전트 완료 후 진행합니다.

| 중복도 | 작업 |
|---------|--------|
| **High** | 기존 스킬 업데이트 |
| **Moderate** | 새 스킬 생성 + 관련 링크 추가 |
| **Low/없음** | 새 스킬 생성 |

1. 세션 히스토리 발견 사항으로 `Why This Matters` · `When to Apply` 보강 (출처에 "(session history)" 태그)
2. 코드 예시의 민감 정보 `[REDACTED]`로 대체
3. `assets/resolution-template.md` 읽어 구조 확인
4. `~/.claude/skills/learned/[slug].md` 작성

**스킬 파일 형식:**
```markdown
# [skill-slug]

## When to Use
[간결·행동 지향 — 220자 한도]

## Guidance
[구체적인 행동 지침]

## Why This Matters
[중요한 이유와 미준수 결과]

## When to Apply
- [조건 1]

## Examples
[Before/After 또는 사용 예]
```

---

### Lightweight 모드

병렬 에이전트 없이 단일 패스로 동일한 스킬 파일을 생성합니다.

1. 대화 히스토리 전체(brainstorm/plan/test/work 포함)에서 패턴 추출
2. "user's auto-memory" 블록 스캔하여 보조 컨텍스트 활용
3. `assets/resolution-template.md`의 구조로 `~/.claude/skills/learned/[slug].md` 작성

---

## 피해야 할 흔한 실수

| ❌ 잘못된 방식 | ✅ 올바른 방식 |
|----------|-----------|
| 하위 에이전트가 스킬 파일을 직접 작성 | 텍스트 반환만, 오케스트레이터가 파일 작성 |
| 추출과 조립 동시 실행 | 추출 완료 후 조립 시작 |
| `## When to Use` 모호하게 작성 | 220자 한도, 행동 지향적으로 작성 |
| 기존 스킬 있는데 새로 생성 | Related Skills Finder 결과 확인 후 업데이트 |

## 성공 출력

**Full 모드:**
```
✓ 스킬 저장 완료

  ✓ Context Analyzer: N개 행동 패턴 감지
  ✓ Skill Extractor: When to Use, Guidance, Examples 추출 완료
  ✓ Related Skills Finder: [결과]
  ✓ Session Historian: [결과 또는 건너뜀]

저장: ~/.claude/skills/learned/[slug].md
다음 세션부터 session-start.js가 이 스킬을 컨텍스트에 주입합니다.
```

**Lightweight 모드:**
```
✓ 스킬 저장 완료 (lightweight)
저장: ~/.claude/skills/learned/[slug].md
```

핸드오프 모드가 아닌 경우, 성공 출력 후 `AskUserQuestion`으로 "다음 작업은 무엇입니까?"를 물으십시오.
