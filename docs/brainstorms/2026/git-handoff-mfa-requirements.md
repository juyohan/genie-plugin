---
agent: genie:brainstorm
date: 2026-05-27
input_tokens: 0
output_tokens: 0
---

# Git Handoff & MFA Requirements

**Date**: 2026-05-27
**Scope**: Standard
**Status**: Brainstorm complete → ready for `/genie:plan`

---

## Actors

| ID | Actor | Description |
|----|-------|-------------|
| A-1 | 개발자 | commit/push 의도를 자연어로 표현하는 사용자 |
| A-2 | Claude (AI) | 의도를 감지하고 스킬을 자동 실행하는 에이전트 |
| A-3 | AWS CodeCommit | MFA 자격증명이 필요한 git remote |

---

## Requirements

### 핸드오프 자동화

| ID | Requirement |
|----|-------------|
| R-1 | 사용자가 commit 의도를 표현하면(예: "커밋해줘", "commit 고", "커밋하자") A-2는 사용자 확인 없이 `genie:commit` 스킬을 즉시 실행한다 |
| R-2 | 사용자가 push 의도를 표현하면(예: "푸시 고", "push해줘") A-2는 사용자 확인 없이 `genie:push` 스킬을 즉시 실행한다 |
| R-3 | 핸드오프 규칙은 AGENTS.md에 명시되어 세션 전반에 걸쳐 일관되게 적용된다 |
| R-4 | 이미 `genie:commit` / `genie:push` 스킬이 로드되어 실행 중인 경우 중복 호출하지 않는다 |

### MFA 자격증명 확인

| ID | Requirement |
|----|-------------|
| R-5 | `genie:commit` / `genie:push` 스킬 실행 시, git remote URL이 AWS CodeCommit(`codecommit`)인지 확인한다 |
| R-6 | CodeCommit remote가 감지되면 `aws sts get-caller-identity`로 현재 자격증명 유효성을 검사한다 |
| R-7 | 자격증명이 유효하지 않거나 만료된 경우, 사용자에게 MFA 코드(6자리) 입력을 요청한다 |
| R-8 | MFA 코드 입력 시 `aws iam list-mfa-devices`로 디바이스 ARN을 자동 조회하고, `aws sts get-session-token`으로 임시 자격증명을 획득한다 |
| R-9 | 획득한 임시 자격증명을 현재 셸 환경(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`)에 적용 후 git 작업을 진행한다 |
| R-10 | MFA 코드가 틀리거나 자격증명 획득에 실패하면 오류 메시지를 출력하고 git 작업을 중단한다 |
| R-11 | remote가 AWS CodeCommit이 아닌 경우(GitHub 등) MFA 검사를 건너뛴다 |

### 자격증명 파일 보호 (CRITICAL)

| ID | Requirement |
|----|-------------|
| R-12 | 자격증명 관련 파일(`~/.aws/credentials`, `~/.aws/config`, `*.env`, `*.pem`, `*.key`, `/tmp/*cred*` 등)은 **읽기만 허용**하고 Write/Edit은 완전히 차단한다 |
| R-13 | 차단은 SKILL.md 규칙이 아닌 **PreToolUse 훅**으로 강제한다 — Claude의 판단과 무관하게 도구 호출 자체를 막는다 |
| R-14 | 자격증명은 오직 현재 명령 실행 컨텍스트의 환경변수로만 전달되며, 세션 종료 후 자동 소멸한다 |
| R-15 | 훅이 차단 시 `[credential-guard] Write blocked: <path>` 메시지를 stderr에 출력하고 exit 2를 반환한다 |

---

## Key Flows

### F-1: 자동 핸드오프 흐름

```
사용자: "커밋해줘" / "푸시 고"
  └─ A-2: commit/push 키워드 감지
        ├─ commit 의도 → Skill("genie:commit") 즉시 호출
        └─ push 의도 → Skill("genie:push") 즉시 호출
```

### F-2: MFA 자격증명 흐름 (CodeCommit 환경)

```
genie:commit 또는 genie:push 실행
  └─ remote URL 확인
        ├─ CodeCommit 아님 → 자격증명 검사 스킵 → 정상 진행
        └─ CodeCommit 확인
              └─ aws sts get-caller-identity 실행
                    ├─ 유효 → 정상 진행
                    └─ 만료/오류
                          └─ MFA 코드 입력 요청 (AskUserQuestion)
                                └─ aws iam list-mfa-devices → ARN 조회
                                      └─ aws sts get-session-token --token-code <code>
                                            ├─ 성공 → 환경변수 설정 → 정상 진행
                                            └─ 실패 → 오류 출력 후 중단
```

---

## Acceptance Examples

| ID | Scenario | Expected |
|----|----------|----------|
| AE-1 | 사용자가 "커밋해줘"라고 입력 | `genie:commit` 스킬이 확인 요청 없이 즉시 실행됨 |
| AE-2 | 사용자가 "푸시 고"라고 입력 | `genie:push` 스킬이 확인 요청 없이 즉시 실행됨 |
| AE-3 | GitHub remote에서 push | MFA 검사 없이 바로 push 진행 |
| AE-4 | CodeCommit remote, 유효한 자격증명 | MFA 검사 통과, push 진행 |
| AE-5 | CodeCommit remote, 만료된 자격증명 | MFA 코드 입력창 표시 → 입력 후 자격증명 갱신 → push 진행 |
| AE-6 | MFA 코드 오류 입력 | 오류 메시지 출력, push 중단 |
| AE-7 | Claude가 `~/.aws/credentials` Write 시도 | PreToolUse 훅이 도구 호출 차단, `[credential-guard] Write blocked` 출력 |
| AE-8 | Claude가 `.env` 파일 Edit 시도 | 동일하게 차단 |
| AE-9 | Claude가 `~/.aws/credentials` Read 시도 | 허용 (읽기는 가능) |
| AE-10 | 세션 종료 후 자격증명 조회 | 환경변수 소멸, 어떤 파일에도 자격증명 흔적 없음 |

---

## Implementation Approach

### 핸드오프: AGENTS.md 규칙 (권장)

AGENTS.md에 행동 규칙 추가. Claude Code가 세션 시작 시 로드하는 규칙이므로 별도 훅 불필요.

```markdown
## Git 작업 핸드오프 규칙
사용자가 commit 또는 push 의도를 표현하면:
- commit → Skill("genie:commit") 즉시 실행 (확인 요청 없이)
- push → Skill("genie:push") 즉시 실행 (확인 요청 없이)
```

### MFA: genie:commit / genie:push SKILL.md 내 credential check 단계 추가

각 스킬의 Phase 0(사전 확인)에 AWS CodeCommit 감지 + MFA 흐름 삽입.

### 자격증명 파일 보호: PreToolUse 훅 (`pre-tool-credential-guard.js`)

Write / Edit 도구 호출 시 경로를 검사해 자격증명 패턴과 일치하면 즉시 차단.
`bash-hook-dispatcher.js`에 등록하여 모든 genie 사용자에게 적용.

**차단 대상 패턴**:
```
~/.aws/credentials, ~/.aws/config
**/.env, **/.env.*, **/credentials, **/secrets
**/*.pem, **/*.key, **/*.p12, **/*.pfx
/tmp/**/*cred*, /tmp/**/*secret*, /tmp/**/*token*
```

---

## Out of Scope

- SSH key passphrase 처리
- GitHub PAT / SSO / SAML 인증
- git hook(pre-commit/pre-push) 기반 구현
- Azure DevOps, GCP Cloud Source 등 다른 클라우드 provider
