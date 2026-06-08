---
name: commit
description: 명확하고 가치 중심적인 메시지와 함께 Git 커밋을 생성합니다. 사용자가 "커밋해줘", "이거 커밋해줘", "내 변경 사항 저장해줘", "커밋 생성해줘"라고 말하거나, 스테이징된 작업 또는 스테이징되지 않은 작업을 커밋하고 싶어 할 때 사용합니다. 저장소 컨벤션이 존재하면 그에 따르고, 그렇지 않으면 기본적으로 Conventional Commit 형식을 따르는 잘 구성된 커밋 메시지를 생성합니다.
allowed-tools:
  - gem
---
> **Base guidelines**: [SKILL.md](../SKILL.md) applies to this skill.


# Git 커밋 (Git Commit)

## 다중 에이전트 협업 (Multi-Agent Collaboration)

사용자의 입력(`$ARGUMENTS`) 내에 `--add <ai-이름>` 형태의 플래그가 포함되어 있는지 확인하십시오. 
현재 지원되는 외부 AI 인터페이스는 `--add gemini` (또는 `--add gem`)입니다.

만약 해당 플래그가 감지되면, 작업을 단독으로 확정하지 말고 다음 절차를 따르십시오:
1. **의도 파악:** 플래그를 제외한 나머지 문자열을 실제 지시사항으로 간주합니다.
2. **초안 작성:** 본인(주 에이전트)의 지식과 코드베이스 컨텍스트를 바탕으로 작업의 초기 뼈대나 접근법을 생각합니다.
3. **MCP 협업 호출:** `gem` 도구를 호출하여 외부 Gemini 에이전트에게 조언이나 검토를 구합니다.
   - 호출 시 전달할 메시지 예시: "나는 현재 이 작업에 대한 초안을 세우고 있어. 내 초안은 [초안 요약]이야. 이 접근 방식의 기술적 타당성을 검토하고 누락된 에지 케이스나 더 나은 패턴을 조언해줄 수 있어?"
4. **결과 통합:** `gem` 도구가 반환한 피드백을 당신의 최종 결과물에 통합(Synthesis)합니다. 
5. **명시적 표시:** 최종 산출물의 상단 또는 설명 부분에 "이 결과물은 Gemini와의 협업을 통해 검토 및 보완되었습니다."라는 문구를 추가하십시오.

이 협업 절차를 염두에 두고 아래의 본래 스킬 워크플로우를 진행하십시오.


현재 작업 트리의 변경 사항으로부터 잘 구성된 단일 Git 커밋을 생성합니다.

## 컨텍스트 (Context)

**Claude Code 이외의 플랫폼**에서는 아래의 "컨텍스트 폴백(Context fallback)" 섹션으로 넘어가서 해당 명령어를 실행하여 컨텍스트를 수집하십시오.

**Claude Code**에서는 아래의 5개 섹션(Git 상태, 작업 트리 차이, 현재 브랜치, 최근 커밋, 원격 기본 브랜치)에 데이터가 미리 채워져 있습니다. 이 스킬 전반에서 이를 직접 사용하십시오. 명령어를 다시 실행하지 마십시오.

**Git 상태 (Git status):**
!`git status`

**작업 트리 차이 (Working tree diff):**
!`git diff HEAD`

**현재 브랜치 (Current branch):**
!`git branch --show-current`

**최근 커밋 (Recent commits):**
!`git log --oneline -10`

**원격 기본 브랜치 (Remote default branch):**
!`git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo '__DEFAULT_BRANCH_UNRESOLVED__'`

### 컨텍스트 폴백 (Context fallback)

**Claude Code에서는 이 섹션을 건너뛰십시오. 위의 데이터를 이미 사용할 수 있습니다.**

다음 단일 명령어를 실행하여 모든 컨텍스트를 수집하십시오:

```bash
printf '=== STATUS ===\n'; git status; printf '\n=== DIFF ===\n'; git diff HEAD; printf '\n=== BRANCH ===\n'; git branch --show-current; printf '\n=== LOG ===\n'; git log --oneline -10; printf '\n=== DEFAULT_BRANCH ===\n'; git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo '__DEFAULT_BRANCH_UNRESOLVED__'
```

---

## 워크플로우

### 플랫폼 질문 도구 (Platform Question Tool)

사용자에게 질문할 때는 플랫폼의 질문 도구를 사용하십시오: Claude Code의 `AskUserQuestion` (스키마가 로드되지 않은 경우 `ToolSearch`로 `select:AskUserQuestion` 먼저 호출), Codex의 `request_user_input`, Gemini의 `ask_user`, Pi의 `ask_user` (`pi-ask-user` 확장 필요). 도구가 없거나 오류가 발생하는 경우에만 채팅 창에 옵션을 제시하십시오. 질문을 소리 없이 건너뛰지 마십시오.

