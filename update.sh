#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
AGENTS_DST="${CLAUDE_DIR}/agents"
RULES_DST="${CLAUDE_DIR}/rules"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
RESET='\033[0m'

agents_updated=0
agents_new=0
rules_updated=0
rules_new=0

echo -e "${CYAN}John Plugin — update${RESET}"
echo "Plugin root: ${PLUGIN_DIR}"
echo ""

# ── git pull ──────────────────────────────────────────────────────────────────
echo "Pulling latest changes..."
cd "${PLUGIN_DIR}"
git pull origin main
echo ""

# ── agents ───────────────────────────────────────────────────────────────────
mkdir -p "${AGENTS_DST}"
echo "Syncing agents → ${AGENTS_DST}"

for src in "${PLUGIN_DIR}/plugins/genie/agents/"*.md; do
  [ -f "${src}" ] || continue
  name="$(basename "${src}")"
  dst="${AGENTS_DST}/${name}"

  if [ -L "${dst}" ]; then
    current_target="$(readlink "${dst}")"
    if [ "${current_target}" = "${src}" ]; then
      continue
    fi
    rm "${dst}"
    ln -s "${src}" "${dst}"
    echo -e "  ${YELLOW}update${RESET} ${name}"
    ((agents_updated++)) || true
  elif [ -e "${dst}" ]; then
    # 일반 파일 → 심볼릭 링크로 교체
    rm "${dst}"
    ln -s "${src}" "${dst}"
    echo -e "  ${GREEN}relink${RESET} ${name} (replaced file with symlink)"
    ((agents_updated++)) || true
  else
    ln -s "${src}" "${dst}"
    echo -e "  ${GREEN}new${RESET}    ${name}"
    ((agents_new++)) || true
  fi
done

echo ""

# ── rules ─────────────────────────────────────────────────────────────────────
mkdir -p "${RULES_DST}"
echo "Syncing rules → ${RULES_DST}"

for src in "${PLUGIN_DIR}/rules/"/*/; do
  [ -d "${src}" ] || continue
  name="$(basename "${src}")"
  dst="${RULES_DST}/${name}"

  if [ -L "${dst}" ]; then
    current_target="$(readlink "${dst}")"
    if [ "${current_target}" = "${src%/}" ]; then
      continue
    fi
    rm "${dst}"
    ln -s "${src%/}" "${dst}"
    echo -e "  ${YELLOW}update${RESET} ${name}/"
    ((rules_updated++)) || true
  elif [ -e "${dst}" ]; then
    echo -e "  ${RED}skip${RESET}   ${name}/ (directory exists — remove manually to relink)"
    continue
  else
    ln -s "${src%/}" "${dst}"
    echo -e "  ${GREEN}new${RESET}    ${name}/"
    ((rules_new++)) || true
  fi
done

echo ""

# ── hooks ─────────────────────────────────────────────────────────────────────
INSTALL_HOOKS="${PLUGIN_DIR}/plugins/genie/scripts/install-hooks.js"
echo "Syncing hooks → ${CLAUDE_DIR}/settings.json"
if [ -f "${INSTALL_HOOKS}" ]; then
  node "${INSTALL_HOOKS}"
else
  echo -e "  ${RED}skip${RESET}  install-hooks.js not found at ${INSTALL_HOOKS}"
fi
echo ""

# ── summary ───────────────────────────────────────────────────────────────────
echo -e "${GREEN}Done.${RESET}"
echo "  Agents:  ${agents_new} new, ${agents_updated} updated"
echo "  Rules:   ${rules_new} new, ${rules_updated} updated"
echo ""
echo "Tip: agents/rules are now symlinked. Future 'git pull' alone is enough."
