#!/usr/bin/env node
/**
 * Auto-Tmux Dev Hook - Start dev servers in tmux/cmd automatically
 *
 * macOS/Linux: Runs dev server in a named tmux session (non-blocking).
 *              Falls back to original command if tmux is not installed.
 * Windows: Opens dev server in a new cmd window (non-blocking).
 *
 * Runs before Bash tool use. If command is a dev server (npm run dev, pnpm dev, yarn dev, bun run dev),
 * transforms it to run in a detached session.
 *
 * Benefits:
 * - Dev server runs detached (doesn't block Claude Code)
 * - Session persists (can run `tmux capture-pane -t <session> -p` to see logs on Unix)
 * - Session name matches project directory (allows multiple projects simultaneously)
 *
 * Session management (Unix):
 * - Checks tmux availability before transforming
 * - Kills any existing session with the same name (clean restart)
 * - Creates new detached session
 * - Reports session name and how to view logs
 *
 * Session management (Windows):
 * - Opens new cmd window with descriptive title
 * - Allows multiple dev servers to run simultaneously
 */

const path = require('path');
const { spawnSync } = require('child_process');

const MAX_STDIN = 1024 * 1024; // 1MB limit
let data = '';

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

function buildCmuxCommand(bin, sessionName, cmd, cwd) {
  const escapedCmd = cmd.replace(/'/g, "'\\''");
  const escapedCwd = cwd.replace(/'/g, "'\\''");
  return (
    `'${bin.replace(/'/g, "'\\''")}' new-workspace` +
    ` --name '${sessionName}'` +
    ` --cwd '${escapedCwd}'` +
    ` --command '${escapedCmd}'` +
    ` --no-focus` +
    ` && echo "[Hook] Dev server started in cmux workspace '${sessionName}'."`
  );
}

function buildTmuxCommand(sessionName, cmd) {
  const escapedCmd = cmd.replace(/'/g, "'\\''");
  return (
    `SESSION="${sessionName}"; ` +
    `tmux kill-session -t "$SESSION" 2>/dev/null || true; ` +
    `tmux new-session -d -s "$SESSION" '${escapedCmd}' && ` +
    `echo "[Hook] Dev server started in tmux session '${sessionName}'. View logs: tmux capture-pane -t ${sessionName} -p -S -100"`
  );
}

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const cmd = input.tool_input?.command || '';

    const devServerRegex = /(npm run dev\b|pnpm( run)? dev\b|yarn dev\b|bun run dev\b)/;
    if (!devServerRegex.test(cmd)) {
      return JSON.stringify(input);
    }

    const rawName = path.basename(process.cwd());
    const sessionName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'dev';

    if (process.platform === 'win32') {
      const escapedCmd = cmd.replace(/"/g, '""');
      return JSON.stringify({
        ...input,
        tool_input: {
          ...input.tool_input,
          command: `start "DevServer-${sessionName}" cmd /k "${escapedCmd}"`,
        },
      });
    }

    const mux = detectMux();
    if (!mux) return JSON.stringify(input);

    const transformedCmd = mux.type === 'cmux'
      ? buildCmuxCommand(mux.bin, sessionName, cmd, process.cwd())
      : buildTmuxCommand(sessionName, cmd);

    return JSON.stringify({
      ...input,
      tool_input: { ...input.tool_input, command: transformedCmd },
    });
  } catch {
    return typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput);
  }
}

if (require.main === module) {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) {
      const remaining = MAX_STDIN - data.length;
      data += chunk.substring(0, remaining);
    }
  });

  process.stdin.on('end', () => {
    process.stdout.write(run(data));
    process.exit(0);
  });
}

module.exports = { run };
