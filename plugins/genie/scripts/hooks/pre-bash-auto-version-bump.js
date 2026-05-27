#!/usr/bin/env node
'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_STDIN = 1024 * 1024;

function getRepoRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
}

function getCommitsSinceLastBump(repoRoot) {
  const raw = execSync('git log --no-merges --format=---GENIE_COMMIT---%n%s%n%b', {
    encoding: 'utf8',
    cwd: repoRoot,
  }).trim();

  if (!raw) return [];

  const commits = [];
  for (const block of raw.split(/^---GENIE_COMMIT---$/m)) {
    const lines = block.split('\n').filter(l => l.trim());
    if (!lines.length) continue;
    const subject = lines[0].trim();
    if (/^chore: bump version to\s+\d/.test(subject)) break;
    const body = lines.slice(1).join('\n');
    commits.push({ subject, hasBreakingChange: /^BREAKING[ -]CHANGE:/m.test(body) });
  }
  return commits;
}

function determineBumpType(commits) {
  for (const { subject, hasBreakingChange } of commits) {
    if (/^[a-z]+[^:]*!:/.test(subject) || hasBreakingChange) return 'major';
  }
  for (const { subject } of commits) {
    if (/^feat[^:]*:/.test(subject)) return 'minor';
  }
  return 'patch';
}

