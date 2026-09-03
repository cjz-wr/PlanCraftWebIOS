/**
 * ICS 课表导入 - 主逻辑模块
 *
 * 识别流程（GitHub Pages · 书签一键识别 · 无粘贴 / 无扩展）：
 *   1. 选择学校
 *   2. 登录：SSO 等禁止内嵌的登录页 → 用外部浏览器窗口登录（仅用于登录）；
 *      登录成功后教务系统会自动跳转到课表网站。
 *   3. 用户打开个人课表页后，点一下收藏栏“★ 识别课表”书签：
 *      书签向课表页注入 js/onsite-extract.js，在该页本地运行学校官方提取脚本，
 *      结果通过 postMessage 自动回传到本页（window.name 携带学校 id）。
 *   4. 收到课程数据后选择学期开始时间 → 生成 ICS。
 */

// 常量定义
const RULES_INDEX_URL = 'https://raw.githubusercontent.com/cjz-wr/PlanCraftDownload/main/rules_index.json';
const WEEKDAY_NAMES = ['', '一', '二', '三', '四', '五', '六', '日'];
const EMBED_TIMEOUT = 20000;

// 本工具部署目录（github.io 或本地服务器均可），用于书签注入的 onsite-extract.js 地址
const SITE_BASE = (function () {
    try {
        return new URL('.', location.href).href;
    } catch (e) {
        return location.href.replace(/[^/]*$/, '');
    }
})();

// 部分学校的“登录后跳转页/禁止内嵌”覆盖配置。
// 背景：这些学校的跳转页(如新教务 CAS 登录页)返回 X-Frame-Options: SAMEORIGIN，
// 无法被跨站网页 iframe 内嵌，且需要 cookie 会话才可自动登录跳转。
// 处理方式（GitHub Pages·书签方案）：外部浏览器(仅登录)建立 cookie → “登录完成”用新窗口
// 打开跳转页完成跳转 → 用户到课表页点“★ 识别课表”书签 → 自动回传识别。
const SCHOOL_OVERRIDES = {
    gdlyzyjsxy: {
        name: '广东岭南职业技术学院',
        // 登录网站为 SSO（外部浏览器登录用）；登录成功后会自动跳转到 newjw 教务
        jumpUrl: 'https://sso.lnc.edu.cn/lyuapServer/login?service=https://newjw.lnc.edu.cn/caslogin',
        noEmbed: true, // sso/教务页均有 X-Frame-Options(DENY/SAMEORIGIN)，禁止跨站 iframe 内嵌
        note: '该校登录/教务页禁止被网页内嵌（X-Frame-Options）。请在新窗口的 SSO 登录页登录（仅登录），登录后会自动跳转到教务；进入个人课表页后，点收藏栏“★ 识别课表”书签自动识别（无需粘贴）。'
    }
};

const LABEL_OPEN_SCHEDULE = '✅ 登录完成 · 在内嵌浏览器打开课表页';
const LABEL_OPEN_SCHEDULE_NOEMBED = '✅ 登录完成 · 新窗口打开课表页（禁止内嵌）';

// 状态管理
const state = {
    schools: [],
    selectedSchool: null,
    courseData: [],
    semesterStart: null,
    icsFile: null,
    loginWindow: null // 外部浏览器登录窗口
};

// DOM 元素引用
const elements = {
    schoolSelect: document.getElementById('school-select'),
    openWebviewBtn: document.getElementById('open-webview-btn'),
    embedLoginBtn: document.getElementById('embed-login-btn'),
    openScheduleBtn: document.getElementById('open-schedule-btn'),
    recognizeBtn: document.getElementById('recognize-btn'),
    embedCard: document.getElementById('embed-card'),
    noEmbedNote: document.getElementById('noembed-note'),
    embedBrowser: document.getElementById('embed-browser'),
    embedHint: document.getElementById('embed-hint'),
    embedFrame: document.getElementById('embed-frame'),
    embedAddress: document.getElementById('embed-address'),
    embedRefreshBtn: document.getElementById('embed-refresh-btn'),
    bookmarkPanel: document.getElementById('bookmark-panel'),
    bookmarkLink: document.getElementById('bookmark-link'),
    bookmarkCopyBtn: document.getElementById('bookmark-copy-btn'),
    bookmarkHint: document.getElementById('bookmark-hint'),
    semesterSection: document.getElementById('semester-section'),
    semesterStart: document.getElementById('semester-start'),
    resultSection: document.getElementById('result-section'),
    courseList: document.getElementById('course-list'),
    downloadBtn: document.getElementById('download-btn'),
    uploadBtn: document.getElementById('upload-btn'),
    shareSection: document.getElementById('share-section'),
    shareUrl: document.getElementById('share-url'),
    copyBtn: document.getElementById('copy-btn'),
    status: document.getElementById('status'),
    webviewStatus: document.getElementById('webview-status'),
    statusDot: document.querySelector('.status-dot'),
    statusText: document.querySelector('.status-text')
};

