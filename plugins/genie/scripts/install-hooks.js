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
  return JSON.parse(JSON.stringify(obj).replace(/\{\{PLUGIN_ROOT\}\}/g, normalized));
}

function mergeHooks(settings, pluginHooks) {
  settings.hooks = settings.hooks || {};

  for (const [event, entries] of Object.entries(pluginHooks)) {
    settings.hooks[event] = settings.hooks[event] || [];

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

    if (added > 0 || updated > 0) {
      console.log(`  ${event}: +${added} added, ${updated} updated`);
    }
  }

  return settings;
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
  const resolved = substitutePluginRoot({ hooks: pluginHooks }, PLUGIN_DIR);

  for (const hooksPath of getInstalledGeniePaths()) {
    fs.writeFileSync(hooksPath, JSON.stringify(resolved, null, 2) + '\n');
    console.log(`  patched: ${hooksPath}`);
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

  const settings = loadJson(SETTINGS_PATH);
  const merged = mergeHooks(settings, resolvedHooks);

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\n✅ Hooks merged into ${SETTINGS_PATH}`);

  patchCacheHooksJson(pluginHooks);
}

main();
