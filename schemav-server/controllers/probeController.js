const requestUtil = require('../utils/requestUtil');

exports.probe = async (req, res) => {
    const { targetUrl, method } = req.body;

    if (!targetUrl) {
        return res.status(400).json({ message: 'targetUrl is required' });
    }

    try {
        const data = await requestUtil.fetchData(targetUrl, method || 'GET');
        res.json(data);
    } catch (error) {
        console.error('Probe Error:', error.message);
        res.status(500).json({ 
            message: 'Failed to probe the target URL', 
            error: error.message 
        });
    }
};
