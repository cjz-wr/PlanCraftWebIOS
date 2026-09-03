# 📅 ICS 课表导入

> 一个静态网页工具，帮助用户一键识别学校课表并生成标准 ICS 日历文件。

## 📖 项目简介

**ICS 课表导入** 是一个部署在 GitHub Pages 上的静态网页应用。用户选择学校后，点击“智能一键识别课表”按钮，系统会自动从远程数据源获取学校配置并拉取对应的课表解析脚本，解析课程信息，最终生成 ICS 文件供用户下载或通过 tmpfiles.org 分享。

## ✨ 功能特性

- 🏫 **学校列表动态获取** – 从远程 `rules_index.json` 实时获取可识别的学校列表，无需手动维护
- 🔍 **智能一键识别** – 点击按钮自动拉取并执行对应学校的课表提取脚本
- 📥 **动态脚本加载** – 每次从远程仓库获取最新课表解析脚本
- 📆 **学期起始设置** – 用户选择学期开始时间（开学当周的周一）
- 📄 **ICS 文件生成** – 根据课表数据生成标准 iCalendar 格式文件
- ☁️ **云端分享** – 通过 tmpfiles.org API 上传 ICS 文件并获取分享链接

## 🛠 技术栈

| 技术 | 说明 |
|------|------|
| HTML + CSS + JavaScript | 纯静态页面，无需后端服务 |
| GitHub Pages | 静态网页托管 |
| tmpfiles.org API | 文件上传与分享 |
| 远程脚本动态加载 | 实时获取课表解析逻辑 |

## 📁 项目结构

```
ics-course-import/
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式文件
├── js/
│   ├── main.js             # 主逻辑：学校列表获取、按钮交互、ICS生成
│   ├── upload.js           # tmpfiles.org 上传封装
│   └── ics-generator.js    # ICS 文件生成器
└── README.md
```

> **注意**：学校列表不再通过本地 `schools/config.json` 维护，而是从远程 `rules_index.json` 动态获取。

## 🚀 快速开始

### 前置条件

1. **使用 HTTP 服务器**（本地测试时，不要直接打开 `index.html`）
2. 识别使用 **“★ 识别课表”书签**（无粘贴 / 无扩展）：把工具页生成的书签拖到收藏栏一次即可（见「课表识别流程」）

### 诊断测试

如果遇到问题，请先访问 `test.html` 进行诊断：

```
http://localhost:8000/test.html
```

诊断页面会检查：
- 协议类型（file:// 还是 http://）
- CORS 限制
- 网络连接
- 用户脚本状态

### 1. 安装“★ 识别课表”书签（推荐，无扩展 / 不粘贴）

打开工具页，在第 3 步“识别并生成 ICS”面板中，把 **“★ 识别课表”** 链接拖到浏览器收藏栏即可（拖不动时点“复制书签代码”在收藏夹新建书签）。使用时会向当前教务课表页注入 `js/onsite-extract.js`，在该页本地运行学校官方提取脚本并把结果自动回传到工具页。

### 2.（可选）安装用户脚本

若希望由运行在教务页里的脚本自动识别（无需每次点书签），也可安装用户脚本：

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 下载 `userscript/course-extractor.user.js` 文件
3. 在 Tampermonkey 中创建新脚本，粘贴下载的内容并保存

详细安装说明请参考 [INSTALL_GUIDE.md](INSTALL_GUIDE.md)

### 2. 本地开发

**重要**: 由于浏览器安全限制，直接打开 `index.html` 文件（`file://` 协议）会导致 CORS 错误。请使用以下方式之一：

#### 方式一：使用 VS Code Live Server（推荐）

1. 安装 [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) 扩展
2. 右键点击 `index.html`，选择 "Open with Live Server"
3. 访问 `http://127.0.0.1:5500`

#### 方式二：使用 Python HTTP 服务器

```bash
# 克隆项目
git clone https://github.com/your-username/ics-course-import.git

# 进入项目目录
cd ics-course-import

# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

访问 `http://localhost:8000`

#### 方式三：使用 Node.js HTTP 服务器

```bash
# 安装 http-server
npm install -g http-server

# 启动服务器
http-server -p 8000
```

访问 `http://localhost:8000`

### 3. 部署到 GitHub Pages

1. 将代码推送到 GitHub 仓库
2. 进入仓库 `Settings` → `Pages`
3. 选择部署分支（如 `main`）并保存
4. 访问 `https://your-username.github.io/ics-course-import/`

## 🔌 核心功能说明

### 学校列表动态获取

学校列表通过远程 `rules_index.json` 获取，地址为：

```
https://raw.githubusercontent.com/cjz-wr/PlanCraftDownload/main/rules_index.json
```

该 JSON 文件结构示例：

