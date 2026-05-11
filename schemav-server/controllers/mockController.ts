import { Request, Response } from 'express';

const mockChartData = [
    { month: '1月', sales: 150, profit: 80, target: 200 },
    { month: '2月', sales: 230, profit: 120, target: 200 },
    { month: '3月', sales: 180, profit: 90, target: 200 },
    { month: '4月', sales: 299, profit: 150, target: 250 },
    { month: '5月', sales: 320, profit: 180, target: 250 },
    { month: '6月', sales: 280, profit: 140, target: 250 },
];

export const getMockChartData = (_req: Request, res: Response): void => {
    res.json(mockChartData);
};
