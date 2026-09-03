/**
 * Cloudflare Worker - CORS 代理（白名单安全版）
 * 
 * 用途：代理获取 tmpfiles.org 预览页面，提取真实下载链接返回
 * 部署：https://dash.cloudflare.com → Workers & Pages → Create Worker → 粘贴此代码
 * 
 * 安全：只允许代理 tmpfiles.org，返回真实下载 URL（非 HTML）
 * 免费额度：每天 100,000 次请求
 */

export default {
    async fetch(request) {
        const url = new URL(request.url);
        const target = url.searchParams.get('url');

        // 🛡️ 必须包含 url 参数
        if (!target) {
            return new Response('Missing ?url=', { status: 400 });
        }

        // 🛡️ 白名单：只允许代理 tmpfiles.org
        const allowedHosts = ['tmpfiles.org'];
        const isAllowed = allowedHosts.some(host => target.includes(host));
        if (!isAllowed) {
            return new Response('Forbidden: Only tmpfiles.org is allowed', { status: 403 });
        }

        try {
            // 服务端获取目标页面（无 CORS 限制）
            const res = await fetch(target, {
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html',
                },
            });

            const html = await res.text();

            // 提取 <a class="download" href="..."> 中的真实下载链接
            const match = html.match(/<a\s+class="download"\s+href="([^"]+)"/);
            if (match) {
                const realUrl = match[1].startsWith('http') ? match[1] : 'https://tmpfiles.org' + match[1];
                return new Response(realUrl, {
                    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' },
                });
            }

            return new Response('Link not found', { status: 404 });
        } catch (e) {
            return new Response('Proxy error: ' + e.message, {
                status: 502,
                headers: { 'Access-Control-Allow-Origin': '*' },
            });
        }
    },
};
