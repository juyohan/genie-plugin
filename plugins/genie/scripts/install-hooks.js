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

function findGenieCachePaths() {
  const claudeDir = path.join(os.homedir(), '.claude');
  const paths = [];

  // installed plugin cache — genie 항목만
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

  // john 마켓플레이스의 genie 플러그인만
  const johnMarketplaceGenie = path.join(
    claudeDir, 'plugins', 'marketplaces', 'john', 'plugins', 'genie', 'hooks', 'hooks.json'
  );
  if (fs.existsSync(johnMarketplaceGenie)) paths.push(johnMarketplaceGenie);

  return paths;
}

function patchCacheHooksJson(pluginHooks) {
  const resolved = substitutePluginRoot({ hooks: pluginHooks }, PLUGIN_DIR);

  for (const hooksPath of findGenieCachePaths()) {
    fs.writeFileSync(hooksPath, JSON.stringify(resolved, null, 2) + '\n');
    console.log(`  patched: ${hooksPath}`);
  }
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