/**
 * 初始化应用
 */
async function init() {
    try {
        console.log('[ICS] 开始初始化... 协议:', window.location.protocol);
        showStatus('正在加载学校列表...', 'loading');

        bindEvents();
        refreshBookmark();
        await loadSchools();

        if (window.location.protocol === 'file:') {
            console.warn('[ICS] 使用 file:// 协议，远程抓取/部分功能会受限，建议用 HTTP 服务器或部署到 GitHub Pages');
        }
        showStatus('学校列表加载完成，共 ' + state.schools.length + ' 所学校', 'success');
        console.log('[ICS] 初始化完成');
    } catch (error) {
        console.error('[ICS] 初始化失败:', error);
        showStatus('加载失败: ' + error.message, 'error');
    }
}

/**
 * 带超时的 fetch（防止某些网络下远程主机挂起，迟迟无法切到备用源）
 * @param {string} url
 * @param {number} ms 超时毫秒
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, ms = 7000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 从远程加载学校列表（多源回退 + 缓存：GitHub raw → jsDelivr CDN，各源带超时）
 * @returns {Promise<boolean>}
 */
async function loadSchools() {
    const sources = [RULES_INDEX_URL];
    const j = toJsDelivr(RULES_INDEX_URL);
    if (j && sources.indexOf(j) === -1) sources.push(j);

    // 尝试缓存（5 分钟 TTL）
    const cacheKey = '__ics_cache_rules_index';
    try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
            const entry = JSON.parse(raw);
            if (Date.now() - entry.t < 5 * 60 * 1000) {
                const data = entry.v;
                if (data && Array.isArray(data.schools)) {
                    state.schools = data.schools;
                    console.log('[ICS] 命中规则缓存，学校数量:', state.schools.length);
                    renderSchoolSelect();
                    return true;
                }
            }
            localStorage.removeItem(cacheKey);
        }
    } catch (e) { /* ignore */ }

    let lastErr = null;
    for (const url of sources) {
        console.log('[ICS] 尝试学校列表源:', url);
        try {
            const response = await fetchWithTimeout(url);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (!data || !Array.isArray(data.schools)) throw new Error('数据格式异常');
            state.schools = data.schools;
            console.log('[ICS] 学校数量:', state.schools.length);
            // 写入缓存
            try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: data })); } catch (e) { /* ignore */ }
            renderSchoolSelect();
            return true;
        } catch (e) {
            lastErr = e;
            console.warn('[ICS] 学校列表源失败:', url, e.message);
        }
    }

    console.error('[ICS] 所有学校列表源均失败:', lastErr);
    renderSchoolSelect();
    throw new Error('无法获取学校列表。请：①用 http/https 访问（不要直接双击 file://）；②网络可能无法访问 raw.githubusercontent.com（会自动尝试 jsDelivr CDN）；③若使用代理请检查后刷新。');
}

/**
 * 把 GitHub raw 地址转换为 jsDelivr CDN 镜像地址（国内更稳定）
 * 例如：https://raw.githubusercontent.com/a/b/main/x.json
 *    → https://cdn.jsdelivr.net/gh/a/b@main/x.json
 * @param {string} githubRawUrl
 * @returns {string|null}
 */
function toJsDelivr(githubRawUrl) {
    if (!githubRawUrl) return null;
    const m = String(githubRawUrl).match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/(.+)$/);
    if (!m) return null;
    return 'https://cdn.jsdelivr.net/gh/' + m[1] + '/' + m[2] + '@' + m[3] + '/' + m[4];
}

/**
 * 渲染学校下拉选择框
 */
