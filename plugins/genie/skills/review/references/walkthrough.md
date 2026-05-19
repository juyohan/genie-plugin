# 발견 사항별 워크스루 (Per-finding Walk-through)

Interactive 모드 전용. 사용자가 라우팅 질문에서 옵션 A를 선택하면 진입.

---

## 진입 (Entry)

오케스트레이터로부터 수신:
- 심각도 순서(P0 → P1 → P2 → P3)로 정렬된 `gated_auto` 및 `manual` 발견 사항 목록
- tracker-defer 튜플 (`{ tracker_name, confidence, named_sink_available, any_sink_available }`)
- 아티팩트 조회를 위한 실행 ID

---

## 발견 사항별 프레젠테이션

각 발견 사항은 **터미널 출력 블록** + 플랫폼 **차단 질문 도구**(`AskUserQuestion`) 순서로 제시. 두 부분을 절대 합치지 마십시오.

`AskUserQuestion`이 미로드 상태면 `ToolSearch`로 즉시 로드. 차단 도구가 없을 때만 번호 목록 폴백.

### 터미널 출력 블록

```
## Finding {N} of {M} — {severity} {plain-English title}

{file}:{line}

**What's wrong**

{why_it_matters — /tmp/genie/review/{run_id}/{reviewer_name}.json에서 조회}

**Proposed fix**

{suggested_fix — 효과를 설명하는 의도 중심 산문}

**Why it works**

{코드베이스 패턴에 근거한 짧은 추론}

{R15 conflict context line, 해당하는 경우}
```

`suggested_fix` 렌더링 규칙:
- 기본값: 효과를 설명하는 한 문장 (의도 중심 언어, 코드 스팬 문장당 최대 2개)
- 백틱 스팬 앞뒤 공백 필수
- 5줄 이하 순수 추가 코드는 raw 코드 블록 허용
- diff 블록 금지
- 포착 불가 시: 한 문장 변환 설명 + `Full fix: /tmp/genie/review/{run_id}/{reviewer_name}.json → findings[].suggested_fix`

아티팩트 매치 없으면: 제목 + `suggested_fix`만 렌더링 (`What's wrong`, `Why it works` 생략). 완료 보고서 Coverage에 공백 기록.

### 질문 줄기

```
Finding {N} of {M} — {severity} {short handle}.
{Action framing in a phrase}?
```

질문 줄기에 대안 열거 금지 — 옵션 목록에 포함. 의견 불일치는 R15 conflict context line에 표시.

### 확인 메시지

각 응답 후 한 줄: `→ Applied.`, `→ Deferred. Ticket filed: <url>.`, `→ Skipped.`, `→ Acknowledged.`

---

## 옵션 (순서 고정)

```
1. Apply the proposed fix
2. Defer — file a [TRACKER] ticket
3. Skip — don't apply, don't track
4. Auto-resolve with best judgment on the rest
```

`[TRACKER]` 렌더링: `confidence = high` + `named_sink_available = true` → 구체적 트래커 이름. `any_sink_available = true` (단, confidence 낮거나 named_sink 없음) → `Defer — file a ticket`.

타이브레이크 권장 사항을 `(recommended)` 로 표시 (필수).

### 적응형 조정 (Adaptations)

- **`suggested_fix` 없음:** 옵션 1(`Apply`) 생략. 메뉴 3개: Defer / Skip / Auto-resolve.
- **권고 전용 발견 사항:** 옵션 1 → `Acknowledge — mark as reviewed`.
- **N=1:** `Finding N of M` 헤더 생략, 옵션 4(`Auto-resolve`) 억제. 메뉴 3개.
- **Sink 없음 (`any_sink_available: false`):** 옵션 2(`Defer`) 생략. 질문 줄기 뒤 트래커 없음 한 줄 추가. Defer 권장 → Skip 재매핑, R15 conflict context line에 표시.
- **N=1 + Sink 없음:** 메뉴 2개: Apply / Skip (또는 Acknowledge / Skip).

---

## 발견 사항별 라우팅

- **Apply** — 메모리 내 Apply 세트에 추가. 워크스루 종료 시 일괄 실행.
- **Acknowledge** (권고 변형) — 결정 목록에 기록. 부수 효과 없음.
- **Defer** — tracker-defer 프로토콜 실행. 성공 시 트래커 URL 기록.
- **Skip** — 결정 목록에 Skip 기록. 부수 효과 없음.
- **Auto-resolve** — 루프 종료. (Apply 세트 ∪ 미결정 발견 사항)에 수정자 즉시 실행. `failed` 버킷 비어있으면 완료 보고서 즉시 출력. 비어있지 않으면 file tickets / walk through / ignore 질문 한 번.

---

## 재정의 규칙

워크스루는 결정 루프이지 페어 프로그래밍 표면이 아님. 커스텀 수정 인라인 작성 불가 — 수정 변형을 원하면 Skip 후 흐름 외부에서 직접 수정.

---

## 상태 (State)

메모리 내만 유지: Apply 세트, 결정 목록, 현재 위치. 중단 시 모든 메모리 내 상태 소실. 이미 실행된 Defer 작업은 외부 부수 효과 — 되돌릴 수 없음.

---

## 워크스루 종료 시 실행

Auto-resolve 조기 종료 경로는 해당 섹션 참조. 루프 완수 경로:

1. **Apply 세트** — 전체 Apply 세트에 대해 수정자 서브 에이전트 한 번 실행.
2. **Defer 세트** — 워크스루 중 이미 인라인 실행됨. 추가 작업 없음.
3. **Skip / Acknowledge** — 아무 작업도 없음.

---

## 통합 완료 보고서

모든 Interactive 모드 터미널 경로(워크스루 완수, Auto-resolve 중단, 최상위 최선 판단, 최상위 티켓 생성, 발견 사항 0개)에서 동일한 구조 출력.

### 최소 필수 필드
- 발견 사항별 항목: 제목, 심각도, 조치 (Applied / Deferred / Skipped / Acknowledged). Deferred는 트래커 URL, Skipped는 한 줄 사유 포함.
- 조치별 요약 카운트 (예: `4 applied, 2 deferred, 2 skipped`)
- 실패 내용 (발견 사항 목록 위에 표시)
- 리뷰 종료 판정 (Ready to merge / Ready with fixes / Not ready)

### Coverage 섹션
억제된 발견 사항 수, 잔존 리스크, 테스트 갭, 실패한 리뷰어, 프레이밍 강화 공백(아티팩트 매치 없었던 발견 사항 수 + 해당 페르소나 이름).

### 보고서 순서
실패 → 조치 버킷별 발견 사항 → 요약 카운트 → Coverage → 판정.

### 발견 사항 0개 특수 케이스
라우팅 질문 건너뛰고 요약 카운트 + 판정만 출력. 권고/기존 이슈 발견 사항이 남은 경우 조건부 표현 사용.

---

## 실행 자세

운영상 읽기 전용. 허용된 쓰기 작업: 메모리 내 Apply 세트/결정 목록, 트래커 지연 실행(외부 티켓). 파일 수정은 워크스루 종료 시 수정자 실행 시점만.