function bumpVersion(version, type) {
  const parts = version.split('.').map(Number);
  if (type === 'major') return `${parts[0] + 1}.0.0`;
  if (type === 'minor') return `${parts[0]}.${parts[1] + 1}.0`;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function buildChangelogEntry(version, date, commits) {
  const breaking = commits.filter(c => /^[a-z]+[^:]*!:/.test(c.subject) || c.hasBreakingChange);
  const added    = commits.filter(c => /^feat[^:]*:/.test(c.subject) && !breaking.includes(c));
  const fixed    = commits.filter(c => /^fix[^:]*:/.test(c.subject));
  const changed  = commits.filter(c => !breaking.includes(c) && !added.includes(c) && !fixed.includes(c));

  let entry = `## [${version}] - ${date}\n`;
  if (breaking.length) entry += `\n### Breaking Changes\n${breaking.map(c => `- ${c.subject}`).join('\n')}\n`;
  if (added.length)    entry += `\n### Added\n${added.map(c => `- ${c.subject}`).join('\n')}\n`;
  if (fixed.length)    entry += `\n### Fixed\n${fixed.map(c => `- ${c.subject}`).join('\n')}\n`;
  if (changed.length)  entry += `\n### Changed\n${changed.map(c => `- ${c.subject}`).join('\n')}\n`;
  return entry;
}

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const cmd = String(input.tool_input?.command || '');

    if (!/\bgit\s+push\b/.test(cmd)) {
      return typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput);
    }

    const repoRoot    = getRepoRoot();
    const commits     = getCommitsSinceLastBump(repoRoot);
    const passThrough = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput);

    if (commits.length === 0) {
      return {
        stdout: passThrough,
        stderr: '[auto-version-bump] No unreleased commits — skipping.\n',
        exitCode: 0,
      };
    }

    const pluginJsonPath  = path.join(repoRoot, '.claude-plugin', 'plugin.json');
    const codexPluginPath = path.join(repoRoot, 'plugins', 'genie', '.codex-plugin', 'plugin.json');
    const changelogPath   = path.join(repoRoot, 'CHANGELOG.md');

    if (!fs.existsSync(pluginJsonPath)) {
      return {
        stdout: passThrough,
        stderr: '[auto-version-bump] Not a plugin repo (.claude-plugin/plugin.json not found) — skipping.\n',
        exitCode: 0,
      };
    }

    const pluginJson     = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    const currentVersion = pluginJson.version;
    const bumpType       = determineBumpType(commits);
    const newVersion     = bumpVersion(currentVersion, bumpType);
    const today          = new Date().toISOString().split('T')[0];

    // Update plugin.json
    const updatedPluginJson = { ...pluginJson, version: newVersion };
    fs.writeFileSync(pluginJsonPath, JSON.stringify(updatedPluginJson, null, 2) + '\n');

    // Update .codex-plugin/plugin.json if it exists
    if (fs.existsSync(codexPluginPath)) {
      const codexPlugin = JSON.parse(fs.readFileSync(codexPluginPath, 'utf8'));
      fs.writeFileSync(codexPluginPath, JSON.stringify({ ...codexPlugin, version: newVersion }, null, 2) + '\n');
    }

    // Update CHANGELOG.md — insert before first ## [ entry
    const changelog    = fs.readFileSync(changelogPath, 'utf8');
    const insertIdx    = changelog.indexOf('\n## [');
    const newEntry     = '\n' + buildChangelogEntry(newVersion, today, commits);
    const newChangelog = insertIdx !== -1
      ? changelog.slice(0, insertIdx) + newEntry + changelog.slice(insertIdx)
      : changelog + newEntry;
    fs.writeFileSync(changelogPath, newChangelog);

    // Commit
    const filesToStage = [pluginJsonPath, changelogPath];
    if (fs.existsSync(codexPluginPath)) filesToStage.push(codexPluginPath);
    // Clear skip-worktree bit before staging (set by agent worktrees)
    for (const f of filesToStage) {
      try {
        spawnSync('git', ['update-index', '--no-skip-worktree', f], { cwd: repoRoot, stdio: 'pipe' });
      } catch (_) {}
    }
    const addResult = spawnSync('git', ['add', ...filesToStage], { cwd: repoRoot, stdio: 'pipe' });
    if (addResult.status !== 0) {
      return { stdout: passThrough, stderr: '[auto-version-bump] git add failed — skipping bump.\n', exitCode: 0 };
    }
    spawnSync('git', ['commit', '-m', `chore: bump version to ${newVersion}`], { cwd: repoRoot, stdio: 'pipe' });

    // Update local plugin registry and cache symlink
    const installedPluginsPath = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
    if (fs.existsSync(installedPluginsPath)) {
      try {
        const installed = JSON.parse(fs.readFileSync(installedPluginsPath, 'utf8'));
        const pluginKey = `${pluginJson.name}@${(pluginJson.author?.name || 'john').toLowerCase()}`;

        if (installed.plugins?.[pluginKey]?.[0]) {
          const entry        = installed.plugins[pluginKey][0];
          const cacheBase    = path.dirname(entry.installPath);
          const pluginSrcDir = path.join(repoRoot, 'plugins', pluginJson.name);

          // Replace real version directories with symlinks so Claude Code always
          // loads current source even if installPath falls back to an old version.
          // Skip .bak entries to prevent recursive accumulation.
          for (const dir of fs.readdirSync(cacheBase)) {
            if (dir.includes('.bak')) continue;
            const dirPath = path.join(cacheBase, dir);
            try {
              const stat = fs.lstatSync(dirPath);
              if (stat.isDirectory() && !stat.isSymbolicLink()) {
                fs.renameSync(dirPath, dirPath + '.bak');
                fs.symlinkSync(pluginSrcDir, dirPath);
              }
            } catch (_) {}
          }

          // Create symlink for new version if not already present
          const newCachePath = path.join(cacheBase, newVersion);
          if (!fs.existsSync(newCachePath)) {
            fs.symlinkSync(pluginSrcDir, newCachePath);
          }

          installed.plugins[pluginKey][0] = {
            ...entry,
            version:     newVersion,
            installPath: newCachePath,
            lastUpdated: new Date().toISOString(),
          };
          fs.writeFileSync(installedPluginsPath, JSON.stringify(installed, null, 2) + '\n');
        }
      } catch (_) {
        // registry update is best-effort — don't abort the push
      }
    }

    return {
      stdout: passThrough,
      stderr: `[auto-version-bump] ${currentVersion} → ${newVersion} (${bumpType})\n`,
      exitCode: 0,
    };
  } catch (err) {
    const passThrough = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput);
    return {
      stdout: passThrough,
      stderr: `[auto-version-bump] Warning: ${err.message} — skipping bump.\n`,
      exitCode: 0,
    };
  }
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    const result = run(raw);
    if (result && typeof result === 'object') {
      if (result.stderr) process.stderr.write(result.stderr);
      process.stdout.write(String(result.stdout || ''));
      process.exitCode = Number.isInteger(result.exitCode) ? result.exitCode : 0;
      return;
    }
    process.stdout.write(String(result));
  });
}

module.exports = { run };
