import { Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

// ============================================================
// 类型定义
// ============================================================

export interface ComponentPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChartSchema {
  chartType: 'bar' | 'line';
  xAxisField: string;
  yAxisField: string;
  assetId?: string;
  customOption?: string;
}

export interface ComponentInstance {
  id: string;
  type: string;
  position: ComponentPosition;
  zIndex: number;
  props: Record<string, unknown>;
}

export interface DataAsset {
  id: string;
  name: string;
  fields: string[];
  data: Record<string, unknown>[];
}

export interface DashboardSchema {
  version: string;
  title: string;
  canvas: {
    width: number;
    height: number;
    background: string;
  };
  components: ComponentInstance[];
  assets: DataAsset[];
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  cover: string;
  createdAt: string;
  updatedAt: string;
  schema: DashboardSchema;
}

/** 列表接口用的 Task 摘要（不含 schema） */
export interface TaskSummary {
  id: string;
  name: string;
  description: string;
  cover: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 文件路径
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_FILE = join(__dirname, '..', 'data', 'tasks.json');

// ============================================================
// 工具函数
// ============================================================

function readTasks(): Task[] {
  if (!existsSync(DATA_FILE)) {
    return [];
  }
  try {
    const raw = readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTasks(tasks: Task[]): void {
  writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

/** 生成默认空 schema */
function createDefaultSchema(title: string): DashboardSchema {
  const now = new Date().toISOString();
  return {
    version: '1.0.0',
    title,
    canvas: {
      width: 1920,
      height: 1080,
      background: '#f0f2f5',
    },
    components: [],
    assets: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 生成默认封面 CSS 渐变色 */
function generateCover(): string {
  const hues = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    'linear-gradient(135deg, #f5576c 0%, #ff6f61 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  ];
  return hues[Math.floor(Math.random() * hues.length)];
}

/** 过滤掉 schema 字段，返回 TaskSummary */
function toSummary(task: Task): TaskSummary {
  const { schema: _, ...summary } = task;
  return summary;
}

// ============================================================
// CRUD 控制器
// ============================================================

/** GET /api/tasks — 获取任务列表（不含 schema） */
export const getTasks = (_req: Request, res: Response): void => {
  const tasks = readTasks();
  const summaries = tasks.map(toSummary);
  res.json(summaries);
};

/** POST /api/tasks — 创建新任务 */
export const createTask = (req: Request, res: Response): void => {
  const { name, description } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ message: 'name is required' });
    return;
  }

  const tasks = readTasks();
  const now = new Date().toISOString();

  const newTask: Task = {
    id: randomUUID(),
    name: name.trim(),
    description: description?.trim() || '',
    cover: generateCover(),
    createdAt: now,
    updatedAt: now,
    schema: createDefaultSchema(name.trim()),
  };

  tasks.push(newTask);
  writeTasks(tasks);

  console.log(`[TaskController] 任务已创建: ${newTask.id} — "${newTask.name}"`);
  res.status(201).json(newTask);
};

/** GET /api/tasks/:id — 获取单个任务详情（含完整 schema） */
export const getTaskById = (req: Request, res: Response): void => {
  const { id } = req.params;
  const tasks = readTasks();
  const task = tasks.find((t) => t.id === id);

  if (!task) {
    res.status(404).json({ message: `Task not found: ${id}` });
    return;
  }

  res.json(task);
};

/** PUT /api/tasks/:id — 保存大屏内容（更新 schema） */
export const updateTask = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { schema } = req.body;

  if (!schema) {
    res.status(400).json({ message: 'schema is required' });
    return;
  }

  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === id);

  if (idx === -1) {
    res.status(404).json({ message: `Task not found: ${id}` });
    return;
  }

  tasks[idx].schema = {
    ...schema,
    updatedAt: new Date().toISOString(),
  };
  tasks[idx].updatedAt = new Date().toISOString();

  writeTasks(tasks);

  console.log(`[TaskController] 任务已更新: ${id}`);
  res.json(tasks[idx]);
};

/** DELETE /api/tasks/:id — 删除任务 */
export const deleteTask = (req: Request, res: Response): void => {
  const { id } = req.params;
  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === id);

  if (idx === -1) {
    res.status(404).json({ message: `Task not found: ${id}` });
    return;
  }

  const removed = tasks.splice(idx, 1)[0];
  writeTasks(tasks);

  console.log(`[TaskController] 任务已删除: ${id} — "${removed.name}"`);
  res.json({ message: 'Task deleted', id });
};

/** POST /api/tasks/:id/copy — 复制任务 */
export const copyTask = (req: Request, res: Response): void => {
  const { id } = req.params;
  const tasks = readTasks();
  const original = tasks.find((t) => t.id === id);

  if (!original) {
    res.status(404).json({ message: `Task not found: ${id}` });
    return;
  }

  const now = new Date().toISOString();

  const copy: Task = {
    ...original,
    id: randomUUID(),
    name: `${original.name} (副本)`,
    cover: generateCover(),
    createdAt: now,
    updatedAt: now,
    schema: {
      ...original.schema,
      title: `${original.schema.title} (副本)`,
      createdAt: now,
      updatedAt: now,
    },
  };

  tasks.push(copy);
  writeTasks(tasks);

  console.log(`[TaskController] 任务已复制: ${id} → ${copy.id}`);
  res.status(201).json(copy);
};
