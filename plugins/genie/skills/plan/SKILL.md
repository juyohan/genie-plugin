---
name: plan
description: "소프트웨어 기능, 리서치 워크플로우, 이벤트, 학습 계획 등 모든 다단계 작업을 위한 구조화된 플랜을 생성합니다. 또한 기존 플랜을 심화합니다. 사용자가 'plan this', 'create a plan', 'break this down', 'plan a trip', 'create a study plan'이라고 말하거나 브레인스토밍/요구사항 문서가 플랜 작성 준비가 되었을 때 사용합니다. 'deepen the plan', 'deepening pass'라고 말할 때 플랜 심화로 사용합니다."
argument-hint: "[선택 사항: 기능 설명, 요구사항 문서 경로, 심화할 플랜 경로 또는 플래닝할 작업]"
allowed-tools:
  - gem
---
> **기본 가이드라인**: 이 스킬에는 [SKILL.md](../SKILL.md)가 적용됩니다.

# 기술 플랜 생성

<feature_description> #$ARGUMENTS </feature_description>

`--add gemini` (또는 `--add gem`) 플래그가 있으면: gem 도구로 Gemini에 초안 검토 요청, 결과 통합, 산출물 상단에 "Gemini와의 협업을 통해 검토 및 보완되었습니다." 추가.

입력이 비어 있으면: "무엇을 플랜할까요?" 질문. 질문은 한 번에 하나. AskUserQuestion 우선.
모든 파일 참조는 레포지토리 상대 경로 사용 (절대 경로 금지).

## 실행 모드

- **대화형 모드** (기본): 종합 확인·플래닝 질문을 사용자와 주고받는다.
- **Headless 모드**: 비대화형 컨텍스트에서 트리거. 확인 없이 진행하며 Inferred 항목은 플랜의 `## Assumptions`에 기록.
- **파이프라인 모드**: `LFG` 또는 `disable-model-invocation` 신호 시 트리거. 메뉴·확인·Doc Review 없이 즉시 호출자에게 반환. Headless보다 엄격.

## 1. 분류

소프트웨어 작업(코드/레포/API/DB 참조 또는 build/modify/deploy 요청)이면 섹션 2로 진행.
도메인이 모호하면 먼저 물어보십시오.
그 외 → 섹션 8 (비소프트웨어 플래닝).

## 2. 소스 확인

**기존 플랜 재개**: `docs/plans/`에 일치하는 플랜이 있으면 읽고 제자리 업데이트 또는 신규 작성을 확인하십시오.
**심화 의도**: "deepen" 단어가 있으면 대상 플랜을 식별한 후 섹션 7 심화 패스로 단축하십시오.
**요구사항 문서**: `docs/brainstorms/`에서 의미상 일치하는 파일을 검색하십시오 (30일 이내 + 같은 주제). 여러 개 일치하면 어느 것을 쓸지 물어보십시오.

## 3. 범위 종합 (Synthesis)

**Solo (요구사항 문서 없음)**: 섹션 4 조사 전에 종합 제시. 사용자 확인 후 조사 진행.
**Brainstorm-sourced**: 섹션 4 조사 후, 플랜 작성 전에 종합 제시.

**3-bucket:**
- **Stated**: 사용자가 명시적으로 말한 내용
- **Inferred**: 에이전트가 공백을 채운 가정 (사용자가 바로잡을 수 있는 베팅)
- **Out**: 의도적으로 제외된 항목

종합 제시 후 명시적 확인을 기다리십시오. 수정 요청 시 → 통합 후 재제시, 확인 전까지 플랜 작성 금지.
**Headless 모드**: 확인 없이 진행. Inferred 항목은 플랜의 `## Assumptions` 섹션에 기록.
종합은 결정/범위 체크포인트입니다. 종합 제시 시에만 파일 경로·코드·구현 세부사항을 포함하지 마십시오 (플랜 본문에는 포함됩니다).

## 4. 조사

**항상 병렬 실행:**
- `docs/brainstorms/`, `docs/plans/`, `docs/solutions/`에서 관련 문서 검색
- 수정할 파일과 인접 코드 읽기, 기존 패턴 파악

**조건부 (고위험 또는 외부 의존성):**
- 외부 프레임워크/라이브러리 문서 참조
- Standard/Deep: 에지 케이스 흐름 분석

조사 결과가 외부 계약 표면(API 인터페이스, DB 스키마)을 드러내면 플랜 깊이를 Deep으로 상향하십시오.

## 5. 플랜 구조화

**플래닝 질문**: 조사 후 미결 사항이 있으면 먼저 물어보십시오. 플래닝 시점 질문과 구현 시점 미지수를 분리하십시오.

**U-ID 규칙:**
- 각 구현 단위: `- U1. **이름**`, `- U2. **이름**`
- 재배열·분할·삭제 후에도 기존 U-ID 절대 변경 금지. 분할 시 원본 U-ID 유지, 신규 단위는 다음 번호. 삭제로 인한 공백은 유지.