function renderSchoolSelect() {
    const select = elements.schoolSelect;
    if (!select) return;
    select.innerHTML = '<option value="">-- 请选择学校 --</option>';

    state.schools.forEach((school, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${school.name} (${school.system || ''})`;
        select.appendChild(option);
    });
}

/**
 * 绑定事件监听
 */
function bindEvents() {
    if (elements.schoolSelect) elements.schoolSelect.addEventListener('change', handleSchoolChange);
    if (elements.openWebviewBtn) elements.openWebviewBtn.addEventListener('click', handleOpenWebview);
    if (elements.embedLoginBtn) elements.embedLoginBtn.addEventListener('click', handleEmbedLogin);
    if (elements.openScheduleBtn) elements.openScheduleBtn.addEventListener('click', handleOpenSchedule);
    if (elements.recognizeBtn) elements.recognizeBtn.addEventListener('click', handleRecognize);
    if (elements.embedRefreshBtn) elements.embedRefreshBtn.addEventListener('click', handleEmbedRefresh);
    if (elements.bookmarkCopyBtn) elements.bookmarkCopyBtn.addEventListener('click', handleBookmarkCopy);
    if (elements.semesterStart) elements.semesterStart.addEventListener('change', handleSemesterChange);
    if (elements.downloadBtn) elements.downloadBtn.addEventListener('click', handleDownload);
    if (elements.uploadBtn) elements.uploadBtn.addEventListener('click', handleUpload);
    if (elements.copyBtn) elements.copyBtn.addEventListener('click', handleCopy);

    // 兼容：接收来自课表页(书签 onsite-extract / 用户脚本)自动回传的识别结果
    window.addEventListener('message', handleExternalMessage);
}

/**
 * 处理学校选择变化
 */
function handleSchoolChange(event) {
    const index = parseInt(event.target.value, 10);
    state.selectedSchool = (Number.isInteger(index) && index >= 0 && state.schools[index])
        ? state.schools[index] : null;

    state.courseData = [];
    state.icsFile = null;

    // 隐藏并重置后续区域
    if (elements.semesterSection) elements.semesterSection.style.display = 'none';
    if (elements.resultSection) elements.resultSection.style.display = 'none';
    if (elements.shareSection) elements.shareSection.style.display = 'none';
    hideEmbed();
    hideBookmarkPanel();
    refreshBookmark();

    const ok = !!state.selectedSchool;
    const ov = getSchoolOverride();
    if (elements.openWebviewBtn) elements.openWebviewBtn.disabled = !ok;
    if (elements.embedLoginBtn) elements.embedLoginBtn.disabled = !ok || (!!ov && ov.noEmbed);
    if (elements.recognizeBtn) elements.recognizeBtn.disabled = !ok;
    if (elements.openScheduleBtn) {
        elements.openScheduleBtn.disabled = true;
        elements.openScheduleBtn.textContent = (ov && ov.noEmbed) ? LABEL_OPEN_SCHEDULE_NOEMBED : LABEL_OPEN_SCHEDULE;
    }

    updateWebviewStatus('waiting', ok ? '等待登录…' : '等待选择学校…');
    console.log('[ICS] 已选择学校:', state.selectedSchool ? state.selectedSchool.name : '无');
}

/**
 * 取当前学校的覆盖配置（不存在返回 null）
 */
function getSchoolOverride() {
    if (!state.selectedSchool || !state.selectedSchool.id) return null;
    return SCHOOL_OVERRIDES[state.selectedSchool.id] || null;
}

/**
 * 使用外部浏览器打开登录页（仅用于登录）
 */
function handleOpenWebview() {
    const loginUrl = getLoginUrl();
    if (!loginUrl) {
        showStatus('该学校未配置登录地址', 'error');
        return;
    }
    console.log('[ICS] 外部浏览器登录:', loginUrl);

    // 窗口名携带学校 id：教务页上的“识别课表”书签可据此识别学校（window.name 跨跳转保留）
    const winName = 'ics_school_' + ((state.selectedSchool && state.selectedSchool.id) || 'ics');
    state.loginWindow = window.open(loginUrl, winName, 'width=1200,height=800');
    if (!state.loginWindow) {
        showStatus('弹出窗口被浏览器阻止，请允许弹出窗口后重试', 'error');
        return;
    }

    if (elements.webviewStatus) elements.webviewStatus.style.display = 'flex';
    updateWebviewStatus('waiting', '外部浏览器登录中：请完成登录，登录后会自动跳转到课表网站');
    if (elements.openScheduleBtn) elements.openScheduleBtn.disabled = false;

    const ov = getSchoolOverride();
    if (ov && ov.noEmbed) {
        showStatus('已用外部浏览器打开登录页（仅登录）。登录完成后请在本窗口进入个人课表页，然后点收藏栏“★ 识别课表”书签自动识别。也可点下方“登录完成 · 新窗口打开课表页”。', 'loading');
    } else {
        showStatus('已用外部浏览器打开登录页（仅登录）。登录完成后回到本页，点击“登录完成 · 在内嵌浏览器打开课表页”', 'loading');
    }
}

/**
 * 尝试把登录页直接内嵌打开（仅部分学校支持；禁止内嵌的学校已禁用此按钮）
 */
function handleEmbedLogin() {
    const loginUrl = getLoginUrl();
    if (!loginUrl) {
        showStatus('该学校未配置登录地址', 'error');
        return;
    }
    const ov = getSchoolOverride();
    if (ov && ov.noEmbed) {
        showStatus('该校登录/跳转页禁止网页内嵌（X-Frame-Options），请使用“外部浏览器登录”', 'error');
        return;
    }
    if (elements.webviewStatus) elements.webviewStatus.style.display = 'flex';
    updateWebviewStatus('waiting', '正在内嵌加载教务系统…若页面无法显示（被拒绝嵌入），请改用“外部浏览器登录”。');
    navigateEmbed(loginUrl);
}

/**
 * “登录完成”按钮：
 *  - 可内嵌学校：把登录后跳转到的课表网站放入内嵌浏览器。
 *  - 禁止内嵌学校(如 SAMEORIGIN + 需 cookie)：用新窗口(完整浏览器)打开登录后跳转页，
 *    利用浏览器内已建立的 cookie 会话完成自动登录跳转；随后引导用“★ 识别课表”书签识别。
 */
function handleOpenSchedule() {
    const ov = getSchoolOverride();
    if (ov && ov.noEmbed) {
        handleOpenScheduleNoEmbed(ov);
        return;
    }

    const base = deriveScheduleBase();
    if (!base) {
        showStatus('无法确定课表页地址', 'error');
        return;
    }
    if (elements.webviewStatus) elements.webviewStatus.style.display = 'flex';
    updateWebviewStatus('connected', '已在内嵌浏览器打开课表页');
    navigateEmbed(base);
    showStatus('已在内嵌浏览器打开课表页。请确认能看到个人课表表格后，点击“智能一键识别课表”', 'success');
}

/**
 * 禁止内嵌学校的“登录完成”流程：新窗口(带学校 id 窗口名)打开跳转页 + 展示书签识别向导
 */
function handleOpenScheduleNoEmbed(ov) {
    if (!ov || !ov.jumpUrl) {
        showStatus('该校未配置登录后跳转页地址', 'error');
        return;
    }
    // 新窗口(完整浏览器)打开登录后跳转页：利用已建立的 cookie 会话自动登录/跳转；
    // 窗口名带学校 id，书签 onsite-extract.js 可据此识别学校
    const winName = 'ics_school_' + ((state.selectedSchool && state.selectedSchool.id) || 'ics');
    window.open(ov.jumpUrl, winName);

    if (elements.webviewStatus) elements.webviewStatus.style.display = 'flex';
    updateWebviewStatus('connected', '已在新窗口打开课表登录跳转页');
    if (elements.openScheduleBtn) elements.openScheduleBtn.disabled = false;

    // 展示禁止内嵌说明 + 书签识别向导（不显示空 iframe，不使用粘贴）
    showNoEmbedNote(ov);
    showBookmarkPanel();
    showStatus('已在新窗口打开该校教务登录跳转页。请在新窗口进入个人课表页后，点收藏栏“★ 识别课表”书签，结果将自动回传并生成课表。', 'loading');
}

/**
 * 刷新内嵌浏览器
 */
function handleEmbedRefresh() {
    const frame = elements.embedFrame;
    if (!frame || !frame.src) {
        showStatus('内嵌浏览器尚未打开任何页面', 'error');
        return;
    }
    const src = frame.src;
    frame.src = src;
    showStatus('正在刷新内嵌页面…', 'loading');
}

/**
 * 让内嵌浏览器导航到指定地址
 * @param {string} url
 */
function navigateEmbed(url) {
    if (!url) return;
    showEmbed();
    if (elements.embedFrame) elements.embedFrame.src = url;
    if (elements.embedAddress) elements.embedAddress.textContent = url;
}
/* ============================ 识别 ============================ */

/**
 * 智能一键识别课表
 * 依次尝试：读取同源内嵌页面 → 跨域抓取(尽力)；仍无法读取时引导“★ 识别课表”书签（不粘贴）。
 */
async function handleRecognize() {
    if (!state.selectedSchool) {
        showStatus('请先选择学校', 'error');
        return;
    }

    if (elements.recognizeBtn) elements.recognizeBtn.disabled = true;
    if (elements.webviewStatus) elements.webviewStatus.style.display = 'flex';

    const ov = getSchoolOverride();
    // 禁止内嵌学校：无法内嵌读取，直接引导“★ 识别课表”书签识别
    if (ov && ov.noEmbed) {
        showNoEmbedNote(ov);
        showBookmarkPanel();
        updateWebviewStatus('error', '该校禁止网页内嵌：请用“★ 识别课表”书签识别');
        showStatus('该校教务页禁止网页内嵌。请打开个人课表页后，点收藏栏“★ 识别课表”书签，结果将自动回传本页。', 'error');
        if (elements.recognizeBtn) elements.recognizeBtn.disabled = false;
        return;
    }

    updateWebviewStatus('waiting', '正在识别课表…');
    showStatus('正在识别课表…', 'loading');

    // 1) 同源读取内嵌页面（少见；跨域会被浏览器拦截）
    try {
        const html = readEmbedHtml();
        if (html && await recognizeFromHtml(html)) return;
    } catch (e) {
        console.warn('[ICS] 内嵌页面识别未成功:', e.message);
    }

    // 2) 尽力尝试跨域抓取课表页（仅当学校开放 CORS 时才可行）
    try {
        const fetched = await tryFetchScheduleHtml();
        if (fetched && await recognizeFromHtml(fetched)) return;
    } catch (e) {
        console.warn('[ICS] 远程抓取不可用:', e.message);
    }

    // 3) 跨域受限 → 引导“★ 识别课表”书签（浏览器安全限制下的自动识别方式，无需粘贴）
    showBookmarkPanel();
    updateWebviewStatus('error', '无法自动读取课表页：请用“★ 识别课表”书签识别');
    showStatus('浏览器跨域限制，无法直接读取教务课表页。请在已打开的课表页点收藏栏“★ 识别课表”书签，识别结果将自动回传本页。', 'error');

    if (elements.recognizeBtn) elements.recognizeBtn.disabled = false;
}

/**
 * 尝试读取内嵌 iframe 的页面 HTML（仅同源时可读，跨域抛出异常返回 null）
 * @returns {string|null}
 */
function readEmbedHtml() {
    const frame = elements.embedFrame;
    if (!frame || !frame.src) return null;
    try {
        const doc = frame.contentDocument;
        if (!doc || doc.readyState !== 'complete') return null;
        if (!doc.body || !doc.body.innerHTML.trim()) return null;
        return doc.documentElement.outerHTML;
    } catch (e) {
        console.warn('[ICS] 无法读取内嵌页面（跨域）:', e.message);
        return null;
    }
}

/**
 * 尽力跨域抓取课表页 HTML（需要学校开放 CORS，绝大多数不可用）
 * @returns {Promise<string|null>}
 */
async function tryFetchScheduleHtml() {
    const url = deriveScheduleBase();
    if (!url) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
        const res = await fetch(url, { credentials: 'include', signal: controller.signal });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const text = decodeHtmlBytes(buf);
        return (text && text.trim().length > 200) ? text : null;
    } catch (e) {
        console.warn('[ICS] 跨域抓取失败:', e.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 对给定 HTML 运行该校提取脚本完成识别
 * @param {string} html 课表页面 HTML
 * @returns {Promise<boolean>} 是否识别成功
 */
async function recognizeFromHtml(html) {
    if (!html || !html.trim()) return false;
    console.log('[ICS] 使用 HTML 来源识别，长度:', html.length);

    updateWebviewStatus('waiting', '正在运行该校提取脚本解析…');
    showStatus('正在运行该校官方提取脚本解析课表…', 'loading');

    const scriptText = await fetchSchoolScriptText(); // 失败会抛出
    const result = await runExtractorInSandbox(html, scriptText);
    const data = extractData(result);

    if (!data || !data.length) return false;

    state.courseData = data;
    updateWebviewStatus('connected', '识别成功：共 ' + data.length + ' 门课程');
    if (elements.semesterSection) elements.semesterSection.style.display = 'block';
    hideBookmarkPanel();
    showStatus('课表识别成功，共 ' + data.length + ' 门课程。请选择学期开始时间。', 'success');
    console.log('[ICS] 识别结果:', data);
    return true;
}

/**
 * 获取学校提取脚本文本（多源并行竞速 + 缓存 + 失败降级串行重试）
 * @returns {Promise<string>}
 */
async function fetchSchoolScriptText() {
    const urls = (state.selectedSchool && state.selectedSchool.urls) || {};
    const list = [];
    [urls.github_raw_js, urls.gitcode_raw_js].forEach((u) => { if (u) list.push(u); });
    const j = toJsDelivr(urls.github_raw_js);
    if (j && list.indexOf(j) === -1) list.splice(1, 0, j);
    if (!list.length) throw new Error('该学校未配置提取脚本地址');

    const schoolId = state.selectedSchool && state.selectedSchool.id;
    const cacheKey = schoolId ? '__ics_cache_script_' + schoolId : null;

    // 尝试缓存
    if (cacheKey) {
        try {
            const raw = localStorage.getItem(cacheKey);
            if (raw) {
                const entry = JSON.parse(raw);
                if (Date.now() - entry.t < 5 * 60 * 1000) {
                    console.log('[ICS] 命中脚本缓存:', schoolId);
                    return entry.v;
                }
                localStorage.removeItem(cacheKey);
            }
        } catch (e) { /* ignore */ }
    }

    // 并行竞速：所有源同时请求，取第一个成功的
    try {
        const promises = list.map(url =>
            fetchWithTimeout(url).then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            }).then(text => {
                if (!text || !text.trim()) throw new Error('空响应');
                return text;
            })
        );
        const text = await Promise.any(promises);
        if (cacheKey) {
            try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: text })); } catch (e) { /* ignore */ }
        }
        return text;
    } catch (e) {
        console.warn('[ICS] 并行获取脚本失败，降级串行重试');
    }

    // 降级：串行重试（重试间隔 200ms）
    for (const url of list) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const res = await fetchWithTimeout(url);
                if (!res.ok) continue;
                const text = await res.text();
                if (text && text.trim()) {
                    if (cacheKey) {
                        try { localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: text })); } catch (e) { /* ignore */ }
                    }
                    return text;
                }
            } catch (e) {
                console.warn('[ICS] 脚本获取失败(重试):', url, e.message);
            }
            if (attempt === 0) await new Promise(r => setTimeout(r, 200));
        }
    }
    throw new Error('无法获取该校提取脚本（请检查网络后重试）');
}

/**
 * 在本地同源沙箱 iframe 中执行提取脚本并返回解析结果
 * @param {string} html 课表 HTML
 * @param {string} scriptText 学校提取脚本
 * @returns {Promise<Object>} 脚本返回对象（JSON 已解析）
 */
function runExtractorInSandbox(html, scriptText) {
    return new Promise((resolve, reject) => {
        const frame = document.createElement('iframe');
        frame.style.display = 'none';
        frame.setAttribute('aria-hidden', 'true');
        // srcdoc 与父页面同源：可读取其 document 并在其中执行脚本（不要加 sandbox，否则失去同源能力）
        frame.srcdoc = buildSandboxHtml(html);

        const cleanup = () => {
            if (frame.parentNode) frame.parentNode.removeChild(frame);
        };

        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('识别超时，请重试'));
        }, EMBED_TIMEOUT);

        frame.addEventListener('load', () => {
            try {
                const win = frame.contentWindow;
                // 在沙箱窗口上下文中执行学校脚本（document 为待识别的课表 HTML，来自同源内嵌页自动读取）
                win.eval(scriptText);
                const fn = (typeof win.extractSchedule === 'function')
                    ? win.extractSchedule
                    : ((typeof win.defaultExtract === 'function') ? win.defaultExtract : null);
                if (!fn) throw new Error('提取脚本中未找到 extractSchedule');

                const raw = fn();
                let parsed = raw;
                if (typeof raw === 'string') {
                    try { parsed = JSON.parse(raw); } catch (e) { throw new Error('提取脚本返回格式无法解析'); }
                }
                if (parsed && parsed.success === false) throw new Error(parsed.error || '解析失败');

                clearTimeout(timer);
                cleanup();
                resolve(parsed);
            } catch (e) {
                clearTimeout(timer);
                cleanup();
                reject(e);
            }
        });

        document.body.appendChild(frame);
    });
}

/**
 * 从提取脚本的返回结构中取出课程数组
 */
function extractData(result) {
    if (!result) return null;
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.data)) return result.data;
    return null;
}

/**
 * 构造同源沙箱 HTML（去除脚本/iframe/base/刷新跳转等干扰）
 */
function buildSandboxHtml(html) {
    let h = String(html || '').trim();
    h = h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
         .replace(/<script\b[^>]*\/>/gi, '')
         .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
         .replace(/<base\b[^>]*>/gi, '')
         .replace(/<meta\b[^>]*refresh[^>]*>/gi, '');

    if (/<html[\s>]/i.test(h)) {
        return '<!DOCTYPE html>' + h;
    }
    if (/<body[\s>]/i.test(h)) {
        return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' + h + '</html>';
    }
    // 纯片段（例如只复制了表格）
    return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' + h + '</body></html>';
}

/* ================= 内嵌/禁止内嵌显示 + 书签识别 ================= */

/**
 * 显示/隐藏内嵌浏览器区（含“禁止内嵌”提示）
 */
function showEmbed() {
    if (elements.embedCard) elements.embedCard.style.display = 'block';
    hideNoEmbedNote();
}
function hideEmbed() {
    if (elements.embedCard) elements.embedCard.style.display = 'none';
}

/**
 * 展示“该校禁止内嵌”说明：隐藏浏览器 iframe，改用书签识别
 */
function showNoEmbedNote(ov) {
    if (elements.embedCard) elements.embedCard.style.display = 'block';
    if (elements.noEmbedNote) {
        const extra = ov && ov.jumpUrl ? '\n登录地址：' + ov.jumpUrl : '';
        elements.noEmbedNote.textContent = ((ov && ov.note) || '该校禁止网页内嵌。') + extra;
        elements.noEmbedNote.style.display = 'block';
    }
    if (elements.embedBrowser) elements.embedBrowser.style.display = 'none';
    if (elements.embedAddress) elements.embedAddress.textContent = '';
}
function hideNoEmbedNote() {
    if (elements.noEmbedNote) elements.noEmbedNote.style.display = 'none';
    if (elements.embedBrowser) elements.embedBrowser.style.display = '';
}

/**
 * 书签识别面板显示/隐藏
 */
function showBookmarkPanel() {
    if (elements.embedCard) elements.embedCard.style.display = 'block';
    if (elements.bookmarkPanel) elements.bookmarkPanel.style.display = 'block';
}
function hideBookmarkPanel() {
    if (elements.bookmarkPanel) elements.bookmarkPanel.style.display = 'none';
}

/**
 * 生成“★ 识别课表”书签地址（向当前课表页注入 js/onsite-extract.js）
 * @returns {string} javascript: 书签代码
 */
function buildBookmarkHref() {
    // 注入时声明 charset=utf-8：防止在 GBK 编码的教务页(如 newjw 为 GBK)里按页面编码解码导致中文乱码；
    // 用 encodeURI：规避工具部署地址含非 ASCII 字符时书签地址出现乱码。
    const loader = SITE_BASE + 'js/onsite-extract.js';
    return "javascript:(function(){var d=document,s=d.createElement('script');s.charset='utf-8';" +
        "s.src=encodeURI('" + loader + "')+'?_='+Date.now();(d.head||d.documentElement).appendChild(s);})();";
}

/**
 * 刷新书签链接（基地址固定；提示随学校变化）
 */
function refreshBookmark() {
    const a = elements.bookmarkLink;
    if (!a) return;
    a.href = buildBookmarkHref();
    a.setAttribute('title', '拖到浏览器收藏栏；拖不动时点“复制书签代码”在收藏夹新建书签');
    const hint = elements.bookmarkHint;
    if (hint) {
        hint.textContent = state.selectedSchool
            ? '当前学校：' + state.selectedSchool.name + '（书签会用在由本工具打开的教务课表页上）'
            : '请先选择学校；书签适用于由本工具打开并登录的教务课表窗口。';
    }
}

/**
 * 复制书签代码到剪贴板（用于在收藏夹手动新建书签）
 */
function handleBookmarkCopy() {
    const a = elements.bookmarkLink;
    if (!a) return;
    const text = a.href;
    const done = (ok) => showStatus(ok
        ? '书签代码已复制，请在浏览器收藏夹“新建书签”→ 地址粘贴后保存。'
        : '复制失败，请直接把上方链接拖到收藏栏。', ok ? 'success' : 'error');

    const fallback = () => {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            done(ok);
        } catch (e) {
            done(false);
        }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => done(true)).catch(fallback);
    } else {
        fallback();
    }
}

/**
 * 解码 HTML 字节（优先 UTF-8，失败回退 GBK）
 * @param {ArrayBuffer} buf
 * @returns {string}
 */
function decodeHtmlBytes(buf) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
        try {
            return new TextDecoder('gbk').decode(buf);
        } catch (e2) {
            return new TextDecoder('utf-8').decode(buf);
        }
    }
}

/* ======================= 学校配置工具 ======================= */

function getLoginUrl() {
    const cfg = state.selectedSchool && state.selectedSchool.webview_config;
    return (cfg && cfg.login_url) || '';
}

/**
 * 由 schedule_url_pattern / login_url 推导课表页地址
 * 规则：取 pattern 中 “**” 之前的部分；无 pattern 时取 login_url 同源目录。
 */
function deriveScheduleBase() {
    const cfg = state.selectedSchool && state.selectedSchool.webview_config;
    if (!cfg) return '';
    let pattern = (cfg.schedule_url_pattern || '').trim();
    const idx = pattern.indexOf('**');
    if (idx !== -1) pattern = pattern.slice(0, idx);
    if (pattern) return pattern;

    // 兜底：登录页所在站点目录
    try {
        const u = new URL(cfg.login_url);
        return u.origin + '/';
    } catch (e) {
        return cfg.login_url || '';
    }
}

/* ====================== 兼容消息接收 ====================== */

/**
 * 兼容：接收来自教务页（Tampermonkey 用户脚本等）直接回传的数据（可选能力）
 */
function handleExternalMessage(event) {
    const d = event.data;
    if (!d || typeof d !== 'object') return;

    if (d.type === 'COURSE_DATA' && Array.isArray(d.payload)) {
        state.courseData = d.payload;
        if (elements.semesterSection) elements.semesterSection.style.display = 'block';
        hideBookmarkPanel();
        updateWebviewStatus('connected', '已获取课表数据');
        showStatus('课表识别完成，共 ' + d.payload.length + ' 门课程。请选择学期开始时间。', 'success');
    } else if (d.type === 'EXTRACTOR_ERROR') {
        const msg = (d.payload && d.payload.message) || d.message || '未知错误';
        showStatus('识别失败：' + msg, 'error');
        updateWebviewStatus('error', '识别失败');
    }
}

/* ====================== 学期 / ICS 相关 ====================== */

/**
 * 处理学期时间变化
 */
function handleSemesterChange(event) {
    const val = event.target.value;
    if (!val) return;
    state.semesterStart = new Date(val + 'T00:00:00');

    if (elements.resultSection) elements.resultSection.style.display = 'block';

    renderCourseList();
    generateICSFile();
}

/**
 * 渲染课程列表
 */
function renderCourseList() {
    const list = elements.courseList;
    if (!list) return;
    list.innerHTML = '';

    if (!state.courseData.length) {
        list.innerHTML = '<div class="course-item">未识别到课程</div>';
        return;
    }

    state.courseData.forEach((course, i) => {
        const day = WEEKDAY_NAMES[course.day] || course.day || '?';
        const time = (course.startTime || '')
            + (course.startTime && course.endTime ? ' - ' : '')
            + (course.endTime || '');

        const item = document.createElement('div');
        item.className = 'course-item';

        const name = document.createElement('div');
        name.className = 'course-name';
        name.textContent = (i + 1) + '. ' + (course.name || '未知课程');

        const detail = document.createElement('div');
        detail.className = 'course-detail';
        const parts = [];
        if (course.weeks !== undefined && course.weeks !== null && course.weeks !== '') {
            parts.push('第' + course.weeks + '周');
        }
        parts.push('星期' + day);
        if (time) parts.push(time);
        if (course.teacher) parts.push(course.teacher);
        if (course.location) parts.push(course.location);
        detail.textContent = parts.join(' | ');

        item.appendChild(name);
        item.appendChild(detail);
        list.appendChild(item);
    });
}

/**
 * 生成 ICS 文件
 */
function generateICSFile() {
    if (!state.courseData.length || !state.semesterStart) {
        return;
    }
    state.icsFile = ICSGenerator.generate(state.courseData, state.semesterStart);
    showStatus('ICS 文件已生成', 'success');
}

/**
 * 处理下载 ICS 文件
 */
function handleDownload() {
    if (!state.icsFile) {
        showStatus('请先生成 ICS 文件', 'error');
        return;
    }

    const url = URL.createObjectURL(state.icsFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = '课表.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus('文件下载已开始', 'success');
}

/**
 * 处理上传文件
 */
async function handleUpload() {
    if (!state.icsFile) {
        showStatus('请先生成 ICS 文件', 'error');
        return;
    }

    try {
        showStatus('正在上传文件...', 'loading');
        if (elements.uploadBtn) elements.uploadBtn.disabled = true;

        const result = await UploadManager.upload(state.icsFile);

        if (elements.shareSection) elements.shareSection.style.display = 'block';
        if (elements.shareUrl) {
            elements.shareUrl.value = result.url;
            
            // 判断是否为真实直链（含 /dl/ + timestamp.hash 格式）
            const isDirectLink = /\/dl\/\d+\.[a-f0-9]+\//.test(result.url);
            
            // 自动复制链接到剪贴板
            try {
                await navigator.clipboard.writeText(result.url);
                if (isDirectLink) {
                    showStatus('上传成功，直链已自动复制到剪贴板。请在苹果日历中通过"文件→导入"粘贴使用', 'success');
                } else {
                    showStatus('上传成功，链接已复制。请在浏览器打开链接点击 Download 按钮下载后导入日历', 'success');
                }
            } catch (clipboardError) {
                console.warn('自动复制失败，用户可手动复制:', clipboardError);
                if (isDirectLink) {
                    showStatus('上传成功，链接可直接用于苹果日历导入（点击复制按钮手动复制）', 'success');
                } else {
                    showStatus('上传成功，请点击复制按钮，在浏览器打开链接后下载导入', 'success');
                }
            }
        }
    } catch (error) {
        showStatus('上传失败: ' + error.message, 'error');
    } finally {
        if (elements.uploadBtn) elements.uploadBtn.disabled = false;
    }
}

/**
 * 处理复制链接
 */
function handleCopy() {
    const input = elements.shareUrl;
    if (!input) return;
    input.select();
    document.execCommand('copy');
    showStatus('链接已复制到剪贴板。请在苹果日历中通过"文件→导入"粘贴使用', 'success');
}

/**
 * 显示状态提示
 */
function showStatus(message, type) {
    if (!elements.status) return;
    elements.status.textContent = message;
    elements.status.className = 'status ' + type;
}

/**
 * 更新 WebView 状态显示
 */
function updateWebviewStatus(status, text) {
    if (elements.statusText) elements.statusText.textContent = text;
    if (!elements.statusDot) return;
    elements.statusDot.className = 'status-dot';
    if (status === 'connected') {
        elements.statusDot.classList.add('connected');
    } else if (status === 'error') {
        elements.statusDot.classList.add('error');
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', init);