```json
{
  "version": 1,
  "last_updated": "2026-07-01",
  "schools": [
    {
      "id": "gdlyzyjsxy",
      "name": "广东岭南职业技术学院",
      "aliases": ["岭南学院", "广东岭南"],
      "system": "青果",
      "version": "2026.06.30",
      "urls": {
        "github_raw_js": "https://raw.githubusercontent.com/cjz-wr/PlanCraftDownload/refs/heads/main/class/gdlyzyjsxy.js",
        "gitcode_raw_js": "https://raw.gitcode.com/qq_51887218/PlanCraftDownload/raw/main/class/gdlyzyjsxy.js"
      },
      "webview_config": {
        "login_url": "https://sso.lnc.edu.cn/lyuapServer/login?service=https://newjw.lnc.edu.cn/caslogin",
        "schedule_url_pattern": "http://jwc.gdlyzyjsxy.edu.cn/schedule",
        "encoding": "GBK",
        "wait_for_element": "#schedule-table",
        "js_timeout": 10000
      }
    },
    {
      "id": "gzhualixy",
      "name": "广州华立学院",
      "aliases": ["华立学院", "广东工业大学华立学院"],
      "system": "强智",
      "version": "2026.07.01",
      "urls": {
        "github_raw_js": "https://raw.githubusercontent.com/cjz-wr/PlanCraftDownload/refs/heads/main/class/gzhualixy_qt.js",
        "gitcode_raw_js": "https://raw.gitcode.com/qq_51887218/PlanCraftDownload/raw/main/class/gzhualixy_qt.js"
      },
      "webview_config": {
        "login_url": "https://www.hltz.net/hlxy_jsxsd/",
        "schedule_url_pattern": "https://www.hltz.net/hlxy_jsxsd/**",
        "encoding": "GBK",
        "wait_for_element": "#wdkbTable",
        "js_timeout": 10000
      }
    }
  ]
}
```

**字段说明**：

| 字段 | 说明 |
|------|------|
| `id` | 学校唯一标识 |
| `name` | 学校显示名称 |
| `aliases` | 学校别名列表 |
| `system` | 教务系统类型（如青果、强智） |
| `version` | 配置版本号 |
| `urls.github_raw_js` | 课表提取脚本的 GitHub 原始地址 |
| `urls.gitcode_raw_js` | 课表提取脚本的 GitCode 镜像地址（备用） |
| `webview_config.login_url` | 学校 SSO 登录地址 |
| `webview_config.schedule_url_pattern` | 课表页面 URL 匹配模式 |
| `webview_config.encoding` | 页面编码 |
| `webview_config.wait_for_element` | 等待加载的 DOM 元素选择器 |
| `webview_config.js_timeout` | 脚本执行超时时间（毫秒） |

### 课表识别流程

1. 页面加载后，自动从 `rules_index.json` 获取学校列表并渲染到下拉选择框
2. 先安装“★ 识别课表”书签（拖到收藏栏一次）
3. 选择学校，点击 **"外部浏览器登录（仅登录）"**：SSO 等禁止内嵌的登录页会在外部浏览器窗口完成登录（仅用于登录）
4. 登录成功后教务系统会**自动跳转**到课表网站（如 sso → newjw 教务）
5. 在该教务窗口进入**个人课表页**，点一下收藏栏的 **“★ 识别课表”** 书签
6. 书签向该课表页注入 `js/onsite-extract.js`：在本页**本地运行该校官方提取脚本**（`extractSchedule`），通过 `postMessage` 把课程数据**自动回传**工具页（无需复制粘贴、数据不出浏览器）
7. 确认学期开始时间（开学当周的周一）
8. 系统根据课程信息生成 ICS 文件

> **说明**：由于 SSO/教务页多设置 `X-Frame-Options: deny / SAMEORIGIN` 且需登录 cookie 会话，纯静态页无法 iframe 内嵌读取其内容，也无法跨域注入。因此识别代码必须运行在教务页自身（书签/用户脚本），这是 GitHub Pages 上唯一可行且不需粘贴/扩展的方式。

### ICS 文件生成

- 课程时间根据学期开始时间自动计算偏移
- 输出符合 RFC 5545 标准的 `.ics` 文件
- 支持日历软件（如 Apple 日历、Google 日历、Outlook）直接导入

### 文件上传（tmpfiles.org）

生成 ICS 文件后，用户可选择上传获取分享链接：

**API 端点**：`POST https://tmpfiles.org/api/v1/upload`

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | ✅ | 要上传的文件，最大 100 MB |
| `expire` | Number | ❌ | 删除倒计时（秒），范围 60–172800，默认 3600 |

**响应示例**：

```json
{
  "status": "success",
  "data": {
    "url": "https://tmpfiles.org/{id}/{name}"
  }
}
```

**前端调用示例**：

```javascript
const formData = new FormData();
formData.append('file', icsFile);
formData.append('expire', 86400); // 24小时后删除

const response = await fetch('https://tmpfiles.org/api/v1/upload', {
  method: 'POST',
  body: formData
});
const result = await response.json();
console.log(result.data.url); // 分享链接
```

## 📋 开发计划

- [ ] 页面加载时从 `rules_index.json` 获取学校列表
- [ ] 学校下拉选择框动态渲染
- [ ] 根据选中学校获取对应的脚本 URL
- [ ] 实现远程脚本动态加载与执行
- [ ] 课表数据解析与课程对象标准化
- [ ] 学期开始时间选择器
- [ ] ICS 文件生成器
- [ ] tmpfiles.org 上传集成
- [ ] 错误处理与用户提示优化
- [ ] 响应式适配移动端

## 🤝 贡献指南

1. Fork 本仓库
2. 新建功能分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'Add xxx'`)
4. 推送到分支 (`git push origin feature/xxx`)
5. 提交 Pull Request

## 📄 许可证

[MIT License](LICENSE)

---

> **注意**：课表提取脚本来自外部仓库 `cjz-wr/PlanCraftDownload`，请确保脚本来源可信。tmpfiles.org 上传功能依赖第三方服务，上传前请确认文件内容不包含敏感信息。