**구현 단위 정의 (기능 포함 단위마다):**
- 수정할 파일 (레포지토리 상대 경로)
- 접근 방식 설명 (방향 가이드, 구현 코드 아님)
- 테스트 시나리오: happy path, edge cases, error paths, integration (각 카테고리별로 입력과 예상 결과 명시)

기원 Key Flow를 구현하는 단위는 F-ID를, Acceptance Example을 강제하는 단위는 AE-ID를 인용하십시오.

## 6. 플랜 작성

**깊이 가이드:**
- **Lightweight**: Summary + Requirements + Units (테스트 시나리오 포함) + Risks
- **Standard**: Lightweight + Actors + Key Flows + Context & Research + Key Technical Decisions + Open Questions
- **Deep**: Standard + System-Wide Impact + High-Level Technical Design (방향 가이드, 구현 명세 아님) + 단계별 인도

비선형 의존성을 가진 4개 이상 단위, 3개 이상 상호작용 표면, 3개 이상 동작 모드, 3개 이상 상호작용 결정이 있으면 Mermaid 또는 마크다운 테이블로 구조를 시각화하십시오.

**저장 경로:** 저장 전 `date +%Y/%m/%d`로 오늘 날짜를 확인하고 `mkdir -p docs/plans/YYYY/MM`를 실행하십시오. 파일: `docs/plans/YYYY/MM/DD-<제목>.md`
`<제목>`은 참조한 brainstorm 문서의 제목(`DD-<제목>.md`에서 `<제목>` 부분)과 반드시 동일하게 사용하십시오. brainstorm 없이 신규 작성 시에는 `ls docs/plans/YYYY/MM/`으로 중복을 확인 후 결정하십시오.
R/A/F/AE-ID를 Requirements, Units, 테스트 시나리오에 추적하십시오. 결정 사항에는 근거를 포함하십시오.

## 7. 심화 및 핸드오프

**Confidence Check (플랜 작성 후 자동 실행):**

섹션별 점수 산정 → 상위 2~5개 심화 후보 선정 (Lightweight는 1~2개):
- **트리거 체크리스트** (각 1점): Open Questions 미해결 ≥ 2개 · Risks 섹션 1줄 이하 · 외부 의존성 있는데 Context/Sources 없음 · Key Technical Decisions 부재 · 테스트 시나리오 edge case 누락
- **고위험 도메인 보너스** (+1): 인증·결제·마이그레이션·외부 API 관련 단위 존재 시
- **핵심 섹션 보너스** (+1): Key Decisions, Units, Risks 중 하나라도 얇을 때
- 임계값: 총점 2점 이상, 또는 고위험 도메인 보너스 해당 시

에이전트 할당 (섹션당 1~3개, 총 8개 이하):
- Requirements/Open Questions → `code-explorer`, `code-architect`
- Context/Sources → `code-explorer`, `docs-lookup`
- Key Technical Decisions → `architect`
- Implementation Units → `code-explorer`, `code-architect`
- System-Wide Impact → `architect`, `performance-optimizer`, `security-reviewer`
- Risks/Dependencies → 리스크 유형에 맞는 전문가 에이전트

심화 필요 없으면 "Confidence check passed" 보고 후 핸드오프로 진행.

**심화 의도 (`deepen` 감지 시):**
- Interactive 모드: 발견 사항을 하나씩 제시, 수락/거부 선택.
- `deepened:` 필드가 이미 있으면 재심화 명시 요청 없이는 강제하지 않음.
- "strengthen", "gaps", "rigor" 단어만으로는 심화 의도로 트리거하지 마십시오.

**핸드오프** (저장된 플랜 상대 경로 포함):

다음 단계: `/genie:test`
- Lightweight이거나 즉시 구현 가능하면 `/genie:work` 직행
- 파이프라인 모드(`LFG`, `disable-model-invocation`)이면 즉시 호출자에게 반환

## 8. 비소프트웨어 플래닝

소프트웨어 작업이면 섹션 2로 돌아가십시오.
단순 조회·단일 단계 작업이면 직접 응답하십시오.
파이프라인 모드이면 "소프트웨어가 아닌 작업입니다. /genie:plan을 직접 사용하십시오." 출력 후 중단.

**진행:**
1. 1~3개 명확화 질문 (답변이 플랜 구조를 바꿀 때). 항상 "가정으로 바로 작성" 옵션 포함.
2. 조사 필요성: 장소·가격·일정 등 시간 민감한 사실에 의존하면 gem 도구로 병렬 웹 검색 먼저 실행.
3. U-ID, 범위 경계, 검증 시나리오는 소프트웨어와 동일하게 적용.
4. 템플릿 조정: YAML frontmatter 대신 `# 제목` + `Created:` 날짜. Software confidence check 생략.
5. 완료 후: 섹션 6 저장 경로 적용. Doc Review 생략. 핸드오프는 직접 실행 또는 사용자 재량.
