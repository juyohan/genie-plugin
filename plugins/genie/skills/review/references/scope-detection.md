# 범위 감지 명령어 (Scope Detection Commands)

Stage 1에서 사용하는 git 명령어 레퍼런스입니다.

## base: 인자 제공 시 (빠른 경로)

```bash
BASE_ARG="{base_arg}"
BASE=$(git merge-base HEAD "$BASE_ARG" 2>/dev/null) || BASE="$BASE_ARG"
```

```bash
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```

`base:`를 PR 번호/브랜치 대상과 함께 사용 금지 — 에러 출력 후 중단.

## PR 번호 또는 GitHub URL 제공 시

`mode:report-only`/`mode:headless`에서 공유 체크아웃의 `gh pr checkout` 금지.

```bash
gh pr view <number-or-url> --json state,title,body,files
```

- `state`가 `CLOSED`/`MERGED` → 중단
- lock파일/버전 업데이트 전용 사소한 PR → 중단 (Draft는 정상 리뷰)

```bash
git status --porcelain
gh pr checkout <number-or-url>
```

PR 메타데이터 수집:

```bash
gh pr view <number-or-url> --json title,body,baseRefName,headRefName,url,reviews,comments \
  --jq '{title, body, baseRefName, headRefName, url,
    hasPriorComments: ((.reviews | map(select(.state != "APPROVED" or .body != "")) | length) > 0
      or (.comments | length) > 0)}'
```

PR 베이스 브랜치 대비 로컬 diff:

```bash
PR_BASE_REMOTE=$(git remote -v | awk 'index($2, "github.com:<base-repo>") || index($2, "github.com/<base-repo>") {print $1; exit}')
if [ -n "$PR_BASE_REMOTE" ]; then PR_BASE_REMOTE_REF="$PR_BASE_REMOTE/<base>"; else PR_BASE_REMOTE_REF=""; fi
PR_BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE_REF" 2>/dev/null || git rev-parse --verify <base> 2>/dev/null || true)
if [ -z "$PR_BASE_REF" ]; then
  if [ -n "$PR_BASE_REMOTE_REF" ]; then
    git fetch --no-tags "$PR_BASE_REMOTE" <base>:refs/remotes/"$PR_BASE_REMOTE"/<base> 2>/dev/null \
      || git fetch --no-tags "$PR_BASE_REMOTE" <base> 2>/dev/null || true
    PR_BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE_REF" 2>/dev/null || git rev-parse --verify <base> 2>/dev/null || true)
  else
    if git fetch --no-tags https://github.com/<base-repo>.git <base> 2>/dev/null; then
      PR_BASE_REF=$(git rev-parse --verify FETCH_HEAD 2>/dev/null || true)
    fi
    if [ -z "$PR_BASE_REF" ]; then PR_BASE_REF=$(git rev-parse --verify <base> 2>/dev/null || true); fi
  fi
fi
if [ -n "$PR_BASE_REF" ]; then
  BASE=$(git merge-base HEAD "$PR_BASE_REF" 2>/dev/null) || BASE=""
else
  BASE=""
fi
```

```bash
if [ -n "$BASE" ]; then
  echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE \
    && echo "DIFF:" && git diff -U10 $BASE \
    && echo "UNTRACKED:" && git ls-files --others --exclude-standard
else
  echo "ERROR: Unable to resolve PR base branch <base> locally."
fi
```

base ref 확인 실패 시 `git diff HEAD` 폴백 금지 — 중단.

## 브랜치 이름 제공 시

`mode:report-only`/`mode:headless`에서 공유 체크아웃의 `git checkout <branch>` 금지.

```bash
git status --porcelain
git checkout <branch>
```

```bash
RESOLVE_OUT=$(bash scripts/resolve-base.sh) || { echo "ERROR: resolve-base.sh failed"; exit 1; }
if [ -z "$RESOLVE_OUT" ] || echo "$RESOLVE_OUT" | grep -q '^ERROR:'; then
  echo "${RESOLVE_OUT:-ERROR: resolve-base.sh produced no output}"; exit 1
fi
BASE=$(echo "$RESOLVE_OUT" | sed 's/^BASE://')
```

```bash
echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE \
  && echo "DIFF:" && git diff -U10 $BASE \
  && echo "UNTRACKED:" && git ls-files --others --exclude-standard
```

에러 시 `git diff HEAD` 폴백 금지 — 중단. `gh pr view`로 PR 메타데이터 조회 (없으면 `hasPriorComments=false`).

## 인자 없음 (현재 브랜치)

브랜치 모드와 동일한 `scripts/resolve-base.sh`로 BASE 결정 후 diff 생성. 에러 시 중단.

## 추적되지 않은 파일 처리

`UNTRACKED:` 목록이 비어있지 않으면 제외된 파일 알림. 검토 필요 파일이 있으면 `git add` 후 재실행 요청. `mode:headless`/`mode:autofix`에서는 추적된 변경 사항으로만 진행, Coverage에 기록.
