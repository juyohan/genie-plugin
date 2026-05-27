#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-}"
SESSION_NAME="${TMUX_WORKSPACE_SESSION:-${SESSION_NAME:-}}"
WINDOW_NAME="${CLAUDE_TEAM_WINDOW:-agents}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
PROFILE="orchestrator"
SPAWN_ROLE=""
LEADER_MODEL="inherit"
AGENTS_DIR="${CLAUDE_AGENTS_DIR:-${HOME}/.claude/agents}"
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DISCOVERY_ROOTS="${PROJECT_DISCOVERY_ROOTS:-/Users/conan/genieService:/Users/conan/genesisMusic}"
COMMON_DISCOVERY_PROMPT=""

usage() {
  cat <<'EOF'
Usage:
  ./bin/harness-claude-team.sh [--session <name>] [--window <name>] [--project <path>] [--profile <name>] [--spawn <role>] [--leader-model <inherit|opus>] [--reset]

Profiles:
  orchestrator   리더 1개만 실행하고, 서브 에이전트는 필요 시 --spawn으로 추가
  legacy         예시용 4-pane (leader/backend/frontend/test) 실행

Roles for --spawn:
  refactoring
  qa
  voc
  new-development
  feature-enhancement
  incident-performance
EOF
}

# 하네스 오케스트레이터 리더를 어떤 에이전트 정의로 띄울지 결정한다.
# 기본은 기존 team-lead, 필요 시 team-lead-opus 를 선택할 수 있게 한다.
resolve_leader_agent_name() {
  case "$LEADER_MODEL" in
    inherit) printf '%s' 'team-lead' ;;
    opus) printf '%s' 'team-lead-opus' ;;
    *)
      printf '[harness-team] Unsupported leader model: %s\n' "$LEADER_MODEL" >&2
      exit 1
      ;;
  esac
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '[harness-team] Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

detect_session() {
  if [ -n "${SESSION_NAME}" ]; then
    return
  fi

  if [ -n "${TMUX:-}" ]; then
    SESSION_NAME="$(tmux display-message -p '#S')"
    return
  fi

  printf '[harness-team] No tmux session detected. Pass --session <name> or run from inside tmux.\n' >&2
  exit 1
}

role_to_agent_name() {
  case "$1" in
    refactoring) printf '%s' 'refactoring-specialist' ;;
    qa) printf '%s' 'qa-specialist' ;;
    voc) printf '%s' 'voc-specialist' ;;
    new-development) printf '%s' 'new-development-specialist' ;;
    feature-enhancement) printf '%s' 'feature-enhancement-specialist' ;;
    incident-performance) printf '%s' 'incident-performance-specialist' ;;
    team-lead|leader) printf '%s' 'team-lead' ;;
    *) return 1 ;;
  esac
}

require_arg_value() {
  local flag="$1"
  local value="${2:-}"

  if [ -z "$value" ] || [[ "$value" == --* ]]; then
    printf '[harness-team] %s requires a value\n' "$flag" >&2
    exit 1
  fi
}

# proj 예약어에서 사용하는 기본 프로젝트 루트를 팀/하네스 에이전트가 공통으로 참고하게 한다.
build_common_discovery_prompt() {
  printf '%s' "현재 디렉터리에 분석 대상 코드가 없으면 사용자에게 바로 경로를 다시 묻지 말고, 먼저 PROJECT_DISCOVERY_ROOTS 환경변수에 들어 있는 공식 프로젝트 루트 안에서 관련 디렉터리를 자동 탐색하라. proj 예약어 범위 밖은 탐색하지 말고, 후보가 하나로 명확하면 그 경로를 기준으로 진행하라. 공식 프로젝트 루트: ${PROJECT_DISCOVERY_ROOTS}"
}

