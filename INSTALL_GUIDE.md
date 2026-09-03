# ICS 课表导入工具 - 安装指南

> **主识别方式：无扩展 / 不粘贴**：登录（外部浏览器，仅登录）→ 跳转到教务课表页 → 点一下“★ 识别课表”书签 → 自动回传识别。书签需安装一次（拖到收藏栏）。可选增强：Tampermonkey 用户脚本自动识别。
> 以下用户脚本为**可选增强**：在教务页内自动识别并回传结果。

## 前置条件

### 1. 安装用户脚本管理器

由于浏览器安全限制，无法直接从网页向教务系统注入脚本。需要使用用户脚本管理器来执行课表提取脚本。

推荐使用以下用户脚本管理器：

- **Tampermonkey**（推荐）
  - [Chrome 版本](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
  - [Firefox 版本](https://addons.mozilla.org/firefox/addon/tampermonkey/)
  - [Edge 版本](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
  - [Safari 版本](https://apps.apple.com/app/tampermonkey/id1482490089)

- **Violentmonkey**
  - [Chrome 版本](https://chrome.google.com/webstore/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag)
  - [Firefox 版本](https://addons.mozilla.org/firefox/addon/violentmonkey/)

### 2. 安装 ICS 课表提取器脚本

安装用户脚本管理器后，需要安装 ICS 课表提取器脚本。

#### 方法一：从文件安装

1. 下载 `userscript/course-extractor.user.js` 文件
2. 打开 Tampermonkey 控制台
3. 点击"+"号创建新脚本
4. 将下载的文件内容粘贴到编辑器中
5. 保存脚本

#### 方法二：从 URL 安装（推荐）

1. 将项目部署到 GitHub Pages
2. 访问 `https://<username>.github.io/<repo>/userscript/course-extractor.user.js`
3. Tampermonkey 会自动提示安装

## 使用步骤

### 第一步：打开 ICS 课表导入工具

1. 打开 `index.html` 或访问 GitHub Pages 部署地址
2. 从下拉框选择你的学校

### 第二步：安装“★ 识别课表”书签（只需一次）

1. 在“识别并生成 ICS”面板，把 **“★ 识别课表”** 链接拖到浏览器收藏栏
2. 拖不动时点“复制书签代码”，在收藏夹“新建书签”→ 地址粘贴后保存

### 第三步：登录教务系统

1. 点击“外部浏览器登录（仅登录）”按钮（SSO 登录页通常禁止内嵌）
2. 在外部浏览器窗口中完成登录
3. 登录成功后教务系统会自动跳转到课表网站（如 sso → newjw 教务）

### 第四步：书签识别课表

1. 在该教务窗口进入**个人课表页**
2. 点一下收藏栏的 **“★ 识别课表”** 书签：工具会在该页本地运行该校官方提取脚本并**自动回传**本页
3. 识别成功后会显示课程列表

### 第五步：生成 ICS 文件

1. 选择学期开始时间（开学当周的周一）
2. 查看识别结果
3. 点击“下载 ICS 文件”或“上传获取分享链接”

## 常见问题

### Q: 为什么用书签，不装扩展也能识别？

A: 由于浏览器的同源策略，网页无法向其他域名的教务页注入脚本，而 SSO/教务页又多设置 `X-Frame-Options`（DENY/SAMEORIGIN），无法 iframe 内嵌。书签是一次性收藏的 `javascript:` 代码，在你点它时把 `js/onsite-extract.js` 加载进“已登录的课表页”，在该页本地运行学校官方提取脚本，再经 `postMessage` 自动回传工具页——无需扩展、无需复制粘贴、数据不出浏览器。

### Q: 需要安装用户脚本吗？

A: **默认不需要**。书签即可完成识别（每课表页点一下）。若希望全程自动（登录后在教务页自动识别），可再安装 Tampermonkey 用户脚本（可选增强）。

### Q: 用户脚本安全吗？

A: 用户脚本在本地执行，不会上传任何数据到服务器。但请确保从可信来源获取脚本，避免安装来路不明的脚本。

### Q: 提取失败怎么办？

A: 可能的原因：
1. 教务系统页面结构发生变化
2. 网络连接问题
3. 脚本版本过旧

解决方案：
1. 检查用户脚本是否已安装并启用
2. 确保已登录并进入课表页面
3. 刷新页面重试
4. 检查浏览器控制台是否有错误信息

### Q: 支持哪些浏览器？

A: 支持所有主流浏览器：
- Chrome（推荐）
- Firefox
- Edge
- Safari

需要安装对应的用户脚本管理器扩展。

## 技术说明

### 通信流程（书签 / 可选用户脚本）

```
ICS 课表导入工具 (index.html，GitHub Pages)
    │ window.open(url, 'ics_school_<学校id>')   ← 窗口名携带学校 id
    ▼
教务登录页(SSO) —— 用户登录 —— 自动跳转 ——> 教务课表网站
    │
    │ 用户点“★ 识别课表”书签，向课表页注入 js/onsite-extract.js
    ▼
课表页（本地运行该校官方提取脚本 extractSchedule）
    ▲
    │ postMessage({type:'COURSE_DATA', payload}) → window.opener（工具页）
ICS 课表导入工具：收到课程数据 → 选择学期 → 生成 ICS → 下载/分享
```

### 安全限制

- **X-Frame-Options**: SSO/教务页多设置 `DENY / SAMEORIGIN`，无法 iframe 内嵌
- **同源策略**: 网页无法向其他域名的页面注入脚本
- **方案**: 书签在“已登录课表页”本地运行官方提取脚本（可选：Tampermonkey 用户脚本自动触发）

## 更新日志

### v1.0.0 (2026-09-03)
- 初始版本
- 支持学校列表动态获取
- 支持课表数据提取
- 支持 ICS 文件生成
- 支持文件上传分享
