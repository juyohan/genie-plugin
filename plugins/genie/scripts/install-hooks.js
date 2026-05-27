#!/usr/bin/env node
'use strict';

/**
 * install-hooks.js
 * Merges hooks/hooks.json into ~/.claude/settings.json (global).
 * Idempotent — skips hooks whose id already exists.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_DIR = path.resolve(__dirname, '..');
const HOOKS_SRC = path.join(PLUGIN_DIR, 'hooks', 'hooks.json');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

function loadJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function substitutePluginRoot(obj, pluginDir) {
  const normalized = pluginDir.replace(/\\/g, '/');
  // ${CLAUDE_PLUGIN_ROOT} is the canonical placeholder (matches apply.js in Claude Code)
  // {{PLUGIN_ROOT}} is kept as fallback for backward compat
  return JSON.parse(
    JSON.stringify(obj)
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, normalized)
      .replace(/\{\{PLUGIN_ROOT\}\}/g, normalized)
  );
}

function extractCommands(entry) {
  if (!Array.isArray(entry.hooks)) return new Set();
  return new Set(entry.hooks.map(h => h.command).filter(Boolean));
}

function extractCommands(entry) {
  if (!Array.isArray(entry.hooks)) return new Set();
  return new Set(entry.hooks.map(h => h.command).filter(Boolean));
}

function mergeHooks(settings, pluginHooks) {
  settings.hooks = settings.hooks || {};

  for (const [event, entries] of Object.entries(pluginHooks)) {
    settings.hooks[event] = settings.hooks[event] || [];

    // Collect commands from incoming entries that carry an id.
    // Existing no-id entries with the same command are orphans from before
    // ids were introduced — remove them to prevent duplicate execution.
    const incomingCommandsWithId = new Set();
    for (const entry of entries) {
      if (entry.id) {
        for (const cmd of extractCommands(entry)) incomingCommandsWithId.add(cmd);
      }
    }

    const before = settings.hooks[event].length;
    settings.hooks[event] = settings.hooks[event].filter(existing => {
      if (existing.id) return true; // id 있는 항목은 유지 (아래서 update)
      for (const cmd of extractCommands(existing)) {
        if (incomingCommandsWithId.has(cmd)) return false; // 같은 command의 고아 항목 제거
      }
      return true;
    });
    const pruned = before - settings.hooks[event].length;

    let added = 0;
    let updated = 0;

    for (const entry of entries) {
      const existingIdx = entry.id
        ? settings.hooks[event].findIndex(h => h.id === entry.id)
        : -1;

      if (existingIdx !== -1) {
        settings.hooks[event][existingIdx] = entry;
        updated++;
      } else {
        settings.hooks[event].push(entry);
        added++;
      }
    }

    if (added > 0 || updated > 0 || pruned > 0) {
      console.log(`  ${event}: +${added} added, ${updated} updated, -${pruned} orphans removed`);
    }
  }

  return settings;
}

/**
 * hooks.json에서 제거된 genie 훅이 settings.json의 no-id 항목으로 남아 있는 경우 정리.
 * pluginDir을 참조하는 no-id 항목 중 현재 hooks.json에 없는 것을 삭제한다.
 */
function pruneStaleGeniHooks(settings, allCurrentCommands, pluginDir) {
  const normalized = pluginDir.replace(/\\/g, '/');
  let totalPruned = 0;

  for (const [event, entries] of Object.entries(settings.hooks || {})) {
    const before = entries.length;
    settings.hooks[event] = entries.filter(existing => {
      if (existing.id) return true; // id 있는 항목은 이 단계에서 건드리지 않음
      for (const cmd of extractCommands(existing)) {
        const normalizedCmd = cmd.replace(/\\/g, '/');
        if (normalizedCmd.includes(normalized) && !allCurrentCommands.has(cmd)) {
          return false; // genie 훅인데 현재 hooks.json에 없는 항목 — 제거
        }
      }
      return true;
    });
    const pruned = before - settings.hooks[event].length;
    if (pruned > 0) {
      console.log(`  ${event}: -${pruned} stale genie hooks removed`);
      totalPruned += pruned;
    }
  }

  return totalPruned;
}

