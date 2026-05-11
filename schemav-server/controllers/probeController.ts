import { Request, Response } from 'express';
import { fetchData } from '../utils/requestUtil.js';

export const probe = async (req: Request, res: Response): Promise<void> => {
    const { targetUrl, method } = req.body;

    if (!targetUrl) {
        res.status(400).json({ message: 'targetUrl is required' });
        return;
    }

    try {
        const data = await fetchData(targetUrl, method || 'GET');
        res.json(data);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Probe Error:', message);
        res.status(500).json({ 
            message: 'Failed to probe the target URL', 
            error: message 
        });
    }
};
