# YAML Frontmatter 스키마 (YAML Frontmatter Schema)

이 디렉토리의 `schema.yaml`은 `genie:learn`에 의해 작성되는 `docs/solutions/` frontmatter에 대한 정식 계약(canonical contract)입니다.

이 파일을 다음 항목에 대한 빠른 참조로 사용하십시오:
- 필수 필드
- 열거형(enum) 값
- 검증 기대치
- 카테고리 매핑
- 트랙 분류 (버그 vs 지식)

## 트랙 (Tracks)

`problem_type`에 따라 적용되는 **트랙**이 결정됩니다. 각 트랙은 서로 다른 필수 및 선택 필드를 가집니다.

| 트랙 | problem_types | 설명 |
|-------|--------------|-------------|
| **버그 (Bug)** | `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `integration_issue`, `logic_error` | 진단 및 수정된 결함과 실패 사례 |
| **지식 (Knowledge)** | `best_practice`, `documentation_gap`, `workflow_issue`, `developer_experience`, `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention` | 관행, 패턴, 컨벤션, 결정, 워크플로 개선 및 문서화. 가장 좁은 범위의 값을 우선하며, `best_practice`는 폴백용입니다. |

## 필수 필드 (두 트랙 공통)

- **module**: 영향을 받는 모듈 또는 영역
- **date**: `YYYY-MM-DD` 형식의 ISO 날짜
- **problem_type**: 위의 트랙 테이블에 나열된 값 중 하나
- **component**: `rails_model`, `rails_controller`, `rails_view`, `service_object`, `background_job`, `database`, `frontend_stimulus`, `hotwire_turbo`, `email_processing`, `brief_system`, `assistant`, `authentication`, `payments`, `development_workflow`, `testing_framework`, `documentation`, `tooling` 중 하나
- **severity**: `critical`, `high`, `medium`, `low` 중 하나

## 버그 트랙 필드 (Bug Track Fields)

필수:
- **symptoms**: 1-5개의 관찰 가능한 증상(에러, 고장난 동작)을 담은 YAML 배열
- **root_cause**: `missing_association`, `missing_include`, `missing_index`, `wrong_api`, `scope_issue`, `thread_violation`, `async_timing`, `memory_leak`, `config_error`, `logic_error`, `test_isolation`, `missing_validation`, `missing_permission`, `missing_workflow_step`, `inadequate_documentation`, `missing_tooling`, `incomplete_setup` 중 하나
- **resolution_type**: `code_fix`, `migration`, `config_change`, `test_fix`, `dependency_update`, `environment_setup`, `workflow_improvement`, `documentation_update`, `tooling_addition`, `seed_data_update` 중 하나

## 지식 트랙 필드 (Knowledge Track Fields)

공통 필드 외에 추가적인 필수 필드가 없습니다. 아래 필드들은 모두 선택 사항입니다:

- **applies_when**: 이 가이드가 적용되는 조건이나 상황
- **symptoms**: 이 가이드를 작성하게 된 관찰 가능한 공백이나 마찰(friction)
- **root_cause**: 특정한 원인이 있는 경우 그 근본 원인
- **resolution_type**: 해당하는 경우 변경 유형

## 선택 필드 (두 트랙 공통)

- **related_components**: 관련된 다른 컴포넌트들
- **tags**: 소문자와 하이픈으로 구분된 검색 키워드

## 선택 필드 (버그 트랙 전용)

- **rails_version**: Rails 버전 인 `X.Y.Z` 형식

## 하위 호환성 (Backward Compatibility)

트랙 시스템 도입 전에 생성된 문서는 지식형 `problem_types`에 `symptoms`/`root_cause`/`resolution_type`을 가지고 있을 수 있습니다. 이들은 유효한 레거시 문서입니다:

- 지식 트랙 문서에 포함된 버그 트랙 필드는 무해합니다. 다른 이유로 문서를 다시 작성하는 경우가 아니면 리프레시 중에 이를 제거하지 마십시오.
- **새로운** 문서를 생성할 때는 위의 트랙 규칙을 따르십시오.

## 카테고리 매핑 (Category Mapping)

- `build_error` -> `docs/solutions/build-errors/`
- `test_failure` -> `docs/solutions/test-failures/`
- `runtime_error` -> `docs/solutions/runtime-errors/`
- `performance_issue` -> `docs/solutions/performance-issues/`
- `database_issue` -> `docs/solutions/database-issues/`
- `security_issue` -> `docs/solutions/security-issues/`
- `ui_bug` -> `docs/solutions/ui-bugs/`
- `integration_issue` -> `docs/solutions/integration-issues/`
- `logic_error` -> `docs/solutions/logic-errors/`
- `developer_experience` -> `docs/solutions/developer-experience/`
- `workflow_issue` -> `docs/solutions/workflow-issues/`
- `best_practice` -> `docs/solutions/best-practices/`
- `documentation_gap` -> `docs/solutions/documentation-gaps/`
- `architecture_pattern` -> `docs/solutions/architecture-patterns/`
- `design_pattern` -> `docs/solutions/design-patterns/`
- `tooling_decision` -> `docs/solutions/tooling-decisions/`
- `convention` -> `docs/solutions/conventions/`

## 검증 규칙 (Validation Rules)

1. 트랙 테이블을 사용하여 `problem_type`으로부터 트랙을 결정합니다.
2. 모든 공통 필수 필드가 있어야 합니다.
3. 버그 트랙 문서는 버그 트랙 필수 필드(`symptoms`, `root_cause`, `resolution_type`)를 포함해야 합니다.
4. 지식 트랙 문서는 공통 필드 외에 추가 필수 필드가 없습니다.
5. 기존 지식 트랙 문서에 있는 버그 트랙 필드는 무해합니다 (하위 호환성 참조).
6. 열거형(Enum) 필드는 허용된 값과 정확히 일치해야 합니다.
7. 배열 필드는 최소/최대 항목 수를 준수해야 합니다.
8. `date`는 `YYYY-MM-DD` 형식이어야 합니다.
9. `rails_version`이 있는 경우 `X.Y.Z` 형식이어야 하며 버그 트랙 문서에만 적용됩니다.

## YAML 안전 규칙 (YAML Safety Rules)

엄격한 YAML 1.2 파서(`yq`, `js-yaml` strict, PyYAML)는 예약된 지시자 문자로 시작하는 따옴표 없는 스칼라(scalar) 형태의 배열 항목을 거부합니다. 문자열 배열 필드(`symptoms`, `applies_when`, `tags`, `related_components` 또는 향후 추가될 배열 필드)의 항목을 작성할 때, 다음 문자로 시작하는 값은 반드시 큰따옴표로 감싸십시오:

`` ` ``, `[`, `*`, `&`, `!`, `|`, `>`, `%`, `@`, `?`

또한 값에 `": "` 문자열이 포함된 경우에도 따옴표를 사용하십시오 — 해당 문장 부호는 flow-style 파서를 혼동시킵니다.

예시 — 이전 (엄격한 YAML에서 오류 발생):

    symptoms:
      - `sudo dscacheutil -flushcache` does not restore in-container mDNS

예시 — 이후 (정상적으로 파싱됨):

    symptoms:
      - "`sudo dscacheutil -flushcache` does not restore in-container mDNS"

이 규칙은 모든 문자열 배열 frontmatter 필드에 적용됩니다. 스칼라 문자열 필드인 `description:` 은 고유의 따옴표 규칙을 가집니다 (플러그인 `AGENTS.md`의 "YAML Frontmatter" 섹션 참조).