function getInstalledGeniePaths() {
  const claudeDir = path.join(os.homedir(), '.claude');
  const paths = [];

  // 현재 설치된 genie 버전만 (installed_plugins.json 기준)
  const installedPluginsPath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
  const installed = loadJson(installedPluginsPath);
  for (const [key, entries] of Object.entries(installed?.plugins ?? {})) {
    if (!key.startsWith('genie')) continue;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (entry?.installPath) {
        try {
          const stat = fs.lstatSync(entry.installPath);
          if (stat.isSymbolicLink()) {
            // 심볼릭 링크가 이 플러그인 소스 디렉토리를 가리키는 dev 설치인 경우에만 포함
            // (타 소스를 가리키는 심볼릭 링크는 건너뜀)
            const realTarget = fs.realpathSync(entry.installPath);
            if (realTarget !== PLUGIN_DIR) continue;
          }
        } catch { continue; }
        const p = path.join(entry.installPath, 'hooks', 'hooks.json');
        if (fs.existsSync(p)) paths.push(p);
      }
    }
  }

  // john 마켓플레이스의 genie 플러그인
  const johnMarketplaceGenie = path.join(
    claudeDir, 'plugins', 'marketplaces', 'john', 'plugins', 'genie', 'hooks', 'hooks.json'
  );
  if (fs.existsSync(johnMarketplaceGenie)) paths.push(johnMarketplaceGenie);

  return paths;
}

function emptyObsoleteGenieCaches() {
  const claudeDir = path.join(os.homedir(), '.claude');
  const installedPluginsPath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
  const installed = loadJson(installedPluginsPath);

  // 현재 설치된 installPath 목록
  const installedPaths = new Set();
  for (const entries of Object.values(installed?.plugins ?? {})) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (entry?.installPath) installedPaths.add(entry.installPath);
    }
  }

  // john 캐시에서 genie 계열 중 미설치 버전 → 빈 훅으로
  const johnCacheDir = path.join(claudeDir, 'plugins', 'cache', 'john');
  if (!fs.existsSync(johnCacheDir)) return;

  for (const plugin of fs.readdirSync(johnCacheDir)) {
    if (!plugin.startsWith('genie')) continue;
    const pluginDir = path.join(johnCacheDir, plugin);
    if (!fs.statSync(pluginDir).isDirectory()) continue;
    for (const version of fs.readdirSync(pluginDir)) {
      const versionPath = path.join(pluginDir, version);
      if (installedPaths.has(versionPath)) continue; // 현재 설치 버전은 건너뜀
      // 심볼릭 링크는 실제 소스를 가리킬 수 있으므로 건너뜀
      if (fs.lstatSync(versionPath).isSymbolicLink()) continue;
      const hooksPath = path.join(versionPath, 'hooks', 'hooks.json');
      if (!fs.existsSync(hooksPath)) continue;
      const current = fs.readFileSync(hooksPath, 'utf8').trim();
      if (current === '{"hooks":{}}') continue; // 이미 비워져 있음
      fs.writeFileSync(hooksPath, '{"hooks":{}}\n');
      console.log(`  emptied obsolete: ${hooksPath}`);
    }
  }
}

function patchCacheHooksJson(pluginHooks) {
  for (const hooksPath of getInstalledGeniePaths()) {
    // If this file's real location is inside PLUGIN_DIR (dev symlink), keep {{PLUGIN_ROOT}} placeholders
    // so running install-hooks.js never overwrites source with machine-specific absolute paths.
    let isDevSource = false;
    try {
      const realHooksPath = fs.realpathSync(hooksPath);
      isDevSource = realHooksPath.startsWith(PLUGIN_DIR + '/') || realHooksPath.startsWith(PLUGIN_DIR + path.sep);
    } catch { /* path doesn't exist yet — treat as non-dev */ }

    const content = isDevSource
      ? { hooks: pluginHooks }
      : substitutePluginRoot({ hooks: pluginHooks }, PLUGIN_DIR);

    fs.writeFileSync(hooksPath, JSON.stringify(content, null, 2) + '\n');
    console.log(`  patched${isDevSource ? ' (dev — kept placeholders)' : ''}: ${hooksPath}`);
  }

  emptyObsoleteGenieCaches();
}

function main() {
  if (!fs.existsSync(HOOKS_SRC)) {
    console.error(`Error: hooks source not found at ${HOOKS_SRC}`);
    process.exit(1);
  }

  const src = loadJson(HOOKS_SRC);
  const pluginHooks = src.hooks;

  if (!pluginHooks || typeof pluginHooks !== 'object') {
    console.error('Error: hooks/hooks.json has no valid "hooks" object');
    process.exit(1);
  }

  const resolvedHooks = substitutePluginRoot(pluginHooks, PLUGIN_DIR);

  const settingsDir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  // 현재 hooks.json의 모든 command 집합 (치환 후) — stale 항목 탐지에 사용
  const allCurrentCommands = new Set();
  for (const entries of Object.values(resolvedHooks)) {
    for (const entry of entries) {
      for (const cmd of extractCommands(entry)) allCurrentCommands.add(cmd);
    }
  }

  const settings = loadJson(SETTINGS_PATH);
  pruneStaleGeniHooks(settings, allCurrentCommands, PLUGIN_DIR);
  const merged = mergeHooks(settings, resolvedHooks);

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\n✅ Hooks merged into ${SETTINGS_PATH}`);

  patchCacheHooksJson(pluginHooks);
}

main();
