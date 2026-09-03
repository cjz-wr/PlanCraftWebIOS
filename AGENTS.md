# AGENTS.md

## AI 开发规范

本文件定义 AI 助手在本项目中的开发行为规范。

## 项目概述

**ICS 课表导入** 是一个纯静态网页应用，部署在 GitHub Pages 上，用于帮助用户一键识别学校课表并生成标准 ICS 日历文件。

## 技术栈

- HTML5
- CSS3
- JavaScript (ES6+)
- GitHub Pages 部署

## 开发规范

### 1. 代码风格

- 使用 ES6+ 语法
- 采用模块化设计
- 变量命名使用 camelCase
- 常量命名使用 UPPER_SNAKE_CASE
- 添加必要的注释说明

### 2. 文件组织

- 按功能模块划分目录
- 保持文件职责单一
- 避免文件过大（建议不超过 300 行）

### 3. 错误处理

- 使用 try-catch 处理异步操作
- 提供友好的用户错误提示
- 记录关键操作的日志

### 4. Git 提交规范

- 使用 Conventional Commits 格式
- 每次提交只包含一个逻辑单元
- 提交信息清晰描述变更内容

### 5. 测试要求

- 静态页面在主流浏览器中正常显示
- 功能逻辑正确执行
- 错误场景有合理处理

## 禁止事项

- 不得引入后端依赖
- 不得修改 `readme.md` 的核心需求
- 不得引入不必要的第三方库
- 不得存储敏感信息

## 参考资源

- 远程学校列表: `https://raw.githubusercontent.com/cjz-wr/PlanCraftDownload/main/rules_index.json`
- tmpfiles.org API: `POST https://tmpfiles.org/api/v1/upload`