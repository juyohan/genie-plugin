# Genie Plugin

**Genie**는 Claude Code와 Codex를 위한 Compound Engineering 워크플로우 플러그인입니다.
아이디어 구체화부터 구현, 리뷰, 지식 자산화까지 — 일관된 단계별 루프로 개발을 진행합니다.

> 버전: **2.9.9** · Claude Code · Codex 지원

---

## 처음이라면

설치 후 가장 먼저 아래 커맨드를 실행하세요. 프로젝트 스택을 자동으로 감지하고 `CLAUDE.md`와 기본 문서를 생성합니다.

```
/genie:setup
```

나머지 설정은 그 다음입니다. 자세한 흐름은 [빠른 시작 가이드](docs/guides/quickstart.md)를 참고하세요.

---

## 설치

| 단계 | Claude Code | Codex |
|------|-------------|-------|
| **1. 마켓플레이스 등록** | `/plugin marketplace add juyohan/genie-plugin` | `codex plugin marketplace add juyohan/genie-plugin` |
| **2. 플러그인 설치** | `/plugin install genie-plugin@john` | `codex` 실행 → `/plugins` → **genie-plugin** → Install → 재시작 |

> `genie-plugin@john` = 마켓플레이스 `john`의 `genie-plugin`. 설치 후 플러그인 이름은 `genie`.

### 규칙 적용 (Claude Code 전용 · 필수)

플러그인 규칙은 전역(`~/.claude/rules/`)에 놓여야 모든 프로젝트에 자동 적용됩니다. 설치 후 아래 명령어로 복사하세요.

```bash
mkdir -p ~/.claude/rules/john
cp -R ~/.claude/plugins/genie/rules/* ~/.claude/rules/john/
```

---

## 핵심 워크플로우

```
/genie:setup → /genie:brainstorm → /genie:plan → /genie:test → /genie:work → /genie:review → /genie:commit → /genie:push → /genie:learn
```

각 단계는 완료 후 자동으로 다음 단계를 실행하지 않습니다. 산출물을 확인한 뒤 직접 다음 커맨드를 실행하세요.

### 단계별 설명

| 커맨드 | 역할 | 산출물 |
|--------|------|--------|
| `/genie:setup` | 프로젝트 초기화 — 스택 자동 감지 후 CLAUDE.md + docs/ 생성 | `CLAUDE.md`, `docs/conventions.md`, `docs/architecture.md` |
| `/genie:brainstorm` | 요구사항 정의 — 한 번에 하나씩 질문하며 요구사항 문서 작성 | `docs/brainstorms/YYYY/MM/DD-<제목>.md` |
| `/genie:plan` | 구현 계획 — 결정사항, 유닛, 테스트 시나리오, 리스크 정의 | `docs/plans/YYYY/MM/DD-<제목>.md` |
| `/genie:test` | TDD 명세 — 실패하는 테스트 먼저 작성 (RED) | 테스트 파일 |
| `/genie:work` | 구현 — 플랜 가드레일에 따라 기능을 완성 | 커밋 |
| `/genie:team` | 병렬 구현 — 독립 단위 3개 이상일 때 같은 브랜치에서 동시 실행 (⚠️ 신규 기능 — 안정화 중) | 커밋 (웨이브별) |
| `/genie:review` | 코드 리뷰 — 다층 페르소나로 품질·보안·유지보수성 검토 | `docs/reviews/YYYY/MM/DD-<제목>.md` |
| `/genie:commit` | 커밋 — 가치 중심의 커밋 메시지 생성 및 커밋 실행 | git commit |
| `/genie:push` | 푸시 — AWS CodeCommit MFA 자동 처리 [^push] | git push |
| `/genie:learn` | 지식 자산화 — 이번 세션의 패턴·레슨런 기록 | `~/.claude/skills/learned/` |

[^push]: `genie:push`는 AWS CodeCommit + MFA 환경에서 자격증명을 자동 처리합니다. GitHub·GitLab 등 일반 저장소에서는 `git push`와 동일하게 동작합니다.

---

## 훅 자동화

훅은 편집·커밋·세션 전후에 자동으로 실행되는 품질 자동화입니다. 별도 설정 없이 설치 직후부터 작동합니다.

### 프로필

작업 성격에 따라 활성화할 훅 수준을 조정할 수 있습니다.

| 프로필 | 적합한 상황 | 설정 방법 |
|--------|------------|----------|
| `minimal` | 탐색적 작업, 빠른 실험 | `GENIE_HOOK_PROFILE=minimal` |
| `standard` | 일반 개발 (기본값) | 별도 설정 불필요 |
| `strict` | PR 전 최종 품질 검사 | `GENIE_HOOK_PROFILE=strict` |

`~/.claude/settings.json`의 `env` 섹션에 추가하면 됩니다.

```json
{
  "env": {
    "GENIE_HOOK_PROFILE": "strict"
  }
}
```

