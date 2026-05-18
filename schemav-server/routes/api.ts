import { Router } from 'express';
import { probe } from '../controllers/probeController.js';
import { getMockChartData } from '../controllers/mockController.js';
import {
  getTasks,
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
  copyTask,
} from '../controllers/taskController.js';

const router = Router();

// POST /api/probe — 探针数据拉取
router.post('/probe', probe);

// GET /api/mock-chart-data — 图表测试数据
router.get('/mock-chart-data', getMockChartData);

// ============================================================
// Task CRUD
// ============================================================

// GET /api/tasks — 获取任务列表（不含 schema）
router.get('/tasks', getTasks);

// POST /api/tasks — 创建新任务
router.post('/tasks', createTask);

// GET /api/tasks/:id — 获取任务详情（含完整 schema）
router.get('/tasks/:id', getTaskById);

// PUT /api/tasks/:id — 保存大屏内容
router.put('/tasks/:id', updateTask);

// DELETE /api/tasks/:id — 删除任务
router.delete('/tasks/:id', deleteTask);

// POST /api/tasks/:id/copy — 复制任务
router.post('/tasks/:id/copy', copyTask);

export default router;
