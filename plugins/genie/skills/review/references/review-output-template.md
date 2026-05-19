# 코드 리뷰 출력 템플릿 (Code Review Output Template)

합성된 리뷰 결과물을 제시할 때 이 **정확한 형식**을 사용하십시오. 발견 사항은 심각도별 그룹화. 파이프 구분 마크다운 테이블 사용. 테이블 셀 내 리터럴 `|`는 `\|`로 이스케이프.

## 예시

```markdown
## Code Review Results

**Scope:** merge-base with the review base branch -> working tree (14 files, 342 lines)
**Intent:** Add order export endpoint with CSV and JSON format support
**Mode:** autofix

**Reviewers:** correctness, testing, maintainability, security, api-contract
- security -- new public endpoint accepts user-provided format parameter
- api-contract -- new /api/orders/export route with response schema

### P0 -- Critical

| # | File | Issue | Reviewer | Confidence | Route |
|---|------|-------|----------|------------|-------|
| 1 | `orders_controller.rb:42` | User-supplied ID in account lookup without ownership check | security | 100 | `gated_auto -> downstream-resolver` |

### P1 -- High

| # | File | Issue | Reviewer | Confidence | Route |
|---|------|-------|----------|------------|-------|
| 2 | `export_service.rb:87` | Loads all orders into memory -- unbounded for large accounts | performance | 100 | `safe_auto -> review-fixer` |
| 3 | `export_service.rb:91` | No pagination -- response size grows linearly with order count | api-contract, performance | 75 | `manual -> downstream-resolver` |

### P2 -- Moderate

| # | File | Issue | Reviewer | Confidence | Route |
|---|------|-------|----------|------------|-------|
| 4 | `export_service.rb:45` | Missing error handling for CSV serialization failure | correctness | 75 | `safe_auto -> review-fixer` |

### P3 -- Low

| # | File | Issue | Reviewer | Confidence | Route |
|---|------|-------|----------|------------|-------|
| 5 | `export_helper.rb:12` | Format detection could use early return instead of nested conditional | maintainability | 75 | `advisory -> human` |

### Applied Fixes

- `safe_auto`: Added bounded export pagination guard and CSV serialization failure test coverage in this run

### Residual Actionable Work

| # | File | Issue | Route | Next Step |
|---|------|-------|-------|-----------|
| 1 | `orders_controller.rb:42` | Ownership check missing on export lookup | `gated_auto -> downstream-resolver` | Defer via tracker |
| 3 | `export_service.rb:91` | Pagination contract needs a broader API decision | `manual -> downstream-resolver` | Defer via tracker |

### Pre-existing Issues

| # | File | Issue | Reviewer |
|---|------|-------|----------|
| 1 | `orders_controller.rb:12` | Broad rescue masking failed permission check | correctness |

### Coverage

- Suppressed: 2 findings below anchor 75
- Residual risks: No rate limiting on export endpoint
- Testing gaps: No test for concurrent export requests

---

> **Verdict:** Ready with fixes
>
> **Reasoning:** 1 critical auth bypass must be fixed.
>
> **Fix order:** P0 auth bypass -> P1 memory/pagination -> P2 error handling
```

## Interactive 모드 저장 경로

최종 보고서를 `docs/reviews/YYYY/MM/DD-<제목>.md`에 저장합니다.

```bash
mkdir -p docs/reviews/$(date +%Y/%m)
```

파일명 예시: `docs/reviews/2026/05/19-auth-middleware-refactor.md`

## 포맷 규칙

- **파이프 구분 테이블** — ASCII 박스 문자나 가로선 구분 금지 (판정 전 보고서 수준 `---`는 유지)
- **테이블 셀 내 `|` 이스케이프** — `\|`로 작성. 미이스케이프 파이프는 열을 손상시킴
- **심각도별 섹션** — `### P0 -- Critical`, `### P1 -- High`, `### P2 -- Moderate`, `### P3 -- Low`. 빈 섹션 생략.
- **안정적 순차 번호** — 정렬 후 한 번 할당. 심각도 섹션이 바뀌어도 계속. Residual에서 동일 번호 재사용.
- **Confidence 열** — 정수(`50`, `75`, `100`)로 표시. 부동소수점 금지.
- **Route 열** — `` `<autofix_class> -> <owner>` `` 형식.
- **Applied Fixes** — 수정 단계가 실행된 경우에만 포함.
- **Residual Actionable Work** — 미해결 실행 가능 발견 사항이 있을 때만 포함.
- **Pre-existing** — 별도 테이블, Confidence 열 제외.
- **Coverage** — 억제된 수, 잔존 리스크, 테스트 갭, 실패한 리뷰어 포함.
- **판정** — blockquote 형식. Verdict / Reasoning / Fix order 포함.

## Headless 모드 포맷

`mode:headless`에서는 파이프 테이블 대신 아래 구조화된 텍스트 엔벨로프를 사용합니다.

```
Code review complete (headless mode).

Scope: <scope-line>
Intent: <intent-summary>
Reviewers: <reviewer-list with conditional justifications>
Verdict: <Ready to merge | Ready with fixes | Not ready>
Artifact: /tmp/genie/review/<run-id>/

Applied N safe_auto fixes.

Gated-auto findings (concrete fix, changes behavior/contracts):

[P1][gated_auto -> downstream-resolver][needs-verification] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>
  Suggested fix: <suggested_fix or "none">
  Evidence: <evidence[0]>

Manual findings (actionable, needs handoff):

[P1][manual -> downstream-resolver] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>

Advisory findings (report-only):

[P2][advisory -> human] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>

Pre-existing issues:

[P2][gated_auto -> downstream-resolver] File: <file:line> -- <title> (<reviewer>, confidence <N>)
  Why: <why_it_matters>

Residual risks:
- <risk>

Learnings & Past Solutions:
- <learning>

Agent-Native Gaps:
- <gap description>

Schema Drift Check:
- <drift status>

Deployment Notes:
- <deployment note>

Testing gaps:
- <gap>

Coverage:
- Suppressed: <N> findings below anchor 75 (P0 at anchor 50+ retained)
- Mode-aware demotion suppressions: <N>
- Validator drops: <N> findings rejected by Stage 5b validator
  - <file:line> -- <reason>
- Validator over-budget drops: <N>
- Failed reviewers: <reviewer>

Review complete
```

**추가 포맷 규칙:**

- `[needs-verification]`은 `requires_verification: true`인 발견 사항에만 표시
- `owner: release` → Advisory 섹션에 포함
- `pre_existing: true` → Pre-existing 섹션에 포함
- 0개 항목 섹션 생략
- 모든 리뷰어 실패 시: `Code review degraded (headless mode). Reason: 0 of N reviewers returned results.` 후 "Review complete"
- `Why:`/`Evidence:` 상세 정보 → 결과물 파일에서 로드. `Suggested fix:` → 압축 반환값에서 직접. 매칭: `file + line_bucket(line,±3)`, 제목으로 타이브레이크. 일치 없으면 해당 줄 생략 후 Coverage에 기록