# 여러 경로를 ':' 로 묶어 하네스 scope 환경변수에 전달한다.
join_colon_paths() {
  local result=""
  local path=""

  for path in "$@"; do
    [ -n "$path" ] || continue
    if [ -d "$path" ]; then
      if [ -n "$result" ]; then
        result="${result}:"
      fi
      result="${result}${path}"
    fi
  done

  printf '%s' "$result"
}

# 역할별로 기본 수정 가능 범위를 좁혀 하네스가 edit/write 시점에 검사할 수 있게 한다.
role_to_scope_prefixes() {
  case "$1" in
    team-lead)
      printf '%s' ""
      ;;
    qa-specialist)
      join_colon_paths \
        "$PROJECT_ROOT/tests" \
        "$PROJECT_ROOT/test" \
        "$PROJECT_ROOT/spec" \
        "$PROJECT_ROOT/docs"
      ;;
    voc-specialist)
      join_colon_paths \
        "$PROJECT_ROOT/docs"
      ;;
    incident-performance-specialist)
      join_colon_paths \
        "$PROJECT_ROOT/tests" \
        "$PROJECT_ROOT/test" \
        "$PROJECT_ROOT/spec" \
        "$PROJECT_ROOT/docs"
      ;;
    *)
      printf '%s' "$PROJECT_ROOT"
      ;;
  esac
}

ensure_agent_available() {
  local agent_name="$1"
  local matched_file

  matched_file="$(find "$AGENTS_DIR" -maxdepth 1 -type f -name '*.md' -exec grep -lE "^name:[[:space:]]*${agent_name}$" {} + 2>/dev/null | head -n 1)"

  if [ -n "$matched_file" ]; then
    return
  fi

  printf '[harness-team] Missing Claude agent definition for name: %s\n' "$agent_name" >&2
  printf '[harness-team] Available agent names:\n' >&2
  find "$AGENTS_DIR" -maxdepth 1 -type f -name '*.md' -exec sed -n 's/^name:[[:space:]]*//p' {} \; | sort >&2 || true
  exit 1
}

detect_project_root() {
  if [ -n "${PROJECT_ROOT:-}" ] && [ -d "${PROJECT_ROOT:-}" ]; then
    PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
    return
  fi

  PROJECT_ROOT="$(tmux show-options -t "$SESSION_NAME" -qv @workspace_active_dir 2>/dev/null || true)"

  if [ -z "$PROJECT_ROOT" ]; then
    PROJECT_ROOT="$(tmux show-options -t "$SESSION_NAME" -qv @workspace_project_root 2>/dev/null || true)"
  fi

  if [ -z "$PROJECT_ROOT" ] || [ ! -d "$PROJECT_ROOT" ]; then
    printf '[harness-team] Could not determine a valid project directory for session %s\n' "$SESSION_NAME" >&2
    exit 1
  fi

  PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
  COMMON_DISCOVERY_PROMPT="$(build_common_discovery_prompt)"
}

