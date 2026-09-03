/**
 * tmpfiles.org 上传管理器
 * 封装文件上传功能
 */

const UploadManager = {
    // Cloudflare Worker 代理地址（硬编码）
    _proxyUrl: 'https://divine-butterfly-d73b.2963393348.workers.dev',
    /**
     * 上传文件到 tmpfiles.org
     * @param {File} file - 要上传的文件
     * @param {number} expire - 过期时间（秒），默认 86400（24小时）
     * @returns {Promise<{url: string}>} - 上传结果
     */
    async upload(file, expire = 86400) {
        console.log('[Upload] 开始上传文件');
        console.log('[Upload] 文件信息:', {
            name: file.name,
            size: this.formatFileSize(file.size),
            type: file.type,
            expire: expire + '秒'
        });
        
        // 验证文件
        console.log('[Upload] 验证文件...');
        this.validateFile(file);
        console.log('[Upload] 文件验证通过');
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('expire', expire.toString());
        
        console.log('[Upload] 正在上传到 tmpfiles.org...');
        
        try {
            const response = await fetch('https://tmpfiles.org/api/v1/upload', {
                method: 'POST',
                body: formData
            });
            
            console.log('[Upload] 响应状态:', response.status, response.statusText);
            
            if (!response.ok) {
                console.error('[Upload] 上传失败，HTTP 状态:', response.status);
                throw new Error(`上传失败: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('[Upload] 响应数据:', result);
            
            if (result.status !== 'success') {
                console.error('[Upload] 上传失败，服务器返回:', result.message);
                throw new Error(result.message || '上传失败');
            }
            
            // 构造预览页面 URL（dl 页面）
            const originalUrl = result.data.url;
            let dlPageUrl = originalUrl.replace('org/', 'org/dl/');
            
            console.log('[Upload] 上传成功');
            console.log('[Upload] 原始链接:', originalUrl);
            console.log('[Upload] 预览页面:', dlPageUrl);
            
            // 从预览页面提取真实下载链接
            let url;
            try {
                url = await this.extractRealDownloadUrl(dlPageUrl);
                console.log('[Upload] 提取到真实下载链接:', url);
            } catch (extractError) {
                console.warn('[Upload] 提取真实链接失败，降级使用预览页面链接:', extractError);
                url = dlPageUrl;
            }
            
            return {
                url: url,
                originalUrl: originalUrl,
                dlPageUrl: dlPageUrl
            };
        } catch (error) {
            console.error('[Upload] 上传过程出错:', error);
            throw error;
        }
    },

    /**
     * 从 tmpfiles.org 的预览页面中提取真实的文件下载链接
     * CF Worker 直接返回 URL 文本；公共代理返回 HTML 需正则提取
     * @param {string} dlPageUrl - 预览页面 URL
     * @returns {Promise<string>} - 真实下载链接
     */
    async extractRealDownloadUrl(dlPageUrl) {
        console.log('[Upload] 正在从预览页面提取真实下载链接...');

        // 代理列表（按可靠性排序），并行竞速取第一个成功的
        const proxyUrls = [];
        
        // 自部署 Cloudflare Worker（最可靠，直接返回 URL 文本）
        if (this._proxyUrl) {
            proxyUrls.push(this._proxyUrl + '/?url=' + encodeURIComponent(dlPageUrl));
        }
        
        // 公共 CORS 代理（返回完整 HTML，需正则提取）
        proxyUrls.push(
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(dlPageUrl),
            'https://corsproxy.io/?' + encodeURIComponent(dlPageUrl),
        );

        // 所有代理并行竞速
        try {
            const result = await Promise.any(
                proxyUrls.map(proxyUrl =>
                    fetch(proxyUrl, { signal: AbortSignal.timeout(8000), redirect: 'follow' })
                        .then(res => {
                            if (!res.ok) throw new Error('HTTP ' + res.status);
                            return res.text();
                        })
                        .then(text => {
                            if (!text) throw new Error('空响应');
                            
                            // CF Worker 直接返回 URL 文本（以 https:// 开头）
                            if (/^https?:\/\/tmpfiles\.org\//.test(text.trim())) {
                                return text.trim();
                            }
                            
                            // 公共代理返回 HTML，用正则提取
                            const match = text.match(/<a[^>]+class="download"[^>]+href="([^"]+)"/);
                            if (match && match[1]) {
                                return match[1].startsWith('http') ? match[1] : 'https://tmpfiles.org' + match[1];
                            }
                            
                            throw new Error('无法解析');
                        })
                )
            );
            console.log('[Upload] 提取到真实下载链接:', result);
            return result;
        } catch (e) {
            throw new Error('CORS代理均不可用');
        }
    },

    /**
     * 验证文件是否符合上传要求
     * @param {File} file - 要验证的文件
     * @returns {boolean} - 是否符合要求
     */
    validateFile(file) {
        // 检查文件大小（100 MB）
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new Error('文件大小超过 100 MB 限制');
        }

        // 检查文件类型
        if (!file.name.endsWith('.ics')) {
            console.warn('文件扩展名不是 .ics，可能无法被日历应用识别');
        }

        return true;
    },

    /**
     * 格式化文件大小
     * @param {number} bytes - 字节数
     * @returns {string} - 格式化后的文件大小
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

// 导出到全局作用域
window.UploadManager = UploadManager;