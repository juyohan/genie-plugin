const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { sanitizeSessionId } = require('./utils');

function getHomunculusDir() {
  const override = process.env.CLV2_HOMUNCULUS_DIR;
  if (override) {
    if (path.isAbsolute(override)) {
      return override;
    }
    process.stderr.write(`[ecc] CLV2_HOMUNCULUS_DIR=${override} is not absolute; ignoring\n`);
  }

  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    if (path.isAbsolute(xdgDataHome)) {
      return path.join(xdgDataHome, 'ecc-homunculus');
    }
    process.stderr.write(`[ecc] XDG_DATA_HOME=${xdgDataHome} is not absolute; ignoring\n`);
  }

  return path.join(os.homedir(), '.local', 'share', 'ecc-homunculus');
}

function getProjectsDir() {
  return path.join(getHomunculusDir(), 'projects');
}

function getProjectRegistryPath() {
  return path.join(getHomunculusDir(), 'projects.json');
}

function readProjectRegistry() {
  try {
    return JSON.parse(fs.readFileSync(getProjectRegistryPath(), 'utf8'));
  } catch {
    return {};
  }
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  if (result.status !== 0) return '';
  return (result.stdout || '').trim();
}

function stripRemoteCredentials(remoteUrl) {
  if (!remoteUrl) return '';
  return String(remoteUrl).replace(/:\/\/[^@]+@/, '://');
}

function normalizeRemoteUrl(remoteUrl) {
  if (!remoteUrl) return '';
  const raw = String(remoteUrl);
  const isNetwork = !raw.startsWith('file://') && (raw.includes('://') || /^[^@/:]+@[^:/]+:/.test(raw));
  let normalized = stripRemoteCredentials(raw)
    .replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, '')
    .replace(/^[^@/:]+@([^:/]+):/, '$1/')
    .replace(/\.git\/?$/, '')
    .replace(/\/+$/, '');

  if (isNetwork) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

function resolveProjectRoot(cwd = process.cwd()) {
  const envRoot = process.env.CLAUDE_PROJECT_DIR;
  if (envRoot && fs.existsSync(envRoot)) {
    return path.resolve(envRoot);
  }

  const gitRoot = runGit(['rev-parse', '--show-toplevel'], cwd);
  if (gitRoot) return path.resolve(gitRoot);

  return '';
}

function computeProjectId(projectRoot) {
  const remoteUrl = stripRemoteCredentials(runGit(['remote', 'get-url', 'origin'], projectRoot));
  const hashInput = normalizeRemoteUrl(remoteUrl) || remoteUrl || projectRoot;
  return crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
}

function resolveProjectContext(cwd = process.cwd()) {
  const projectRoot = resolveProjectRoot(cwd);
  if (!projectRoot) {
    const projectDir = getHomunculusDir();
    fs.mkdirSync(projectDir, { recursive: true });
    return { projectId: 'global', projectRoot: '', projectDir, isGlobal: true };
  }

  const registry = readProjectRegistry();
  const registryEntry = Object.values(registry).find(entry => entry && path.resolve(entry.root || '') === projectRoot);
  const projectId = registryEntry?.id || computeProjectId(projectRoot);
  const projectDir = path.join(getProjectsDir(), projectId);
  fs.mkdirSync(projectDir, { recursive: true });

  return { projectId, projectRoot, projectDir, isGlobal: false };
}

function resolveSessionId(rawSessionId = process.env.CLAUDE_SESSION_ID) {
  return sanitizeSessionId(rawSessionId || '') || '';
}

module.exports = {
  getHomunculusDir,
  normalizeRemoteUrl,
  resolveProjectContext,
  resolveSessionId,
};
