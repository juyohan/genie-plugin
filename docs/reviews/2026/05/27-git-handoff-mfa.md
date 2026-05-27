---
date: 2026-05-27
branch: feat/session-resume-prompt
plan: docs/plans/2026/05/27-git-handoff-mfa-plan.md
verdict: ready-to-merge
passes: 2
---

# 코드 리뷰 — git-handoff-mfa

**범위**: `feat/session-resume-prompt` 미커밋 변경 사항 (U1–U5)  
**의도**: commit/push 자동 핸드오프 규칙, 자격증명 파일 쓰기 차단 훅, CodeCommit MFA 플로우  
**모드**: Interactive (2-pass)  
**리뷰어**: correctness · security · maintainability

---

## Pass 1 — 적용된 수정 사항

| 심각도 | 건수 | 수정 내용 |
|--------|------|-----------|
| P0 | 3건 | hooks.json 24개 훅 회귀 복구, `process.exitCode` → `process.exit(2)`, catch fail-secure |
| P1 | 5건 | MultiEdit 매처 추가, symlink 해석, `path.resolve`, 자격증명 패턴 확장, dangling symlink |
| P2 | 4건 | AGENTS.md 우선순위 명시, 중복 패턴 제거, tmp 경계, stderr 정제 |

## Pass 2 — 적용된 수정 사항

| 심각도 | 건수 | 수정 내용 |
|--------|------|-----------|
| P0 | 1건 | MultiEdit `edits[]` 배열 스키마 미처리 — `extractFilePaths()` 추가 |
| P1 | 1건 | 비문자열 `file_path` 타입 체크 미비 (`isBlocked` 진입 시 `typeof` 검사 추가) |
| P1 | 1건 | SSH `.pub` 공개 키 false positive — `(?!.*\.pub$)` lookahead 추가 |
| P2 | 1건 | `/tmp/secret_key` 미탐지 — tmp 패턴을 알파벳 경계(`(?<![a-z])..(?![a-z])`)로 교체 |

---

## 최종 상태

### 검증된 패턴 (20/20 케이스 통과)

| 경로 | 결과 |
|------|------|
| `~/.aws/credentials` | ✅ 차단 |
| `~/.aws/config` | ✅ 차단 |
| `/home/user/.env`, `/project/.env.production` | ✅ 차단 |
| `/tmp/credentials.txt`, `/tmp/cred-temp.json`, `/tmp/secret_key` | ✅ 차단 |
| `~/.ssh/id_rsa`, `~/.ssh/id_ed25519` | ✅ 차단 |
| `~/.ssh/id_rsa.pub` | ✅ 허용 (공개 키) |
| `~/.kube/config`, `~/.docker/config.json` | ✅ 차단 |
| `/tmp/secretary_notes.txt`, `/project/src/config.ts` | ✅ 허용 |
| MultiEdit `edits[].file_path`에 `~/.aws/credentials` 포함 | ✅ 차단 |

### 등록된 훅 (settings.json 확인 완료)

```
genie:pre:write:credential-guard     → Write
genie:pre:edit:credential-guard      → Edit
genie:pre:multiedit:credential-guard → MultiEdit
```

---

## 잔여 권고 사항 (P3 advisory — 미수정)

| 항목 | 내용 |
|------|------|
| MFA 흐름 중복 | `commit/SKILL.md` + `push/SKILL.md` 공유 참조 문서화 권장 |
| 추가 패턴 | `~/.netrc`, GCP ADC, Azure 토큰 등 위협 모델에 따라 선택적 추가 |
| 테스트 파일 | `__tests__/pre-tool-credential-guard.test.js` 작성 권장 |

---

## 요구사항 완료 여부

| U-ID | 제목 | 상태 |
|------|------|------|
| U1 | AGENTS.md Section 6 핸드오프 규칙 | ✅ |
| U2 | pre-tool-credential-guard.js | ✅ |
| U3 | hooks.json 등록 + install-hooks.js | ✅ |
| U4 | commit/SKILL.md Phase 0 MFA | ✅ |
| U5 | push/SKILL.md R-12 | ✅ |

---

## 평결

**✅ Ready to merge** — P0/P1/P2 이슈 전부 수정 완료. 20/20 테스트 통과.

---

## 전달 컨텍스트

- **계획 요약**: git commit/push 자동 핸드오프 + 자격증명 파일 쓰기 차단 훅 (Write/Edit/MultiEdit) + CodeCommit MFA 지원
- **주요 결정**: credential guard는 환경변수만 허용, 어떤 파일에도 자격증명 기록 금지; SSH 공개키(.pub)는 허용
- **테스트 노트**: `isBlocked()` + `extractFilePaths()` 20케이스 통과. 단위 테스트 파일(`__tests__/`) 미작성
- **운영 검증**: `node install-hooks.js` → settings.json 3개 훅 정상 등록 확인
- **수락된 잔여 사항**: MFA 흐름 중복(P3), 추가 자격증명 패턴(P3)