### 주요 훅

| 훅 | 동작 시점 | 하는 일 |
|----|---------|---------|
| branch-guard | commit·push 전 | main·master·develop·staging 직접 작업 차단 |
| credential-guard | 파일 저장 전 | AWS 키·토큰 등 자격증명 파일 저장 방지 |
| quality-gate | 파일 편집 후 | 해당 파일 포매터 자동 실행 (Biome·Prettier·gofmt·black 자동 감지) |
| format-typecheck | 세션 종료 시 | 이번 세션에서 편집한 TS 파일만 타입 체크 |
| session-start | 세션 시작 시 | 이전 세션 컨텍스트·진행 중 태스크 자동 로드 |
| session-end | 세션 종료 시 | 세션 요약 저장 (다음 세션 재개용) |
| cost-tracker | 세션 종료 시 | 이번 세션 API 사용 비용 기록 |

전체 훅 목록과 환경변수 설정은 [훅 README](plugins/genie/scripts/hooks/README.md)를 참고하세요.

---

## 브랜치 보호

`main` · `master` · `develop` · `staging` 브랜치에서 작업을 요청하면 에이전트가 **자동으로 작업을 멈추고** 별도 브랜치 생성을 요구합니다. 예외 없이 매 요청마다 적용됩니다.

---

## 모델 라우팅 (Claude Code)

| 모델 | 용도 |
|------|------|
| **Sonnet** | 커맨드 기본: `setup`, `brainstorm`, `plan`, `test`, `work`, `team`, `review`, `push` |
| **Haiku** | 경량 커맨드: `commit`, `learn`, `help`, `@genie:docs`, `@genie:review-coherence` |
| **Opus** | 심층 추론 에이전트: `@genie:architect` (아키텍처 결정), `@genie:planner` (복잡한 구현 계획) |

> Opus 에이전트는 커맨드 흐름 안에서 필요 시 자동 파견됩니다. 직접 호출도 가능합니다.

---

## 전문 에이전트

언어·도메인별 에이전트를 채팅에서 직접 호출합니다.

### 언어별 리뷰어

| 에이전트 | 전문 분야 |
|----------|----------|
| `@genie:ts` | TypeScript / JavaScript |
| `@genie:java` | Java / Spring Boot |
| `@genie:kotlin` | Kotlin / Android / KMP |
| `@genie:py` | Python |
| `@genie:go` | Go |
| `@genie:swift` | Swift / iOS |

### 빌드 수정

| 에이전트 | 전문 분야 |
|----------|----------|
| `@genie:fix` | TypeScript / JavaScript 빌드 에러 |
| `@genie:fix-go` | Go 빌드 에러 |
| `@genie:fix-java` | Java / Maven / Gradle 빌드 에러 |
| `@genie:fix-kotlin` | Kotlin / Gradle 빌드 에러 |
| `@genie:fix-swift` | Swift / Xcode 빌드 에러 |

### 도구

| 에이전트 | 전문 분야 |
|----------|----------|
| `@genie:architect` | 시스템 설계 및 아키텍처 결정 |
| `@genie:planner` | 구현 계획 수립 |
| `@genie:tdd` | 테스트 주도 개발 |
| `@genie:review` | 코드 리뷰 (품질·보안·유지보수성) |
| `@genie:security` | 보안 감사 (OWASP Top 10) |
| `@genie:perf` | 성능 분석 및 최적화 |
| `@genie:refactor` | 리팩토링 및 죽은 코드 정리 |
| `@genie:simplify` | 코드 단순화 |
| `@genie:db` | DB 쿼리 최적화 / 스키마 설계 |
| `@genie:e2e` | E2E 테스트 (Playwright) |
| `@genie:docs` | 문서 업데이트 |

---

## 디렉토리 구조

```
AGENTS.md              — 에이전트 지침 (Claude Code + Codex 공용)
CLAUDE.md              — Claude Code 진입점 (@AGENTS.md 로드)
plugins/genie/
  .codex-plugin/       — 플러그인 메타데이터 (name: genie)
  commands/            — Claude Code 커맨드 정의 (/genie:*)
  agents/              — 전문 에이전트 정의 (@genie:ts, @genie:review 등)
  skills/              — 스킬 구현 로직
  scripts/hooks/       — 자동화 훅 (버전 자동 bump, 브랜치 보호 등)
rules/                 — 코딩 규칙 (설치 후 ~/.claude/rules/에 복사)
  common/              — 공통 규칙 (git, testing, security 등)
  typescript/          — TypeScript 전용 규칙
  python/              — Python 전용 규칙
  golang/              — Go 전용 규칙
  java/                — Java 전용 규칙
  kotlin/              — Kotlin 전용 규칙
  swift/               — Swift 전용 규칙
  web/                 — 웹 프론트엔드 전용 규칙
docs/                  — 워크플로우 산출물 (brainstorms, plans, reviews 등)
```