### 단계 0: 자격증명 사전 확인 (CodeCommit만 해당)

```bash
git remote get-url origin 2>/dev/null
```

URL 패턴으로 저장소 종류를 판별합니다:
- `codecommit::` 시작 또는 `git-codecommit.*.amazonaws.com` 포함 → CodeCommit
- 그 외 → 이 단계를 건너뛰고 단계 1로 진행

**CodeCommit인 경우** 자격증명 유효성을 확인합니다:

```bash
aws sts get-caller-identity --profile <profile> 2>/dev/null
```

- **성공 (exit 0)**: 자격증명 유효 → 단계 1로 진행
- **실패**: 만료 또는 없음 → 아래 MFA 흐름 진행

#### MFA 갱신 흐름

1. `AskUserQuestion`으로 MFA 코드(6자리) 입력 요청
2. `aws iam list-mfa-devices --profile <profile>`로 디바이스 ARN 조회
3. `role_arn` 유무에 따라 STS 호출:
   - `role_arn` 있음: `aws sts assume-role --role-arn <arn> --serial-number <mfa_serial> --token-code <code>`
   - 없음: `aws sts get-session-token --serial-number <mfa_serial> --token-code <code>`
4. **성공**: 아래와 같이 환경변수로만 전달 (파일 기록 절대 금지)
   ```bash
   export AWS_ACCESS_KEY_ID=<AccessKeyId>
   export AWS_SECRET_ACCESS_KEY=<SecretAccessKey>
   export AWS_SESSION_TOKEN=<SessionToken>
   ```
   → 단계 1로 진행
5. **실패**: 오류 메시지 출력 후 중단 (최대 3회 재시도)

> **⚠ 자격증명 파일 기록 금지**: `~/.aws/credentials`, `~/.aws/config` 등 어떤 파일에도 자격증명을 쓰지 않습니다. 환경변수는 세션 종료 시 자동 소멸합니다.

### 단계 1: 컨텍스트 수집

위의 컨텍스트(Git 상태, 작업 트리 차이, 현재 브랜치, 최근 커밋, 원격 기본 브랜치)를 사용합니다. 이 단계에 필요한 모든 데이터는 이미 준비되어 있으므로 명령어를 다시 실행하지 마십시오.

원격 기본 브랜치 값은 `origin/main`과 같은 형식으로 반환됩니다. `origin/` 접두사를 제거하여 브랜치 이름을 얻으십시오. 만약 `__DEFAULT_BRANCH_UNRESOLVED__`가 반환되거나 `HEAD`만 있다면 다음을 시도하십시오:

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
```

둘 다 실패하면 `main`을 기본값으로 사용합니다.

위의 컨텍스트에서 Git 상태가 깨끗하다면 (스테이징된 파일, 수정된 파일 또는 추적되지 않은 파일이 없음), 커밋할 것이 없음을 보고하고 중단합니다.

현재 브랜치가 비어 있다면 저장소가 detached HEAD 상태입니다. 사용자가 이 작업을 브랜치에 연결하고 싶어 한다면 커밋하기 전에 브랜치가 필요함을 설명하십시오. 지금 기능 브랜치(feature branch)를 만들지 물어봅니다 (→ 플랫폼 질문 도구 참고).

- 사용자가 브랜치 생성을 선택하면 변경 내용에서 이름을 유도한 뒤, 플랫폼 질문 도구로 확인합니다: "브랜치 이름을 `<이름>`으로 생성할까요? (네 / 다른 이름 입력)". 확인 후 `git checkout -b <branch-name>`으로 생성하고, `git branch --show-current`를 다시 실행하여 워크플로우의 나머지 단계에서 현재 브랜치 이름으로 사용합니다.
- 사용자가 거절하면 detached HEAD 상태로 커밋을 진행합니다.

### 단계 2: 커밋 메시지 컨벤션 결정

다음 우선순위를 따릅니다:

1. **이미 컨텍스트에 있는 저장소 컨벤션** -- 프로젝트 지침(AGENTS.md, CLAUDE.md 등)이 이미 로드되어 있고 커밋 메시지 컨벤션이 명시되어 있다면 그에 따릅니다. 세션 시작 시 로드되므로 다시 읽지 마십시오.
2. **최근 커밋 히스토리** -- 명시적인 컨벤션이 문서화되어 있지 않다면, 단계 1에서 얻은 최근 10개 커밋을 확인합니다. 명확한 패턴(예: Conventional Commits, 티켓 접두사, 이모지 접두사 등)이 나타나면 그 패턴에 맞춥니다.
3. **기본값: Conventional Commits** -- 어떤 소스에서도 패턴을 찾을 수 없다면 Conventional Commit 형식을 사용합니다: `type(scope): description`. 여기서 type은 `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `style`, `build` 중 하나입니다.