# agent 정의를 사용하는 실행 경로에 하네스 환경변수를 주입한다.
# HARNESS_ENABLED=1 이 있어야 settings.json 의 전역 hook가 실제 하네스 로직을 탄다.
launch_agent() {
  local pane="$1"
  local title="$2"
  local session_name="$3"
  local agent_name="$4"
  local kickoff_prompt="$5"
  local quoted_project_root
  local quoted_kickoff
  local quoted_session_name
  local quoted_agent_name
  local quoted_scope_prefixes
  local quoted_discovery_roots
  local quoted_common_prompt
  local quoted_auto_inject_handoff
  local harness_scope_prefixes
  local harness_auto_inject_handoff
  local shell_command

  ensure_agent_available "$agent_name"

  quoted_project_root="$(printf '%q' "$PROJECT_ROOT")"
  quoted_kickoff="$(printf '%q' "$kickoff_prompt")"
  quoted_session_name="$(printf '%q' "$session_name")"
  quoted_agent_name="$(printf '%q' "$agent_name")"
  harness_scope_prefixes="$(role_to_scope_prefixes "$agent_name")"
  harness_auto_inject_handoff="${HARNESS_AUTO_INJECT_HANDOFF:-1}"
  quoted_scope_prefixes="$(printf '%q' "$harness_scope_prefixes")"
  quoted_discovery_roots="$(printf '%q' "$PROJECT_DISCOVERY_ROOTS")"
  quoted_common_prompt="$(printf '%q' "$COMMON_DISCOVERY_PROMPT")"
  quoted_auto_inject_handoff="$(printf '%q' "$harness_auto_inject_handoff")"
  shell_command="cd ${quoted_project_root} && export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 && export HARNESS_ENABLED=1 && export HARNESS_AGENT_ROLE=${quoted_agent_name} && export HARNESS_PROJECT_ROOT=${quoted_project_root} && export HARNESS_SCOPE_PREFIXES=${quoted_scope_prefixes} && export HARNESS_AUTO_INJECT_HANDOFF=${quoted_auto_inject_handoff} && export HARNESS_LOG_DIR=$(printf '%q' "${SCRIPT_ROOT}/../logs/harness") && export PROJECT_DISCOVERY_ROOTS=${quoted_discovery_roots} && exec ${CLAUDE_BIN} -n ${quoted_session_name} --append-system-prompt ${quoted_common_prompt} --teammate-mode tmux --agent ${quoted_agent_name} ${quoted_kickoff}"

  tmux select-pane -t "$pane" -T "$title"
  tmux respawn-pane -k -t "$pane" "bash -lc $(printf '%q' "$shell_command")"
}

# append-system-prompt 기반 예시 세션에도 동일한 하네스 환경변수를 전달한다.
# legacy 예시 창에서도 하네스 동작 여부를 동일한 게이트로 통제한다.
launch_prompt_session() {
  local pane="$1"
  local title="$2"
  local session_name="$3"
  local role_prompt="$4"
  local kickoff_prompt="$5"
  local quoted_project_root
  local quoted_role
  local quoted_kickoff
  local quoted_session_name
  local quoted_scope_prefixes
  local quoted_discovery_roots
  local quoted_common_prompt
  local harness_scope_prefixes
  local shell_command

  quoted_project_root="$(printf '%q' "$PROJECT_ROOT")"
  quoted_role="$(printf '%q' "$role_prompt")"
  quoted_kickoff="$(printf '%q' "$kickoff_prompt")"
  quoted_session_name="$(printf '%q' "$session_name")"
  harness_scope_prefixes="$(role_to_scope_prefixes "$title")"
  quoted_scope_prefixes="$(printf '%q' "$harness_scope_prefixes")"
  quoted_discovery_roots="$(printf '%q' "$PROJECT_DISCOVERY_ROOTS")"
  quoted_common_prompt="$(printf '%q' "$COMMON_DISCOVERY_PROMPT")"
  shell_command="cd ${quoted_project_root} && export HARNESS_ENABLED=1 && export HARNESS_AGENT_ROLE=$(printf '%q' "$title") && export HARNESS_PROJECT_ROOT=${quoted_project_root} && export HARNESS_SCOPE_PREFIXES=${quoted_scope_prefixes} && export HARNESS_LOG_DIR=$(printf '%q' "${SCRIPT_ROOT}/../logs/harness") && export PROJECT_DISCOVERY_ROOTS=${quoted_discovery_roots} && exec ${CLAUDE_BIN} -n ${quoted_session_name} --append-system-prompt ${quoted_common_prompt} --append-system-prompt ${quoted_role} ${quoted_kickoff}"

  tmux select-pane -t "$pane" -T "$title"
  tmux respawn-pane -k -t "$pane" "bash -lc $(printf '%q' "$shell_command")"
}

