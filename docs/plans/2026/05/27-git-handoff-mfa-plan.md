---
agent: genie:plan
date: 2026-05-27
input_tokens: 0
output_tokens: 0
---

# Git Handoff & MFA Plan

**Date**: 2026-05-27
**Origin**: `docs/brainstorms/2026/git-handoff-mfa-requirements.md`
**Status**: Ready for `/genie:work`

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D-1 | 핸드오프는 AGENTS.md 행동 규칙으로 구현 | 별도 훅·코드 없이 세션 전반에 즉시 적용. hooks.json 변경 불필요 |
| D-2 | credential-guard는 Write/Edit 두 도구 모두 차단 | 경로만 다르고 위협은 동일. 하나의 스크립트로 처리 |
| D-3 | credential-guard는 `bash-hook-dispatcher.js`와 분리된 별도 훅으로 등록 | Write/Edit은 Bash dispatcher 범위 밖. `hooks.json` + `install-hooks.js` 등록 |
| D-4 | genie:push MFA 로직은 기존 구현 유지, 파일 쓰기 여부만 검증 | SKILL.md 조사 결과 이미 get-session-token 흐름 구현됨 |
| D-5 | genie:commit에 CodeCommit 감지 + 자격증명 사전 확인 추가 | commit은 로컬 작업이지만, push 시 MFA 재입력 방지 위해 선확인 |
| D-6 | 임시 자격증명은 환경변수로만 전달, 파일 기록 금지 | R-12 ~ R-15 요구사항. 세션 종료 시 자동 소멸 보장 |

---

## Scope

**In**
- AGENTS.md 핸드오프 규칙 (commit/push 의도 감지 → 스킬 자동 실행)
- `pre-tool-credential-guard.js` 훅 신규 구현
- credential-guard를 `hooks.json` 및 `install-hooks.js`에 등록
- `genie:commit` SKILL.md Phase 0 추가 (CodeCommit MFA 사전 확인)
- `genie:push` SKILL.md 검증 (파일 쓰기 없음 확인 + R-12 명시)

**Out**
- SSH key passphrase 처리
- GitHub PAT / SSO / SAML 인증
- git hook(pre-commit/pre-push) 기반 구현
- Azure DevOps, GCP 등 다른 클라우드 provider

---

## Implementation Units

- U1. **AGENTS.md — 핸드오프 규칙 추가**
  - Files: `AGENTS.md`
  - Covers: R-1, R-2, R-3, R-4
  - 섹션 5 아래(브랜치 보호 규칙 다음)에 "Git 작업 핸드오프 규칙" 섹션 추가
  - commit 의도 키워드(`커밋해줘`, `commit 고` 등) → `genie:commit` 즉시 실행
  - push 의도 키워드(`푸시 고`, `push해줘` 등) → `genie:push` 즉시 실행
  - 이미 스킬이 실행 중인 경우 중복 호출 금지 명시
  - 의존성: 없음

- U2. **`pre-tool-credential-guard.js` 구현**
  - Files: `plugins/genie/scripts/hooks/pre-tool-credential-guard.js`
  - Covers: R-12, R-13, R-14, R-15
  - stdin JSON에서 `tool_input.file_path` 추출 (Write: `file_path`, Edit: `file_path`)
  - 아래 패턴과 일치하면 차단:
    ```
    ~/.aws/credentials, ~/.aws/config
    **/.env, **/.env.*, **/credentials, **/secrets
    **/*.pem, **/*.key, **/*.p12, **/*.pfx
    /tmp/**/*cred*, /tmp/**/*secret*, /tmp/**/*token*
    ```
  - 차단 시: `stderr`에 `[credential-guard] Write blocked: <path>` 출력, `exitCode: 2`
  - 통과 시: 입력 그대로 stdout 반환, `exitCode: 0`
  - 기존 `pre-bash-auto-version-bump.js` 구조 참고 (run() + module.exports + stdin 처리)
  - 의존성: 없음

- U3. **credential-guard 훅 등록**
  - Files: `plugins/genie/hooks/hooks.json`, `plugins/genie/scripts/install-hooks.js`
  - Covers: R-13
  - `hooks.json`에 Write / Edit 매처로 credential-guard 훅 항목 추가
  - `install-hooks.js`가 `~/.claude/settings.json`에 Write/Edit PreToolUse 훅을 등록하도록 수정
  - 기존 Bash 훅 등록 패턴 참고하여 동일 방식으로 추가
  - 의존성: U2

