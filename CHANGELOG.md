# Changelog

All notable changes to the `genie-plugin` project will be documented in this file.

## [2.4.1] - 2026-05-19

### Changed
- docs(work): 커밋·푸시 자동 실행 제거 및 프론트엔드 테스트 예외 추가
- refactor: rewrite review SKILL.md in karpathy style with CE removal

## [2.4.0] - 2026-05-18

### Added
- feat: auto loop back to plan when P0/P1 findings remain after review

### Fixed
- fix: detect BREAKING CHANGE in commit body for major version bump
- fix: register auto-version-bump hook in bash-hook-dispatcher

## [2.3.0] - 2026-05-18

### Added
- feat: add doc-frontmatter hook to prepend agent/token metadata to docs/*.md

### Fixed
- fix: remove explicit hooks path from plugin.json for Codex auto-discovery
- fix: remove description/id fields from hook entries for Codex compatibility
- fix: resolve invalid JSON in hooks.json (trailing comma after Stop array)
- fix: make hooks.json Codex-compatible
- fix: correct .claude-plugin/marketplace.json source format and sync to 1.8.0
- fix: remove $schema from hooks.json so Codex can parse plugin hooks
- fix: sync .claude-plugin/plugin.json version to 1.8.0 and fix hooks path

### Changed
- refactor: move hooks.json into hooks/ directory
- refactor: replace ECC_ env vars and branding with GENIE_ in hook scripts
- chore: sync .claude-plugin version to 2.1.0 (align with .codex-plugin)

## [1.7.0] - 2026-05-15

### Added
- feat: add .agents/plugins/marketplace.json for Codex plugin support

## [1.6.0] - 2026-05-15

### Added
- **Codex 마켓플레이스 지원** (`.agents/plugins/marketplace.json`): `codex plugin marketplace add juyohan/genie-plugin`으로 설치 가능

### Changed
- **README 설치 섹션 정리**: Claude Code·Codex 설치 순서를 비교 표로 통일

## [1.5.1] - 2026-05-15

### Changed
- docs: remove redundant Codex usage guide from README

## [1.5.0] - 2026-05-15

### Added
- feat: rename to genie-plugin v1.4.0 with Codex support and branch protection
- feat: add auto version bump hook on git push

### Fixed
- fix: resolve auto-version-bump hook issues (stdio isolation, BREAKING CHANGE detection)

### Changed
- docs: add auto-version-bump brainstorm, plan, and review artifacts

## [1.4.0] - 2026-05-15

### Added
- **브랜치 보호 규칙** (`AGENTS.md`): `main`·`master`·`develop`·`staging` 브랜치에서 작업 시 자동 차단 및 별도 브랜치 생성 요구 — 예외 없음, 매 요청마다 적용
- **Codex 지원** (`README.md`): Codex 2단계 설치 가이드, 스킬 호출 방법, 플랫폼별 차이표, 워크플로우 예시 추가

### Changed
- **네임스페이스 통합 완료** (`commands/`, `skills/`): 모든 `ce-*` 참조를 `genie:*`로 일괄 정리 (회색지대 포함 — 임시 경로, 스크립트 주석, YAML 스키마 주석)
- **레포지토리 이름 변경**: `john-plugin` → `genie-plugin` (README, CHANGELOG, marketplace.json, rules 파일 반영)
- **`skills/commit/SKILL.md` 개선**: 플랫폼 질문 도구 섹션 추출(DRY), 보호 브랜치 목록에 `develop`·`staging` 추가
- **README.md 전면 재작성**: 현재 상태 기준 설치·워크플로우·에이전트·Codex 가이드 포함

## [1.3.1] - 2026-05-14

### Changed
- **TDD SKILL.md 리팩토링** (`skills/tdd/SKILL.md`): 412줄 → 112줄로 축약, Mock 위주에서 실 의존성 기반 통합 테스트 우선으로 무게중심 이동

### Fixed
- **커버리지 임계값 누락 수정** (`skills/tdd/SKILL.md`): `coverageThresholds`에 `"statements": 80` 추가

## [1.3.0] - 2026-05-13

### Changed
- **Genie Skills 구조 리팩토링**: brainstorm, plan, review, work SKILL.md를 간결하게 재작성, 현재 사용 에이전트 기준으로 정렬
- **Stage Boundary 규칙 추가** (`CLAUDE.md`): 각 `/genie:*` 단계 완료 후 자동으로 다음 단계로 넘어가지 않도록 명시적 정지 규칙 추가
- **불필요한 참조 파일 제거**: handoff, requirements-capture, synthesis-summary, universal-planning 등 10개 레퍼런스 파일 삭제
- **Korean translation**: 모든 skills SKILL.md 한국어 번역 완료
- **새 참조 파일 추가** (`skills/brainstorm/references/deep-product.md`): 제품 중심 브레인스토밍 심화 워크플로우

## [1.0.1] - 2026-05-12

### Fixed
- **Plugin Schema Validation Errors (`plugin.json`)**: 
  - **`author` field**: Changed from a string (`"John"`) to the required object format (`{"name": "John"}`).
  - **`agents` field**: Removed the `agents` array from `plugin.json`. Claude Code's schema does not support this field and relies on auto-discovery from the `agents/` directory instead.
  - **`commands` & `skills` fields**: Modified to use directory paths (`["./commands/"]`, `["./skills/"]`) instead of explicit external file paths, which the validator rejects.
- **Auto-discovery Setup**: Created `commands/` and `skills/` directories and populated them with symbolic links pointing to the respective files in the `compound-engineering-plugin` and `everything-claude-code` repositories to ensure Claude Code automatically discovers them without violating schema rules.
- **Marketplace Configuration**: Created `.claude-plugin/marketplace.json` to properly register the repository as a valid marketplace and moved `plugin.json` into the `.claude-plugin` directory. Fixed a naming mismatch where the marketplace referred to the plugin as `john` instead of `genie-plugin`.
- **Documentation**: Updated `AGENTS.md` and `README.md` to correct the `ce-brainstorm` reference (from agent to command) and provided clear manual steps for copying rules, as plugins cannot auto-distribute them.

## [1.0.0] - 2026-05-12

### Added
- Initial release of John Engineering OS.
- Integrated Compound Engineering (CE) workflows (Brainstorm, Plan, Work, Compound).
- Integrated Everything Claude Code (ECC) tools and agents (Planner, TDD-Guide, Architect, Security-Reviewer).
- Added specialized support for Java/Spring Boot, Vue/Nuxt, TypeScript/JavaScript, and Database patterns (JPA, MySQL, PostgreSQL, Redis).
