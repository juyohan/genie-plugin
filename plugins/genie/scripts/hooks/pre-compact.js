#!/usr/bin/env node
/**
 * PreCompact Hook - Save genie state before context compaction
 *
 * Captures:
 *   1. In-progress task (from tasks.jsonl)
 *   2. Active team discussion (from /tmp/genie/team/)
 *   3. Appends compaction marker to active session file
 *
 * Written to: .claude/genie/compact-state.json
 * Read by:    session-start.js (when source === 'compact')
 */

const fs = require('fs');
const path = require('path');
const { getSessionsDir, findFiles, ensureDir, appendFile, log } = require('../lib/utils');
const { readTasks, getInProgressTasks } = require('../lib/task-tracker');

const MAX_TEAM_DISCUSSION_AGE_MS = 2 * 60 * 60 * 1000; // 2시간

function findActiveTeamDiscussion() {
  const teamDir = path.join('/tmp', 'genie', 'team');
  if (!fs.existsSync(teamDir)) return null;

  let entries;
  try {
    entries = fs.readdirSync(teamDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const now = Date.now();
  const recent = entries
    .filter(e => e.isDirectory())
    .map(e => {
      const fullPath = path.join(teamDir, e.name);
      try {
        const stat = fs.statSync(fullPath);
        return { name: e.name, path: fullPath, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter(d => now - d.mtime < MAX_TEAM_DISCUSSION_AGE_MS)
    .sort((a, b) => b.mtime - a.mtime);

  if (recent.length === 0) return null;

  const latest = recent[0];

  // 라운드별 디렉토리 탐색
  let maxRound = 0;
  let handoffFiles = [];
  try {
    const roundDirs = fs.readdirSync(latest.path, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^round-\d+$/.test(e.name))
      .map(e => ({ name: e.name, num: parseInt(e.name.replace('round-', ''), 10) }))
      .sort((a, b) => b.num - a.num);

    if (roundDirs.length > 0) {
      maxRound = roundDirs[0].num;
      const latestRoundDir = path.join(latest.path, roundDirs[0].name);
      handoffFiles = fs.readdirSync(latestRoundDir)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(latestRoundDir, f));
    }
  } catch {}

  return {
    run_id: latest.name,
    handoff_dir: latest.path,
    current_round: maxRound,
    handoff_files: handoffFiles,
  };
}

async function main() {
  const cwd = process.cwd();
  const stateDir = path.join(cwd, '.claude', 'genie');
  const stateFile = path.join(stateDir, 'compact-state.json');

  // stdin에서 trigger 정보 읽기
  let trigger = 'unknown';
  try {
    let raw = '';
    process.stdin.setEncoding('utf8');
    await new Promise(resolve => {
      process.stdin.on('data', c => { raw += c; });
      process.stdin.on('end', resolve);
    });
    const payload = JSON.parse(raw);
    trigger = payload.trigger || 'unknown';
  } catch {}

  const state = {
    ts: new Date().toISOString(),
    trigger,
    in_progress_task: null,
    team_discussion: null,
  };

  // 1. 진행 중인 태스크
  try {
    const tasks = readTasks(cwd);
    const inProgress = getInProgressTasks(tasks);
    if (inProgress.length > 0) {
      const latest = inProgress.sort((a, b) =>
        new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      )[0];
      state.in_progress_task = {
        title: latest.title,
        current_stage: latest.current_stage,
      };
    }
  } catch {}

  // 2. 활성 팀 토론
  const teamDiscussion = findActiveTeamDiscussion();
  if (teamDiscussion) {
    state.team_discussion = teamDiscussion;
  }

  // compact-state.json 저장 (atomic)
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    const tmp = `${stateFile}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, stateFile);
    log('[PreCompact] Saved compact state');
  } catch (err) {
    log(`[PreCompact] Warning: failed to save state: ${err.message}`);
  }

  // 3. 활성 세션 파일에 compaction 마커 추가 (ECC 방식)
  try {
    const sessionsDir = getSessionsDir();
    const sessions = findFiles(sessionsDir, '*-session.tmp');
    if (sessions.length > 0) {
      const timeStr = new Date().toLocaleTimeString('ko-KR');
      appendFile(sessions[0].path, `\n---\n**[Compaction — ${timeStr}]** trigger: ${trigger}\n`);
    }
  } catch {}

  log(`[PreCompact] Done — task: ${state.in_progress_task?.title || 'none'}, team: ${state.team_discussion?.run_id || 'none'}`);
  process.exit(0);
}

main().catch(err => {
  console.error('[PreCompact] Error:', err.message);
  process.exit(0);
});
