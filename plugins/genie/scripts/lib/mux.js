'use strict';

/**
 * lib/mux.js — 터미널 멀티플렉서 추상화 레이어
 *
 * cmux와 tmux를 통합 인터페이스로 제공합니다.
 * 환경 변수로 현재 멀티플렉서를 감지하고 대응하는 명령어를 실행합니다.
 *
 * 감지 우선순위:
 *   1. CMUX_SHELL_INTEGRATION  → cmux
 *   2. TMUX                    → tmux
 *   3. which tmux              → tmux (fallback)
 *   4. CMUX_BUNDLED_CLI_PATH   → cmux (fallback)
 */

const { spawnSync } = require('child_process');

/**
 * 현재 환경의 멀티플렉서를 감지합니다.
 * @returns {{ type: 'cmux'|'tmux', bin: string } | null}
 */
function detectMux() {
  if (process.env.CMUX_SHELL_INTEGRATION) {
    const bin = process.env.CMUX_BUNDLED_CLI_PATH || 'cmux';
    return { type: 'cmux', bin };
  }
  if (process.env.TMUX) {
    return { type: 'tmux', bin: 'tmux' };
  }
  const tmuxCheck = spawnSync('which', ['tmux'], { encoding: 'utf8' });
  if (tmuxCheck.status === 0) return { type: 'tmux', bin: 'tmux' };
  const cmuxBin = process.env.CMUX_BUNDLED_CLI_PATH;
  if (cmuxBin) return { type: 'cmux', bin: cmuxBin };
  return null;
}

/**
 * 현재 프로세스가 멀티플렉서 내부에서 실행 중인지 확인합니다.
 * (OSC 알림 처리, 리마인더 스킵 등에 활용)
 */
function isInsideMux() {
  if (process.env.TMUX || process.env.CMUX_SHELL_INTEGRATION) return true;
  const term = process.env.TERM || '';
  return /^screen/.test(term) || /^tmux/.test(term);
}

function sh(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * 세션/워크스페이스가 존재하는지 확인합니다.
 */
function hasSession(mux, name) {
  if (mux.type === 'cmux') {
    const result = spawnSync(mux.bin, ['list-workspaces'], { encoding: 'utf8' });
    return result.status === 0 && result.stdout.includes(name);
  }
  return spawnSync(mux.bin, ['has-session', '-t', name], { encoding: 'utf8' }).status === 0;
}

/**
 * 세션/워크스페이스를 종료합니다.
 */
function killSession(mux, name) {
  if (mux.type === 'cmux') {
    return spawnSync(mux.bin, ['close-workspace', '--workspace', name], { encoding: 'utf8' });
  }
  return spawnSync(mux.bin, ['kill-session', '-t', name], { encoding: 'utf8' });
}

/**
 * 새 세션/워크스페이스를 백그라운드로 생성하고 명령어를 실행합니다.
 */
function newSession(mux, name, cmd, cwd) {
  if (mux.type === 'cmux') {
    const args = ['new-workspace', '--name', name, '--no-focus'];
    if (cwd) args.push('--cwd', cwd);
    if (cmd) args.push('--command', cmd);
    return spawnSync(mux.bin, args, { encoding: 'utf8' });
  }
  const args = ['new-session', '-d', '-s', name];
  if (cwd) args.push('-c', cwd);
  if (cmd) args.push(cmd);
  return spawnSync(mux.bin, args, { encoding: 'utf8' });
}

/**
 * 세션/워크스페이스에 텍스트를 전송합니다.
 */
function sendKeys(mux, target, text) {
  if (mux.type === 'cmux') {
    return spawnSync(mux.bin, ['send', '--workspace', target, `${text}\n`], { encoding: 'utf8' });
  }
  return spawnSync(mux.bin, ['send-keys', '-t', target, text, 'Enter'], { encoding: 'utf8' });
}

/**
 * 쉘 명령어 문자열로 새 세션을 시작하는 명령어를 반환합니다.
 * (PreToolUse 훅에서 명령어를 변환할 때 사용)
 */
function buildNewSessionShellCommand(mux, name, cmd, cwd) {
  if (mux.type === 'cmux') {
    const parts = [sh(mux.bin), 'new-workspace', '--name', sh(name), '--no-focus'];
    if (cwd) parts.push('--cwd', sh(cwd));
    if (cmd) parts.push('--command', sh(cmd));
    return `${parts.join(' ')} && echo "[Hook] Dev server started in cmux workspace '${name}'."`;
  }
  const escapedCmd = cmd ? cmd.replace(/'/g, "'\\''") : '';
  const cwdFlag = cwd ? ` -c ${sh(cwd)}` : '';
  return (
    `SESSION=${sh(name)}; ` +
    `tmux kill-session -t "$SESSION" 2>/dev/null || true; ` +
    `tmux new-session -d -s "$SESSION"${cwdFlag} '${escapedCmd}' && ` +
    `echo "[Hook] Dev server started in tmux session '${name}'. View logs: tmux capture-pane -t ${name} -p -S -100"`
  );
}

/**
 * 멀티플렉서 리마인더 안내 문자열을 반환합니다.
 */
function getMuxHint(mux) {
  if (!mux || mux.type === 'cmux') {
    return [
      '[Hook] Consider running in cmux for session persistence',
      '[Hook] cmux new-workspace --name dev --cwd . --command <cmd>',
    ].join('\n');
  }
  return [
    '[Hook] Consider running in tmux for session persistence',
    '[Hook] tmux new -s dev  |  tmux attach -t dev',
  ].join('\n');
}

module.exports = {
  detectMux,
  isInsideMux,
  hasSession,
  killSession,
  newSession,
  sendKeys,
  buildNewSessionShellCommand,
  getMuxHint,
};
