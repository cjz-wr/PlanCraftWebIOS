/**
 * tmpfiles.org 上传管理器
 * 封装文件上传功能
 */

const UploadManager = {
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
            
            // 转换 URL 格式（添加 /dl/ 路径以获取直接下载链接）
            const url = result.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
            
            console.log('[Upload] 上传成功');
            console.log('[Upload] 原始链接:', result.data.url);
            console.log('[Upload] 下载链接:', url);
            
            return {
                url: url,
                originalUrl: result.data.url
            };
        } catch (error) {
            console.error('[Upload] 上传过程出错:', error);
            throw error;
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