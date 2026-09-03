/**
 * ICS 课表导入 - 站点内识别脚本（由“识别课表”书签注入到教务页面本地运行）
 *
 * 说明：
 *  - 本文件托管在 GitHub Pages 上，通过书签的 <script> 动态加载到“已登录的课表页”中执行。
 *  - 因为是 <script> 标签加载，不跨域受限，可在教务页本地读取课表 DOM。
 *  - 学校 id 通过窗口名 window.name（本工具用 window.open(url, 'ics_school_<id>') 打开）识别；
 *    也可在加载时用 ?school=<id> 显式指定。
 *  - 识别完成后通过 postMessage 把课程数据回传给打开该窗口的工具页（window.opener）。
 *
 * 书签用法：
 *  1. 本工具页把“★ 识别课表”拖到收藏栏（或复制其 javascript: 代码建书签）
 *  2. 在本工具打开的教务课表页上点击该书签
 */

(function () {
    'use strict';

    var RULES_INDEX_URL = 'https://raw.githubusercontent.com/cjz-wr/PlanCraftDownload/main/rules_index.json';
    var EXTRACT_TIMEOUT = 25000;
    var FETCH_TIMEOUT = 5000;
    var CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

    // ---------- 缓存工具（localStorage，跨页面共享） ----------
    var CACHE_PREFIX = '__ics_cache_';

    function cacheGet(key) {
        try {
            var raw = localStorage.getItem(CACHE_PREFIX + key);
            if (!raw) return null;
            var entry = JSON.parse(raw);
            if (Date.now() - entry.t > CACHE_TTL) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
            return entry.v;
        } catch (e) { return null; }
    }

    function cacheSet(key, value) {
        try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value })); }
        catch (e) { /* 存储满时静默失败 */ }
    }

    // ---------- 工具 ----------
    function getSchoolId() {
        try {
            var q = new URLSearchParams(window.location.search).get('school');
            if (q) return q;
        } catch (e) { /* ignore */ }
        var m = String(window.name || '').match(/ics_school_([A-Za-z0-9_\-]+)/);
        if (m) return m[1];
        return null;
    }

    function post(type, payload) {
        var data = { type: type, payload: payload, source: 'onsite-extract' };
        var targets = [];
        if (window.opener) targets.push(window.opener);
        if (window.parent && window.parent !== window) targets.push(window.parent);
        targets.forEach(function (t) {
            try {
                t.postMessage(data, '*');
            } catch (e) { /* ignore */ }
        });
    }

    function showToast(message, isOk) {
        try {
            var box = document.createElement('div');
            box.textContent = '[ICS 识别] ' + message;
            box.style.cssText = 'position:fixed;top:18px;right:18px;z-index:2147483647;max-width:320px;padding:12px 16px;border-radius:8px;color:#fff;font:13px/1.5 sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);' +
                (isOk ? 'background:linear-gradient(135deg,#43e97b,#38f9d7);' : 'background:linear-gradient(135deg,#f093fb,#f5576c);');
            document.documentElement.appendChild(box);
            setTimeout(function () { box.remove(); }, 6000);
        } catch (e) { /* ignore */ }
    }

    /**
     * 把 GitHub raw 地址转换为 jsDelivr CDN 镜像地址
     * 例如：https://raw.githubusercontent.com/a/b/main/x.json
     *    → https://cdn.jsdelivr.net/gh/a/b@main/x.json
     */
    function toJsDelivr(githubRawUrl) {
        if (!githubRawUrl) return null;
        var m = String(githubRawUrl).match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/(.+)$/);
        if (!m) return null;
        return 'https://cdn.jsdelivr.net/gh/' + m[1] + '/' + m[2] + '@' + m[3] + '/' + m[4];
    }

    /**
     * 带超时的 fetch
     */
    function withTimeoutFetch(url, ms) {
        var c = new AbortController();
        var t = setTimeout(function () { c.abort(); }, ms || FETCH_TIMEOUT);
        return fetch(url, { signal: c.signal }).then(function (r) {
            clearTimeout(t);
            return r;
        }, function (e) {
            clearTimeout(t);
            throw e;
        });
    }

    /**
     * 并行竞速获取：所有源同时请求，取第一个成功的文本
     */
    function fetchFirstOk(urls, cacheKey) {
        if (cacheKey) {
            var cached = cacheGet(cacheKey);
            if (cached) { console.log('[ICS 识别] 命中缓存:', cacheKey); return Promise.resolve(cached); }
        }
        var promises = urls.map(function (url) {
            return withTimeoutFetch(url).then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            }).then(function (text) {
                if (!text || !text.trim()) throw new Error('空响应');
                return text;
            });
        });
        return Promise.any(promises).then(function (text) {
            if (cacheKey) cacheSet(cacheKey, text);
            return text;
        });
    }

    /**
     * 串行重试获取（并行竞速的后备）
     */
    function fetchWithRetry(urls, cacheKey) {
        if (cacheKey) {
            var cached = cacheGet(cacheKey);
            if (cached) return Promise.resolve(cached);
        }
        var i = 0, attempt = 0;
        function tryNext() {
            if (i >= urls.length) return Promise.reject(new Error('所有源均失败'));
            return withTimeoutFetch(urls[i]).then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            }).then(function (text) {
                if (!text || !text.trim()) throw new Error('空响应');
                if (cacheKey) cacheSet(cacheKey, text);
                return text;
            }).catch(function () {
                attempt++;
                if (attempt < 2) { return new Promise(function (r) { setTimeout(r, 200); }).then(tryNext); }
                i++; attempt = 0; return tryNext();
            });
        }
        return tryNext();
    }

    // ---------- 主流程 ----------
    async function runExtract() {
        var schoolId = getSchoolId();
        if (!schoolId) {
            showToast('未识别到学校：请在本工具的“外部浏览器登录/打开课表页”所打开的窗口中使用本工具。', false);
            post('EXTRACTOR_ERROR', { message: 'NO_SCHOOL_ID' });
            return;
        }

        post('EXTRACTOR_READY', { id: schoolId, url: window.location.href });
        console.log('[ICS 识别] 学校 id =', schoolId, '当前页 =', window.location.href);

        try {
            // 1) 并行竞速拉取规则文件，找到学校配置
            var rulesSources = [RULES_INDEX_URL];
            var rj = toJsDelivr(RULES_INDEX_URL);
            if (rj && rulesSources.indexOf(rj) === -1) rulesSources.push(rj);

            var rulesText;
            try {
                rulesText = await fetchFirstOk(rulesSources, 'rules_index');
            } catch (e) {
                console.warn('[ICS 识别] 并行获取规则失败，降级串行重试');
                rulesText = await fetchWithRetry(rulesSources, 'rules_index');
            }
            var rules = JSON.parse(rulesText);
            if (!rules) throw new Error('获取学校配置失败（网络错误）');
            var school = null;
            (rules.schools || []).forEach(function (s) { if (s.id === schoolId) school = s; });
            if (!school) throw new Error('未找到学校：' + schoolId);

            // 2) 并行竞速拉取该校官方提取脚本
            var urls = [];
            if (school.urls && school.urls.github_raw_js) urls.push(school.urls.github_raw_js);
            var sj = toJsDelivr(school.urls && school.urls.github_raw_js);
            if (sj && urls.indexOf(sj) === -1) urls.push(sj);
            if (school.urls && school.urls.gitcode_raw_js) urls.push(school.urls.gitcode_raw_js);

            var scriptText;
            var scriptCacheKey = 'script_' + schoolId;
            try {
                scriptText = await fetchFirstOk(urls, scriptCacheKey);
            } catch (e) {
                console.warn('[ICS 识别] 并行获取脚本失败，降级串行重试');
                scriptText = await fetchWithRetry(urls, scriptCacheKey);
            }
            if (!scriptText) throw new Error('无法获取该校提取脚本（网络失败，请稍后重试）');

            // 3) 在当前页执行提取脚本（document 即本课表页）
            var code = scriptText +
                '\n;if(typeof extractSchedule==="function"){return extractSchedule();}' +
                'if(typeof window.__courseData!=="undefined"){return window.__courseData;}' +
                'return JSON.stringify({error:"NO_EXTRACT_FN"});';
            var runner = new Function(code);
            var raw = runner();
            var parsed = raw;
            if (typeof raw === 'string') parsed = JSON.parse(raw);

            if (parsed && parsed.error) {
                throw new Error('未在当前页找到课表表格（' + parsed.error + '）。请确认已打开“个人课表页面”后重试。');
            }
            var arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.data) ? parsed.data : null);
            if (!arr || !arr.length) throw new Error('未解析到课程数据，请确认已打开个人课表页面');

            // 4) 回传工具页
            post('COURSE_DATA', arr);
            showToast('识别成功：共 ' + arr.length + ' 门课程，已回传工具页', true);
            console.log('[ICS 识别] 成功，课程数 =', arr.length, arr);
        } catch (e) {
            console.error('[ICS 识别] 失败:', e);
            post('EXTRACTOR_ERROR', { message: String((e && e.message) || e) });
            showToast('识别失败：' + ((e && e.message) || e), false);
        }
    }

    // 避免重复注入多次执行
    if (window.__icsOnsiteRunning) {
        showToast('识别已在进行中，请稍候…', false);
        return;
    }
    window.__icsOnsiteRunning = true;

    // 超时保护
    setTimeout(function () { window.__icsOnsiteRunning = false; }, EXTRACT_TIMEOUT);

    runExtract();
})();