ensure_window_absent_or_reset() {
  local target_window="$1"
  local reset_requested="$2"

  if tmux list-windows -t "$SESSION_NAME" -F '#W' | grep -Fxq "$target_window"; then
    if [ "$reset_requested" -eq 1 ]; then
      tmux kill-window -t "${SESSION_NAME}:${target_window}"
    else
      tmux select-window -t "${SESSION_NAME}:${target_window}"
      exit 0
    fi
  fi
}

spawn_specialist_window() {
  local role="$1"
  local window_name="agent-${role}"
  local agent_name
  local kickoff_prompt

  agent_name="$(role_to_agent_name "$role")" || {
    printf '[harness-team] Unsupported role for --spawn: %s\n' "$role" >&2
    exit 1
  }

  case "$role" in
    refactoring)
      kickoff_prompt="당신은 리팩토링 전문 에이전트다. 현재 디렉터리를 빠르게 파악하고, 구조 개선이 필요한 지점과 안전한 리팩토링 순서를 제안하라."
      ;;
    qa)
      kickoff_prompt="당신은 QA 전문 에이전트다. 현재 디렉터리를 기준으로 핵심 검증 시나리오와 회귀 리스크를 먼저 정리하라."
      ;;
    voc)
      kickoff_prompt="당신은 VOC 전문 에이전트다. 현재 디렉터리를 기준으로 사용자 증상을 기술 이슈로 번역하고 가능한 원인 후보를 정리하라."
      ;;
    new-development)
      kickoff_prompt="당신은 신규개발 전문 에이전트다. 현재 디렉터리를 기준으로 새 기능이 들어갈 구조와 첫 구현 단위를 제안하라."
      ;;
    feature-enhancement)
      kickoff_prompt="당신은 추가기능 개발 전문 에이전트다. 현재 디렉터리를 기준으로 기존 기능을 어디서 어떻게 확장할지 정리하라."
      ;;
    incident-performance)
      kickoff_prompt="당신은 장애 및 성능 분석 전문 에이전트다. 현재 디렉터리를 기준으로 장애 원인 후보, 병목 구간, 빠른 완화책을 정리하라."
      ;;
  esac

  if tmux list-windows -t "$SESSION_NAME" -F '#W' | grep -Fxq "$window_name"; then
    tmux select-window -t "${SESSION_NAME}:${window_name}"
    exit 0
  fi

  tmux new-window -d -t "$SESSION_NAME" -n "$window_name" -c "$PROJECT_ROOT"
  launch_agent "${SESSION_NAME}:${window_name}.1" "$role" "${role}-agent" \
    "$agent_name" \
    "$kickoff_prompt"
  tmux select-window -t "${SESSION_NAME}:${window_name}"
}

launch_orchestrator() {
  local reset_window="$1"
  local leader_agent_name

  ensure_window_absent_or_reset "$WINDOW_NAME" "$reset_window"
  leader_agent_name="$(resolve_leader_agent_name)"

  tmux new-window -d -t "$SESSION_NAME" -n "$WINDOW_NAME" -c "$PROJECT_ROOT"
  HARNESS_AUTO_INJECT_HANDOFF=0 launch_agent "${SESSION_NAME}:${WINDOW_NAME}.1" "leader" "leader-agent" \
    "$leader_agent_name" \
    "하네스 팀 리더로 대기하라. 시작 시 Read/Grep/Glob/Bash 등으로 프로젝트 구조나 docs/project-skill-context.md를 자동으로 읽지 말고, 먼저 사용자에게 다음 중 하나를 선택하게 하라: 1. 프로젝트 분석 init, 2. hand-off 문서 읽기, 3. 둘 다, 4. 기타 입력. 사용자가 선택한 뒤에만 해당 범위의 파일을 읽고, 필요 시 전문 서브 에이전트 또는 agent team을 사용해 작업을 분배하라."
  tmux select-window -t "${SESSION_NAME}:${WINDOW_NAME}"
}

