/**
 * 使用 Node.js Fetch (Node 18+) 封装请求工具
 * 支持自定义 Headers 和 Body（用于探针代理转发）
 */
export const fetchData = async (
    url: string,
    method: string = 'GET',
    customHeaders?: Record<string, string>,
    body?: string
): Promise<unknown> => {
    try {
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'User-Agent': 'SchemaV-Probe/1.0',
            ...(customHeaders || {}),
        };

        const fetchOptions: RequestInit = {
            method,
            headers,
        };

        // 非 GET 请求且提供了 body 时，携带请求体
        if (method !== 'GET' && body) {
            fetchOptions.body = body;
            // 如果用户没有手动设 Content-Type，默认 JSON
            if (!headers['Content-Type'] && !headers['content-type']) {
                headers['Content-Type'] = 'application/json';
            }
        }

        const response = await fetch(url, fetchOptions);

        const contentType = response.headers.get('content-type');
        
        if (!response.ok) {
            let errorDetail = '';
            try {
                errorDetail = await response.text();
            } catch (e) {
                // ignore read error
            }
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
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw error;
    }
};
