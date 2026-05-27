---
name: push
description: 현재 브랜치를 원격 저장소에 푸시합니다. AWS CodeCommit 저장소를 자동으로 감지하여 자격증명이 유효하면 바로 푸시하고, 만료됐거나 없으면 MFA 코드를 요청한 뒤 임시 자격증명으로 푸시합니다. 사용자가 "푸시해줘", "push해줘", "올려줘"라고 말하거나, PR 없이 단순 push만 원할 때 사용합니다.
allowed-tools: []
---
> **Base guidelines**: [SKILL.md](../SKILL.md) applies to this skill.

# 스마트 푸시 (Smart Push)

AWS CodeCommit과 일반 저장소(GitHub 등)를 자동으로 구분하여 최적의 방식으로 push합니다.

> **⚠ 자격증명 파일 기록 금지**: 임시 자격증명(`AccessKeyId`, `SecretAccessKey`, `SessionToken`)을 `~/.aws/credentials`, `~/.aws/config`, `.env`, 임시 파일 등 **어떤 파일에도 쓰지 않습니다.** 환경변수(`AWS_ACCESS_KEY_ID` 등)로만 전달하며, 세션 종료 시 자동 소멸합니다.

**사용자에게 확인이 필요한 경우** `AskUserQuestion` 도구를 사용하십시오 (스키마 미로드 시 `ToolSearch`로 `select:AskUserQuestion` 먼저 호출).

---

## 워크플로우

### 단계 1: 원격 URL 감지

```bash
git remote get-url origin
```

URL 패턴으로 저장소 종류를 판별합니다:

| 패턴 | 종류 |
|------|------|
| `codecommit::` 시작 | CodeCommit (GRC 형식) |
| `git-codecommit.*.amazonaws.com` 포함 | CodeCommit (HTTPS 형식) |
| 그 외 | 일반 저장소 |

**일반 저장소인 경우**: 바로 `git push -u origin HEAD` 실행 후 단계 5로 이동.

### 단계 2: AWS CLI 확인 (CodeCommit만 해당)

```bash
aws --version
```

- 성공: 다음 단계 진행
- 실패 (`aws` 명령 없음): 아래 메시지 출력 후 종료
  > "AWS CLI가 설치되어 있지 않습니다. CodeCommit push를 위해 AWS CLI를 먼저 설치해 주세요."

### 단계 3: 프로파일 확인

- **GRC 형식** (`codecommit::region://profile@repo-name`): URL에서 `@` 앞 부분을 profile로 파싱
  - `@`가 없으면 파싱 실패 → `AskUserQuestion`으로 프로파일 이름 질문
- **HTTPS 형식**: `AskUserQuestion`으로 사용자에게 AWS 프로파일 이름 질문

프로파일을 입력받은 경우 존재 여부 확인:
```bash
aws configure list --profile <profile>
```
실패 시: *"프로파일 `<profile>`을 찾을 수 없습니다. 다시 입력해주세요."* 후 재질문 (최대 3회).

### 단계 4: 자격증명 유효성 확인

```bash
aws sts get-caller-identity --profile <profile>
```

- **성공 (exit 0)**: 현재 자격증명 유효 → `git push -u origin HEAD` 실행 후 단계 5로 이동
- **실패**: 자격증명 만료 또는 없음 → 단계 4-A (MFA 흐름) 진행

#### 단계 4-A: MFA 설정 확인

```bash
aws configure get mfa_serial --profile <profile>
```

- **빈 값 반환**: MFA 미설정 프로파일
  > "프로파일 `<profile>`에 mfa_serial이 설정되어 있지 않습니다. AWS 설정을 확인해 주세요 (`~/.aws/config`)."
  > 중단.
- **값 있음**: 다음 단계 진행

#### 단계 4-B: MFA 코드 요청 (최대 3회 재시도)

`AskUserQuestion`으로 MFA 코드 요청:
> "MFA 코드를 입력해주세요. (profile: `<profile>`)"

다음 명령 실행:

```bash
# role_arn이 있는 경우 (먼저 확인)
ROLE_ARN=$(aws configure get role_arn --profile <profile>)
```

`role_arn` **있는 경우** (역할 위임):
```bash
aws sts assume-role \
  --role-arn <role_arn> \
  --role-session-name "push-$(date +%s)" \
  --serial-number <mfa_serial> \
  --token-code <mfa_code> \
  --output json
```

`role_arn` **없는 경우** (세션 토큰):
```bash
aws sts get-session-token \
  --serial-number <mfa_serial> \
  --token-code <mfa_code> \
  --output json
```

**STS 호출 실패 시** (잘못된 MFA 코드 등):
- 시도 횟수 < 3: *"MFA 인증에 실패했습니다. 코드를 다시 입력해주세요. (남은 시도: N회)"* → 단계 4-B 반복
- 시도 횟수 = 3: *"MFA 인증에 3회 실패했습니다. push를 중단합니다."* 후 종료

**성공 시**: JSON 응답에서 자격증명 추출:
- `Credentials.AccessKeyId` → `ACCESS_KEY`
- `Credentials.SecretAccessKey` → `SECRET_KEY`
- `Credentials.SessionToken` → `SESSION_TOKEN`

#### 단계 4-C: 임시 자격증명으로 push

```bash
AWS_ACCESS_KEY_ID=<ACCESS_KEY> \
AWS_SECRET_ACCESS_KEY=<SECRET_KEY> \
AWS_SESSION_TOKEN=<SESSION_TOKEN> \
  git push -u origin HEAD
```

> 자격증명은 이 명령어 실행 중에만 환경 변수로 존재하며, 파일로 저장하지 않습니다.

### 단계 5: 결과 보고

- **성공**: 푸시된 브랜치 이름과 원격 URL 출력
- **실패**: 에러 메시지와 원인 설명
