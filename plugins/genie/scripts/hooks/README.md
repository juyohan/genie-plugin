# Genie Hooks

훅은 파일 편집, 커밋, 세션 시작·종료 등 Claude Code의 주요 시점에 자동으로 실행되는 품질 자동화입니다. 별도 실행 없이 플러그인 설치 후 즉시 작동하며, 프로필 설정으로 활성화 수준을 조정할 수 있습니다.

---

## 프로필 선택 가이드

| 프로필 | 적합한 상황 | 설정 방법 |
|--------|------------|----------|
| `minimal` | 탐색적 작업, 빠른 실험, 잦은 인터럽트가 불필요할 때 | `GENIE_HOOK_PROFILE=minimal` |
| `standard` | 일반 개발 (기본값) | 별도 설정 불필요 |
| `strict` | PR 전 최종 검사, 팀 공유 브랜치 작업 | `GENIE_HOOK_PROFILE=strict` |

`~/.claude/settings.json`의 `env` 섹션에 추가합니다.

```json
{
  "env": {
    "GENIE_HOOK_PROFILE": "standard"
  }
}
```

특정 훅만 개별 비활성화하려면:

```json
"GENIE_DISABLED_HOOKS": "pre:bash:git-push-reminder,pre:bash:commit-quality"
```

---

## 훅 전체 목록

| 훅 ID | 실행 시점 | 프로필 | 설명 |
|-------|---------|--------|------|
| `pre:bash:block-no-verify` | Bash 실행 전 | minimal+ | `--no-verify` 플래그 사용 차단 |
| `pre:bash:branch-guard` | Bash 실행 전 | minimal+ | 보호 브랜치(main·master·develop·staging) commit·push 차단 |
| `pre:credential-guard` | 파일 저장 전 | minimal+ | AWS 키·토큰 등 자격증명 파일 저장 방지 |
| `session:start` | 세션 시작 시 | minimal+ | 이전 세션 컨텍스트·진행 중 태스크 자동 로드 |
| `session:end` | 세션 종료 시 | minimal+ | 세션 요약 저장 (다음 세션 재개용) |
| `stop:cost-tracker` | 세션 종료 시 | minimal+ | 이번 세션 API 사용 비용 기록 |
| `pre:config-protection` | 파일 저장 전 | standard+ | 설정 파일 실수 수정 방지 |
| `pre:edit:gateguard` | 파일 편집 전 | standard+ | 사실 기반 편집 강제 (근거 없는 변경 차단) |
| `post:quality-gate` | 파일 편집 후 | standard+ | 포매터 자동 실행 (Biome·Prettier·gofmt·black 자동 감지) |
| `post:context-monitor` | 도구 실행 후 | standard+ | 컨텍스트 사용량 모니터링 및 경고 |
| `post:accumulate` | 파일 편집 후 | standard+ | 편집 파일 누적 (세션 종료 시 타입 체크에 사용) |
| `post:bash:build-complete` | Bash 실행 후 | standard+ | 빌드 완료 감지 및 데스크탑 알림 |
| `post:bash:pr-created` | Bash 실행 후 | standard+ | PR 생성 감지 및 데스크탑 알림 |
| `stop:format-typecheck` | 세션 종료 시 | standard+ | 이번 세션에서 편집한 TS 파일만 타입 체크 |
| `stop:check-console-log` | 세션 종료 시 | standard+ | console.log 잔존 경고 |
| `stop:evaluate-session` | 세션 종료 시 | standard+ | 세션 품질 평가 및 요약 |
| `stop:desktop-notify` | 세션 종료 시 | standard+ | 세션 완료 데스크탑 알림 (macOS·WSL) |
| `post:design-quality` | 파일 편집 후 | strict | 설계 품질 검사 (응집도·결합도 분석) |

> `minimal+`은 minimal, standard, strict 모두에서 활성화됨을 의미합니다.
> `standard+`는 standard, strict에서 활성화됩니다.

---

## 환경변수

### 훅 프로파일

| 변수 | 기본값 | 설명 |
|---|---|---|
| `GENIE_HOOK_PROFILE` | `standard` | 훅 활성화 수준. `minimal` · `standard` · `strict` |
| `GENIE_DISABLED_HOOKS` | (없음) | 개별 비활성화할 훅 ID 목록 (쉼표 구분) |

### 세션 관련

| 변수 | 기본값 | 설명 |
|---|---|---|
| `GENIE_SESSION_START_CONTEXT` | `on` | `off` 으로 설정 시 세션 시작 컨텍스트 주입 전체 비활성화 |
| `GENIE_SESSION_START_MAX_CHARS` | `8000` | 세션 시작 시 주입할 최대 문자 수. `0` 으로 설정 시 비활성화 |
| `GENIE_SESSION_RETENTION_DAYS` | `7` | 세션 파일 보존 기간 (일). 이 기간이 지난 파일은 자동 삭제 |

> **참고**: 세션 재개 프롬프트의 감지 범위(기본 6시간)와 최대 컨텍스트 크기(기본 2000자)는 현재 환경변수로 제어할 수 없습니다. 조정이 필요하면 `session-start.js` 상단의 `RESUME_WINDOW_MS`, `RESUME_MAX_CHARS` 상수를 직접 수정하십시오.

### GateGuard

| 변수 | 기본값 | 설명 |
|---|---|---|
| `GENIE_GATEGUARD` | (활성) | `off` · `false` · `0` · `disabled` 으로 설정 시 비활성화 |
| `GATEGUARD_DISABLED` | (활성) | `1` 로 설정 시 비활성화 (`GENIE_GATEGUARD` 와 동일 효과) |

### Quality Gate

| 변수 | 기본값 | 설명 |
|---|---|---|
| `GENIE_QUALITY_GATE_FIX` | `true` | `false` 로 설정 시 편집 후 자동 수정 비활성화 |
| `GENIE_QUALITY_GATE_STRICT` | (비활성) | `true` 로 설정 시 품질 검사 실패 시 경고를 stderr 에 출력 |