launch_legacy() {
  local reset_window="$1"

  ensure_window_absent_or_reset "$WINDOW_NAME" "$reset_window"

  tmux new-window -d -t "$SESSION_NAME" -n "$WINDOW_NAME" -c "$PROJECT_ROOT"
  tmux select-window -t "${SESSION_NAME}:${WINDOW_NAME}"

  tmux select-pane -t "${SESSION_NAME}:${WINDOW_NAME}.1" -T "leader"
  tmux split-window -h -t "${SESSION_NAME}:${WINDOW_NAME}.1" -c "$PROJECT_ROOT"
  tmux split-window -v -t "${SESSION_NAME}:${WINDOW_NAME}.1" -c "$PROJECT_ROOT"
  tmux split-window -v -t "${SESSION_NAME}:${WINDOW_NAME}.2" -c "$PROJECT_ROOT"
  tmux select-layout -t "${SESSION_NAME}:${WINDOW_NAME}" tiled

  launch_agent "${SESSION_NAME}:${WINDOW_NAME}.1" "leader" "leader-agent" \
    "team-lead" \
    "당신은 리더 에이전트다. 현재 디렉터리를 요약하고, backend/frontend/test 관점의 작업 분해 예시를 제안하라."

  launch_prompt_session "${SESSION_NAME}:${WINDOW_NAME}.2" "backend" "backend-agent" \
    "당신은 백엔드 예시 에이전트다. 현재 디렉터리에서 서버 로직, API, DB 호출, 인증, 공통 유틸 관점을 중심으로 살펴본다." \
    "현재 디렉터리를 기준으로 백엔드 작업 포인트를 요약하라."

  launch_prompt_session "${SESSION_NAME}:${WINDOW_NAME}.3" "frontend" "frontend-agent" \
    "당신은 프론트엔드 예시 에이전트다. 현재 디렉터리에서 템플릿, 정적 리소스, 사용자 흐름, 화면 변경 포인트를 살펴본다." \
    "현재 디렉터리를 기준으로 프론트엔드 작업 포인트를 요약하라."

  launch_prompt_session "${SESSION_NAME}:${WINDOW_NAME}.4" "test" "test-agent" \
    "당신은 테스트 예시 에이전트다. 현재 디렉터리에서 검증 포인트, 회귀 리스크, 배포 전 체크 항목을 살펴본다." \
    "현재 디렉터리를 기준으로 테스트 및 검증 포인트를 요약하라."
}

main() {
  local reset_window=0

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --session)
        require_arg_value "$1" "${2:-}"
        SESSION_NAME="$2"
        shift 2
        ;;
      --window)
        require_arg_value "$1" "${2:-}"
        WINDOW_NAME="$2"
        shift 2
        ;;
      --project)
        require_arg_value "$1" "${2:-}"
        PROJECT_ROOT="$2"
        shift 2
        ;;
      --profile)
        require_arg_value "$1" "${2:-}"
        PROFILE="$2"
        shift 2
        ;;
      --spawn)
        require_arg_value "$1" "${2:-}"
        SPAWN_ROLE="$2"
        shift 2
        ;;
      --leader-model)
        require_arg_value "$1" "${2:-}"
        LEADER_MODEL="$2"
        shift 2
        ;;
      --reset)
        reset_window=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        printf '[harness-team] Unknown option: %s\n' "$1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done

  require_cmd tmux
  require_cmd "$CLAUDE_BIN"
  detect_session
  detect_project_root

  if [ -n "$SPAWN_ROLE" ]; then
    spawn_specialist_window "$SPAWN_ROLE"
    exit 0
  fi

  case "$PROFILE" in
    orchestrator)
      launch_orchestrator "$reset_window"
      ;;
    legacy)
      launch_legacy "$reset_window"
      ;;
    *)
      printf '[harness-team] Unsupported profile: %s\n' "$PROFILE" >&2
      exit 1
      ;;
  esac
}

main "$@"
