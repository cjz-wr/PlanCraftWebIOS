// ==UserScript==
// @name         ICS 课表提取器
// @namespace    https://github.com/cjz-wr/PlanCraftDownload
// @version      1.1.0
// @description  从学校教务系统提取课表数据并发送到 ICS 课表导入工具
// @author       PlanCraft
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[ICS 课表提取器] 用户脚本已加载');
    console.log('[ICS 课表提取器] 当前页面:', window.location.href);
    console.log('[ICS 课表提取器] opener:', window.opener ? '存在' : '不存在');

    // 学校配置（从 rules_index.json 动态获取）
    let schoolConfig = null;
    let isExtracting = false;

    // 立即向父页面发送就绪消息（如果存在）
    function notifyParent() {
        if (window.opener) {
            console.log('[ICS 课表提取器] 向父页面发送 EXTRACTOR_READY 消息');
            try {
                window.opener.postMessage({
                    type: 'EXTRACTOR_READY',
                    url: window.location.href,
                    timestamp: Date.now()
                }, '*');
                console.log('[ICS 课表提取器] 消息发送成功');
            } catch (error) {
                console.error('[ICS 课表提取器] 消息发送失败:', error);
            }
        } else {
            console.log('[ICS 课表提取器] 没有父页面，跳过消息发送');
        }
    }

    // 页面加载完成后发送就绪消息
    if (document.readyState === 'complete') {
        // 页面已经加载完成
        notifyParent();
    } else {
        // 等待页面加载完成
        window.addEventListener('load', notifyParent);
    }

    // 监听来自父页面的消息
    window.addEventListener('message', function(event) {
        console.log('[ICS 课表提取器] 收到消息:', event.data);
        
        if (event.data && event.data.type === 'INIT_EXTRACTOR') {
            schoolConfig = event.data.config;
            console.log('[ICS 课表提取器] 已初始化，学校:', schoolConfig.name);
            startExtraction();
        }
        
        if (event.data && event.data.type === 'START_EXTRACTION') {
            console.log('[ICS 课表提取器] 收到开始提取命令');
            if (schoolConfig) {
                startExtraction();
            } else {
                console.error('[ICS 课表提取器] 错误: 未收到学校配置');
            }
        }
    });

    /**
     * 开始提取课表
     */
    async function startExtraction() {
        if (!schoolConfig || isExtracting) {
            return;
        }

        isExtracting = true;
        console.log('[ICS 课表提取器] 开始提取课表...');

        try {
            // 等待课表元素加载
            await waitForElement(schoolConfig.webview_config.wait_for_element);
            console.log('[ICS 课表提取器] 课表元素已加载');

            // 动态加载学校脚本
            const scriptUrl = schoolConfig.urls.github_raw_js;
            console.log('[ICS 课表提取器] 加载脚本:', scriptUrl);

            const response = await fetch(scriptUrl);
            const scriptText = await response.text();

            // 执行脚本提取课表数据
            const courseData = await executeExtractionScript(scriptText);
            console.log('[ICS 课表提取器] 提取到课程数据:', courseData);

            // 发送数据到父页面
            window.opener.postMessage({
                type: 'COURSE_DATA',
                payload: courseData
            }, '*');

            // 显示成功提示
            showNotification('课表提取成功！请返回 ICS 课表导入工具继续操作。', 'success');

        } catch (error) {
            console.error('[ICS 课表提取器] 提取失败:', error);
            showNotification('课表提取失败: ' + error.message, 'error');
        } finally {
            isExtracting = false;
        }
    }

    /**
     * 等待元素加载
     */
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver(function(mutations) {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`等待元素超时: ${selector}`));
            }, timeout);
        });
    }

    /**
     * 执行提取脚本
     */
    async function executeExtractionScript(scriptText) {
        // 创建一个隔离的执行环境
        const scriptFunction = new Function(`
            return new Promise((resolve, reject) => {
                try {
                    // 定义回调函数
                    window.__courseDataCallback = function(data) {
                        resolve(data);
                    };

                    // 执行脚本
                    ${scriptText}

                    // 如果脚本没有调用回调，尝试直接获取数据
                    if (typeof window.__courseData !== 'undefined') {
                        resolve(window.__courseData);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        `);

        return await scriptFunction();
    }

    /**
     * 显示通知
     */
    function showNotification(message, type) {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease-out;
        `;

        if (type === 'success') {
            notification.style.background = 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)';
        } else {
            notification.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
        }

        notification.textContent = message;
        document.body.appendChild(notification);

        // 5秒后自动移除
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 5000);
    }

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    console.log('[ICS 课表提取器] 脚本初始化完成');
    console.log('[ICS 课表提取器] 脚本已加载');
})();
