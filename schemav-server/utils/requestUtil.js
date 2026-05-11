/**
 * 使用 Node.js Fetch (Node 18+) 封装请求工具
 */
exports.fetchData = async (url, method = 'GET') => {
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'SchemaV-Probe/1.0'
            }
        });

        const contentType = response.headers.get('content-type');
        
        if (!response.ok) {
            let errorDetail = '';
            try {
                errorDetail = await response.text();
            } catch (e) {}
            throw new Error(`Target responded with status ${response.status}: ${errorDetail.substring(0, 100)}`);
        }

        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else {
            // 如果不是 JSON，尝试作为文本返回，或者抛出异常
            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('Target responded with non-JSON content type: ' + contentType);
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw error;
    }
};
