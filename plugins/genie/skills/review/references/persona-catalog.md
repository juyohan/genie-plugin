# 페르소나 카탈로그 (Persona Catalog)

18명의 리뷰어 페르소나는 상시 가동(always-on), 교차 조건부(cross-cutting conditional), 스택 특정 조건부(stack-specific conditional) 계층과 보조 에이전트로 구성됩니다. 오케스트레이터는 이 카탈로그를 사용하여 각 리뷰에 생성할 리뷰어를 선택합니다.

## 상시 가동 (Always-on) (4개 페르소나 + 2개 보조 에이전트)

diff 내용에 관계없이 모든 리뷰에서 생성됩니다.

**페르소나 에이전트 (구조화된 JSON 출력):**

| 페르소나 | 에이전트 | 중점 사항 |
|---------|-------|-------|
| `correctness` | `genie:review-correctness` | 로직 오류, 에지 케이스, 상태 버그, 오류 전파, 의도 준수 여부 |
| `testing` | `genie:review-testing` | 테스트 커버리지 부족, 취약한 어설션(assertion), 깨지기 쉬운 테스트, 누락된 에지 케이스 테스트 |
| `maintainability` | `genie:review-maintainability` | 결합도(coupling), 복잡성, 네이밍, 데드 코드, 섣부른 추상화 |
| `project-standards` | `code-reviewer` | CLAUDE.md 및 AGENTS.md 준수 여부 -- frontmatter, 참조, 네이밍, 크로스 플랫폼 이식성, 도구 선택 |

**보조 에이전트 (비구조화된 출력, 별도로 합성됨):**

| 에이전트 | 중점 사항 |
|-------|-------|
| `code-reviewer` | 새로운 기능이 에이전트가 접근 가능한지 확인 |
| `code-explorer` | 이 PR의 모듈 및 패턴과 관련된 과거 이슈를 docs/solutions/에서 검색 |

## 조건부 (Conditional) (7개 페르소나)

오케스트레이터가 diff에서 관련 패턴을 식별할 때 생성됩니다. 오케스트레이터는 전체 diff를 읽고 선택 여부를 판단합니다. 이는 키워드 매칭이 아닌 에이전트의 판단에 따릅니다.

| 페르소나 | 에이전트 | 선택 기준 (diff가 다음을 포함할 때...) |
|---------|-------|---------------------------|
| `security` | `genie:security` | 인증 미들웨어, 퍼블릭 엔드포인트, 사용자 입력 처리, 권한 확인, 비밀정보(secrets) 관리 |
| `performance` | `genie:perf` | 데이터베이스 쿼리, ORM 호출, 루프가 많은 데이터 변환, 캐싱 계층, 비동기/병렬 코드 |
| `api-contract` | `code-reviewer` | 라우트 정의, 시리얼라이저/인터페이스 변경, 이벤트 스키마, 내보낸 타입 시그니처, API 버저닝 |
| `data-migrations` | `database-reviewer` | 마이그레이션 파일, 스키마 변경, 백필(backfill) 스크립트, 데이터 변환 |
| `reliability` | `silent-failure-hunter` | 오류 처리, 재시도 로직, 서킷 브레이커, 타임아웃, 백그라운드 작업, 비동기 핸들러, 헬스 체크 |
| `adversarial` | `genie:review-adversarial` | 테스트/생성된 파일/lockfile을 제외한 변경된 라인이 50줄 이상이거나, 인증, 결제, 데이터 변경, 외부 API 연동 등 고위험 영역을 건드릴 때 |
| `previous-comments` | `pr-test-analyzer` | **PR 전용 및 코멘트가 있을 때만.** 이전 리뷰 라운드의 리뷰 코멘트나 스레드가 있는 PR을 리뷰할 때. Stage 1에서 PR 메타데이터를 수집하지 못했거나, `hasPriorComments` 플래그가 false인 경우 생략합니다. |

## 스택 특정 조건부 (Stack-Specific Conditional) (6개 페르소나)

이 리뷰어들은 고유의 전문적인 관점을 유지합니다. 위의 교차 조건부 페르소나를 대체하는 것이 아니라 추가되는 형태입니다.

| 페르소나 | 에이전트 | 선택 기준 (diff가 다음을 포함할 때...) |
|---------|-------|---------------------------|
| `python` | `genie:py` | Python 모듈, 엔드포인트, 서비스, 스크립트 또는 타입이 지정된 도메인 코드 |
| `typescript` | `genie:ts` | TypeScript/JavaScript 컴포넌트, 서비스, 훅, 유틸리티, 비동기 UI 흐름, 공유 타입 |
| `swift-ios` | `genie:swift` | Swift 파일, SwiftUI 뷰, UIKit 컨트롤러, `.entitlements`, `PrivacyInfo.xcprivacy`, `.xcdatamodeld`, `Package.swift`, `Package.resolved`, 스토리보드, XIB, 또는 `.pbxproj` 내의 의미론적 빌드 설정/타겟 멤버십/코드 사이닝 변경 사항 |
| `go` | `genie:go` | Go 서비스, CLI, 패키지 |
| `java` | `genie:java` | Java/Spring Boot 서비스, 컨트롤러, 레포지토리 |
| `kotlin` | `genie:kotlin` | Kotlin/Android 컴포넌트, ViewModel, Compose |

## 조건부 에이전트 (마이그레이션 특정)

페르소나 에이전트가 다루지 않는 특수 분석을 제공합니다. diff에 데이터베이스 마이그레이션, schema.rb 또는 데이터 백필이 포함될 때 생성하십시오.

| 에이전트 | 중점 사항 |
|-------|-------|
| `database-reviewer` | DB 스키마 변경과 마이그레이션 교차 참조, 드리프트 감지, SQL 검증 쿼리 및 배포 체크리스트 |

## 선택 규칙

1. **상시 가동 페르소나 4개**와 보조 에이전트 2개를 항상 생성합니다.
2. **각 교차 조건부 페르소나**에 대해, 오케스트레이터는 diff를 읽고 해당 페르소나의 영역이 관련이 있는지 결정합니다. 이는 키워드 매칭이 아닌 판단에 근거합니다.
3. **각 스택 특정 조건부 페르소나**에 대해, 파일 타입과 변경 패턴을 시작점으로 사용하되, diff가 실제로 해당 리뷰어에게 유의미한 작업을 제공하는지 결정합니다. 단순히 설정 파일이나 생성된 파일의 확장자가 일치한다고 해서 언어별 리뷰어를 생성하지 마십시오.
4. **조건부 에이전트** (`database-reviewer`)는 diff에 마이그레이션 파일 또는 데이터 백필 스크립트가 포함된 경우 생성합니다.
5. 리뷰어 팀을 생성하기 전, 선택된 각 조건부 리뷰어에 대한 짧은 정당성(justification)을 한 줄로 **발표**합니다.
