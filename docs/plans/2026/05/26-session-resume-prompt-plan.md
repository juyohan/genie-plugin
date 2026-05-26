---
agent: genie:plan
date: 2026-05-26
input_tokens: 0
output_tokens: 0
---

# Session Resume Prompt — 구현 계획

**작성일**: 2026-05-26
**출처**: `docs/brainstorms/2026/session-resume-prompt-requirements.md`
**상태**: Ready for implementation

---

## 요약

SessionStart 시 같은 프로젝트 디렉토리의 최근 6시간 이내 JSONL 세션을 감지하고,
Claude가 사용자에게 이어서 할지 물어보도록 컨텍스트를 주입한다.

---

## 핵심 결정사항

| 결정 | 내용 | 이유 |
|---|---|---|
| 데이터 소스 | `~/.claude/projects/<escaped-cwd>/` JSONL | 자동 저장, 별도 스킬 불필요 |
| 프롬프트 방식 | stdout 컨텍스트 주입으로 Claude가 사용자에게 질문 | SessionStart hook은 interactive stdin 불가 |
| 구현 위치 | `session-start.js` 내부에 함수 추가 | 기존 컨텍스트 주입 파이프라인 활용 |
| 시간 기준 | JSONL 파일의 mtime 기준 6시간 이내 | 현재 세션 JSONL은 계속 갱신되므로 mtime 신뢰 가능 |
| 경과 시간 표시 | 분 단위, 60분 이상이면 시간 단위 | 사용자 가독성 |

---

## 범위

**포함**
- 같은 디렉토리 + 6시간 이내 조건의 JSONL 탐색
- 가장 최근 세션 1개만 처리
- Claude에게 이어서 할지 묻도록 컨텍스트 주입
- JSONL에서 마지막 교환 추출 및 요약 포함
- 모든 오류는 조용히 무시 (세션 시작 차단 금지)

**제외**
- 다른 디렉토리 세션 탐색
- 세션 목록 선택 UI
- AI 요약 생성
- `/save-session` 스킬 동작 변경

---

## 구현 단위

### U1. JSONL 세션 스캐너

**파일**: `plugins/genie/scripts/hooks/session-start.js`

**역할**: `~/.claude/projects/` 하위에서 현재 cwd에 대응하는 디렉토리를 찾고,
6시간 이내 수정된 JSONL 파일 중 가장 최근 것을 반환한다.

**결정**:
- cwd → escaped 경로 변환: `/` → `-`, 선행 `-` 제거
- 현재 세션 JSONL은 제외 (환경변수 `CLAUDE_TRANSCRIPT_PATH` 또는 stdin의 `session_id`로 식별)
- 파일이 없거나 디렉토리가 없으면 `null` 반환

**테스트 시나리오**:
- 같은 디렉토리, 3시간 전 JSONL → 반환
- 같은 디렉토리, 7시간 전 JSONL → null
- 다른 디렉토리 JSONL만 존재 → null
- 현재 세션 JSONL만 존재 → null
- `.claude/projects/<cwd>/` 디렉토리 없음 → null (오류 없이)

---

### U2. JSONL 컨텍스트 추출기

**파일**: `plugins/genie/scripts/hooks/session-start.js`

**역할**: JSONL 파일에서 마지막 N개의 사용자-어시스턴트 교환을 읽어
컨텍스트 문자열로 포맷한다.

**결정**:
- 마지막 5개 사용자 메시지 + 대응 어시스턴트 응답 첫 200자 추출
- 파싱 실패 라인은 조용히 스킵
- 최대 2000자로 잘라냄 (기존 `DEFAULT_SESSION_START_CONTEXT_MAX_CHARS` 내에서 소비)
- 결과가 비어있으면 `null` 반환

**테스트 시나리오**:
- 정상 JSONL → 마지막 교환 추출 성공
- 빈 JSONL → null
- 손상된 JSONL (파싱 불가) → null (오류 없이)
- 교환 5개 미만 → 있는 것만 반환

---

### U3. 세션 재개 프롬프트 주입

**파일**: `plugins/genie/scripts/hooks/session-start.js`

**역할**: U1, U2 결과를 받아 Claude가 사용자에게 재개 여부를 물어보도록
컨텍스트 블록을 구성하고 기존 stdout 주입 파이프라인에 prepend한다.

**결정**:
- 경과 시간 계산: `(now - mtime) / 60000` → 분, 60 이상이면 시간 표시
- 주입 형식:
  ```
  [이전 세션 감지] N분 전 같은 프로젝트에서 작업한 세션이 있습니다.
  아래 내용을 참고하여 사용자에게 이어서 할지 물어보세요.
  "Yes"이면 이 내용을 컨텍스트로 활용하고, "No"이면 무시하세요.
  
  --- 이전 세션 ---
  <U2 추출 내용>
  ---
  ```
- 기존 세션 요약 주입 앞에 prepend (우선순위 높게)
- `GENIE_SESSION_START_CONTEXT=off` 이면 이 기능도 비활성화

**테스트 시나리오**:
- U1 null → 아무것도 추가하지 않음 (기존 동작 유지)
- U2 null → 경과 시간 메시지만 표시, 내용 없이
- 정상 케이스 → 프롬프트 블록이 기존 컨텍스트 앞에 위치
- `GENIE_SESSION_START_CONTEXT=off` → 주입 없음
- 경과 59분 → "59분 전" 표시
- 경과 90분 → "1시간 30분 전" 표시

---

## 의존성 순서

```
U1 (스캐너) → U2 (추출기) → U3 (주입) → 기존 session-start.js 파이프라인
```

U1, U2는 순수 함수로 독립 테스트 가능. U3은 U1, U2에 의존.

---

## 위험 요소

| 위험 | 가능성 | 완화 |
|---|---|---|
| cwd → escaped 경로 변환 불일치 | 중간 | 실제 디렉토리 목록과 비교하는 fallback 추가 고려 |
| 현재 세션 JSONL을 이전 세션으로 오인 | 낮음 | `CLAUDE_TRANSCRIPT_PATH`로 식별 후 제외 |
| JSONL 파싱으로 세션 시작 지연 | 낮음 | 최대 2000자 제한, 파싱 실패 시 즉시 반환 |
| 기존 컨텍스트 주입과 충돌 | 낮음 | prepend 방식으로 기존 파이프라인 구조 유지 |

---

## 참조

- R-1 ~ R-6: `docs/brainstorms/2026/session-resume-prompt-requirements.md`
- 기존 컨텍스트 주입: `session-start.js` `DEFAULT_SESSION_START_CONTEXT_MAX_CHARS`
- JSONL 파싱 패턴: `session-end.js` `extractSessionSummary()`
