# Genie Hooks — 환경변수 설정

훅 동작을 조정하려면 `~/.claude/settings.json` 의 `env` 섹션에 추가하십시오.

```json
{
  "env": {
    "GENIE_HOOK_PROFILE": "standard",
    "GENIE_SESSION_START_CONTEXT": "on"
  }
}
```

---

## 훅 프로파일

| 변수 | 기본값 | 설명 |
|---|---|---|
| `GENIE_HOOK_PROFILE` | `standard` | 훅 활성화 수준. `minimal` · `standard` · `strict` |

- **minimal** — 필수 보호 훅만 (block-no-verify, branch-guard)
- **standard** — 일반 개발 워크플로우 훅 포함 (기본값)
- **strict** — 모든 훅 활성화 (비용 추적, 설계 품질 검사 등)

특정 훅을 개별 비활성화하려면:

```json
"GENIE_DISABLED_HOOKS": "pre:bash:git-push-reminder,pre:bash:commit-quality"
```

---

## 세션 관련

| 변수 | 기본값 | 설명 |
|---|---|---|
| `GENIE_SESSION_START_CONTEXT` | `on` | `off` 으로 설정 시 세션 시작 시 컨텍스트 주입 전체 비활성화 |
| `GENIE_SESSION_START_MAX_CHARS` | `8000` | 세션 시작 시 주입할 최대 문자 수. `0` 으로 설정 시 비활성화 |
| `GENIE_SESSION_RETENTION_DAYS` | `7` | 세션 파일 보존 기간 (일). 이 기간이 지난 파일은 자동 삭제 |

> **참고**: 세션 재개 프롬프트의 감지 범위(기본 6시간)와 최대 컨텍스트 크기(기본 2000자)는 현재 환경변수로 제어할 수 없습니다. 조정이 필요하면 `session-start.js` 상단의 `RESUME_WINDOW_MS`, `RESUME_MAX_CHARS` 상수를 직접 수정하십시오.

---

## GateGuard

| 변수 | 기본값 | 설명 |
|---|---|---|
| `GENIE_GATEGUARD` | (활성) | `off` · `false` · `0` · `disabled` 으로 설정 시 비활성화 |
| `GATEGUARD_DISABLED` | (활성) | `1` 로 설정 시 비활성화 (`GENIE_GATEGUARD` 와 동일 효과) |

---

## Quality Gate

| 변수 | 기본값 | 설명 |
|---|---|---|
| `GENIE_QUALITY_GATE_FIX` | `true` | `false` 로 설정 시 편집 후 자동 수정 비활성화 |
| `GENIE_QUALITY_GATE_STRICT` | (비활성) | `true` 로 설정 시 품질 검사 실패 시 경고를 stderr 에 출력 |
