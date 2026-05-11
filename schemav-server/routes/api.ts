import { Router } from 'express';
import { probe } from '../controllers/probeController.js';
import { getMockChartData } from '../controllers/mockController.js';

const router = Router();

// POST /api/probe — 探针数据拉取
router.post('/probe', probe);

// GET /api/mock-chart-data — 图表测试数据
router.get('/mock-chart-data', getMockChartData);

export default router;