Conventional Commits를 사용할 때는 변경 사항을 가장 정확하게 설명하는 타입(위의 타입 목록 중 하나)을 선택하십시오. `fix:`와 `feat:`가 모두 적절해 보인다면 `fix:`를 기본으로 합니다. 깨지거나 누락된 동작을 바로잡는 변경은 코드를 추가하여 구현하더라도 `fix:`입니다. `feat:`는 사용자가 이전에는 할 수 없었던 새로운 역량을 위해 아껴두십시오. 다른 타입들이 더 적절하다면 그것을 우선적으로 사용하십시오. 사용자가 특정 변경에 대해 오버라이드할 수 있습니다.

### 단계 3: 논리적 커밋 고려

모든 것을 한꺼번에 스테이징하기 전에, 변경된 파일들에서 서로 다른 관심사를 스캔합니다. 수정된 파일들이 명확히 분리된 논리적 변경 그룹으로 나뉜다면(예: 한 디렉토리의 리팩토링과 다른 디렉토리의 새로운 기능, 또는 소스 파일과 관련 없는 다른 변경의 테스트 파일 등), 각 그룹에 대해 별도의 커밋을 생성합니다.

이 과정은 가볍게 진행합니다:
- **파일 수준에서만** 그룹화하십시오 -- `git add -p`를 사용하거나 파일 내의 덩어리(hunk)를 쪼개려 하지 마십시오.
- 분리가 명확하다면(다른 기능, 관련 없는 수정) 나누십시오. 모호하다면 하나의 커밋으로도 충분합니다.
- 2~3개의 논리적 커밋이 적당합니다. 너무 많은 작은 커밋으로 쪼개지 마십시오.

그룹 분할이 결정된 경우, 단계 4 진입 전에 계획을 출력하고 플랫폼 질문 도구로 확인합니다:
"다음 N개 커밋으로 나눕니다: [그룹 1 파일 목록 + 예상 제목], [그룹 2 파일 목록 + 예상 제목]. 이 계획으로 진행할까요? (네 / 단일 커밋으로 합치기)"

### 단계 4: 스테이징 및 커밋

현재 브랜치가 `main`, `master`, `develop`, `staging` 또는 단계 1에서 확인된 기본 브랜치인 경우, 사용자에게 경고하고 여기서 계속 커밋할지 아니면 기능 브랜치를 먼저 만들지 물어봅니다 (→ 플랫폼 질문 도구 참고). 사용자가 브랜치 생성을 선택하면 변경 내용에서 이름을 유도한 뒤, 플랫폼 질문 도구로 확인합니다: "브랜치 이름을 `<이름>`으로 생성할까요? (네 / 다른 이름 입력)". 확인 후 `git checkout -b <branch-name>`으로 생성하고 계속 진행합니다.

커밋 메시지 작성:
- **제목 줄(Subject line)**: 간결하게, 명령형으로, "무엇"이 아닌 "왜"에 집중하여 작성합니다. 단계 2에서 결정된 컨벤션을 따릅니다.
- **본문(Body)**: 사소하지 않은 변경의 경우 빈 줄 하나를 띄우고 본문을 추가합니다. 동기, 트레이드오프 또는 미래의 읽는 이가 필요로 할 내용을 설명합니다. 명확한 단일 목적의 변경이라면 본문을 생략합니다.

커밋 실행 전, 생성한 메시지를 출력하고 플랫폼 질문 도구로 확인합니다:
"이 메시지로 커밋할까요? (네 / 메시지 수정 / 취소)"
확인 후 각 커밋 그룹에 대해 한 번의 호출로 스테이징과 커밋을 수행합니다. 실수로 민감한 파일(.env, 자격 증명)이나 관련 없는 변경 사항이 포함되지 않도록 `git add -A`나 `git add .`보다는 특정 파일 이름을 명시하여 스테이징하는 것을 선호하십시오. 포맷 유지를 위해 heredoc을 사용하십시오:

```bash
git add file1 file2 file3 && git commit -m "$(cat <<'EOF'
type(scope): 여기에 제목 줄 작성

이 변경이 왜 이루어졌는지 설명하는 선택적 본문.
단순히 무엇이 변했는지만 적지 마십시오.
EOF
)"
```

### 단계 5: 확인

커밋 후 `git status`를 실행하여 성공적으로 처리되었는지 확인합니다. 커밋 해시(hash)와 제목 줄을 보고합니다.

### 단계 6: 핸드오프

커밋 성공 후 자동 진행하지 않습니다. 사용자에게 아래를 안내하고 대기합니다:

```
커밋 완료: <해시> <제목>
푸시할 준비가 되면 /genie:push 를 실행하세요.
```

사용자가 push 의도를 표현하면 (`푸시 고`, `push해줘`, `올려줘` 등) `Skill("genie:push")`로 즉시 핸드오프합니다.