- U4. **`genie:commit` SKILL.md — MFA Phase 0 추가**
  - Files: `plugins/genie/skills/commit/SKILL.md`
  - Covers: R-5, R-6, R-7, R-8, R-9, R-10, R-11
  - 기존 Phase 1(컨텍스트 수집) 앞에 Phase 0 삽입:
    1. `git remote get-url origin`으로 remote URL 확인
    2. CodeCommit 패턴(`codecommit::` / `git-codecommit.*.amazonaws.com`) 감지
    3. 비-CodeCommit → Phase 0 스킵, Phase 1로 진행
    4. CodeCommit → `aws sts get-caller-identity` 유효성 확인
    5. 유효 → Phase 1로 진행
    6. 만료/실패 → MFA 코드 6자리 입력 요청 (AskUserQuestion)
    7. `aws iam list-mfa-devices`로 ARN 조회
    8. `aws sts get-session-token --serial-number <ARN> --token-code <code>` 실행
    9. 성공 → 환경변수(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) 설정 → Phase 1
    10. 실패 → 오류 메시지 출력 후 중단
  - **파일 기록 금지**: 자격증명을 어떤 파일에도 쓰지 않음을 Phase 0 주석으로 명시
  - 의존성: 없음 (U5와 독립)

- U5. **`genie:push` SKILL.md — R-12 ~ R-15 준수 검증**
  - Files: `plugins/genie/skills/push/SKILL.md`
  - Covers: R-12, R-14 (push 측)
  - 기존 MFA 로직에서 `~/.aws/credentials` 또는 파일 기록 여부 확인
  - 파일 기록이 있으면 환경변수 전달 방식으로 교체
  - "자격증명 파일 미기록" 제약을 SKILL.md에 명시적으로 문서화
  - 의존성: 없음 (U4와 독립)

---

## Test Scenarios

### U1 — 핸드오프

- "커밋해줘" 입력 시 `genie:commit` 스킬이 확인 없이 즉시 실행됨 (AE-1)
- "푸시 고" 입력 시 `genie:push` 스킬이 확인 없이 즉시 실행됨 (AE-2)
- `genie:commit` 이미 실행 중인 상태에서 "커밋해줘" 재입력 시 중복 호출 없음 (R-4)
- "git push 하면 어떻게 돼?" 처럼 commit/push 의도가 없는 질문 → 스킬 호출 없음 (R-1 경계)

### U2/U3 — credential-guard

- `~/.aws/credentials` Write 시도 → `[credential-guard] Write blocked` 출력, 파일 변경 없음 (AE-7)
- `.env` 파일 Edit 시도 → 동일하게 차단 (AE-8)
- `~/.aws/credentials` Read 시도 → 허용, 차단 없음 (AE-9)
- 일반 소스 파일(`.ts`, `.js`) Write 시도 → 허용
- `/tmp/some-token.txt` Write 시도 → 차단
- 패턴 미해당 경로 → passthrough, exitCode 0

### U4/U5 — MFA

- GitHub remote에서 commit/push → MFA 검사 없이 정상 진행 (AE-3)
- CodeCommit remote, 유효한 자격증명 → MFA 검사 통과, 진행 (AE-4)
- CodeCommit remote, 만료된 자격증명 → MFA 코드 입력창 표시 → 입력 후 진행 (AE-5)
- MFA 코드 오류 3회 → 오류 메시지 출력, 작업 중단 (AE-6)
- commit/push 후 `~/.aws/credentials` 파일 변경 없음 (AE-10)
- 세션 종료 후 환경변수 소멸 확인 (R-14)

---

## Risks & Dependencies

| Risk | Mitigation |
|------|-----------|
| Write/Edit 훅 등록 형식이 Bash와 다를 수 있음 | U3 구현 전 `install-hooks.js` 및 기존 Bash 훅 등록 방식 확인 |
| `genie:push` 기존 MFA 구현이 파일에 자격증명 기록할 수 있음 | U5에서 SKILL.md 전체 검토 후 파일 기록 있으면 수정 |
| credential-guard 패턴이 너무 좁거나 넓을 수 있음 | 초기 구현 후 `/tmp/test.env` 등 경계 케이스 테스트 |
| AGENTS.md 규칙이 Claude 모델 버전에 따라 일관성 없이 적용될 수 있음 | 핵심 워크플로우 섹션에 배치, 굵게 강조 |

---

## Build Order

```
U2 (guard 스크립트)
  └─ U3 (훅 등록)

U1 (AGENTS.md 규칙)          ← 독립 실행 가능

U4 (commit MFA)              ← 독립 실행 가능
U5 (push MFA 검증)           ← 독립 실행 가능
```

병렬 실행 가능: U1, U2→U3, U4, U5 순서 무관
