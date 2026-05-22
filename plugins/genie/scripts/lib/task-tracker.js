'use strict';
const fs = require('fs');
const path = require('path');

const TASKS_SUBDIR = path.join('.claude', 'genie');
const TASKS_FILENAME = 'tasks.jsonl';

// Workflow order: each stage maps to the next recommended stage
const NEXT_STAGE = {
  'genie:brainstorm': 'genie:plan',
  'genie:plan': 'genie:test',
  'genie:test': 'genie:work',
  'genie:work': 'genie:review',
  'genie:review': 'genie:commit',
  'genie:commit': 'genie:learn',
};

const TERMINAL_STAGE = 'genie:learn';

// Maps doc directory segment → genie skill stage (no leading slash — matches both absolute and relative paths)
const DOC_STAGE_MAP = [
  ['docs/brainstorms/', 'genie:brainstorm'],
  ['docs/plans/', 'genie:plan'],
  ['docs/tests/', 'genie:test'],
  ['docs/work/', 'genie:work'],
  ['docs/reviews/', 'genie:review'],
  ['docs/compounds/', 'genie:learn'],
];

function getTasksFilePath(cwd) {
  return path.join(cwd || process.cwd(), TASKS_SUBDIR, TASKS_FILENAME);
}

// Extracts task title from doc path: docs/{dir}/{year}/{month}/{day}-{title}.md → {title}
function extractTitleFromDocPath(filePath) {
  const basename = path.basename(filePath, '.md');
  const match = basename.match(/^\d{2}-(.+)$/);
  return match ? match[1] : null;
}

function inferStageFromDocPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  for (const [segment, stage] of DOC_STAGE_MAP) {
    if (normalized.includes(segment)) return stage;
  }
  return null;
}

function readTasks(cwd) {
  const tasksFile = getTasksFilePath(cwd);
  if (!fs.existsSync(tasksFile)) return [];
  try {
    const lines = fs.readFileSync(tasksFile, 'utf8').split('\n').filter(Boolean);
    const taskMap = new Map();
    for (const line of lines) {
      try {
        const task = JSON.parse(line);
        if (task.id) taskMap.set(task.id, task);
      } catch {}
    }
    return Array.from(taskMap.values());
  } catch {
    return [];
  }
}

function writeTasks(tasks, cwd) {
  const tasksDir = path.join(cwd || process.cwd(), TASKS_SUBDIR);
  const tasksFile = getTasksFilePath(cwd);
  const tmpFile = `${tasksFile}.tmp.${process.pid}`;
  fs.mkdirSync(tasksDir, { recursive: true });
  const content = tasks.map(t => JSON.stringify(t)).join('\n') + (tasks.length ? '\n' : '');
  try {
    fs.writeFileSync(tmpFile, content, 'utf8');
    fs.renameSync(tmpFile, tasksFile);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    throw err;
  }
}

// Upserts a task stage — appends a new event only if stage changed
function upsertTask(tasks, title, stage) {
  const now = new Date().toISOString();
  const existing = tasks.find(t => t.id === title);
  if (existing) {
    const lastEvent = existing.events[existing.events.length - 1];
    if (lastEvent && lastEvent.stage === stage) return tasks; // no-op
    return tasks.map(t =>
      t.id === title
        ? { ...t, updated_at: now, current_stage: stage, events: [...t.events, { stage, timestamp: now }] }
        : t
    );
  }
  return [
    ...tasks,
    { id: title, title, created_at: now, updated_at: now, current_stage: stage, events: [{ stage, timestamp: now }] },
  ];
}

function getInProgressTasks(tasks) {
  return tasks.filter(t => t.current_stage !== TERMINAL_STAGE);
}

function getNextStage(currentStage) {
  return NEXT_STAGE[currentStage] || null;
}

function escapeRegExpStr(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Finds doc files in {cwd}/docs/** whose basename ends with -{title}.md
function findTaskDocFiles(cwd, title) {
  const docsDir = path.join(cwd || process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) return [];

  const pattern = new RegExp(`-${escapeRegExpStr(title)}\\.md$`);
  const results = [];

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(docsDir);
  return results;
}

module.exports = {
  readTasks,
  writeTasks,
  upsertTask,
  getInProgressTasks,
  getNextStage,
  extractTitleFromDocPath,
  inferStageFromDocPath,
  findTaskDocFiles,
  TERMINAL_STAGE,
};
