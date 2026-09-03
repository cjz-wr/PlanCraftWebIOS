# 目录结构说明

## 项目目录树

```
PlanCraftWebIOS/
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式文件
├── js/
│   ├── main.js             # 主逻辑：学校列表获取、按钮交互、ICS生成
│   ├── upload.js           # tmpfiles.org 上传封装
│   └── ics-generator.js    # ICS 文件生成器
├── AGENTS.md               # AI 开发规范
├── plan.md                 # 开发计划
├── tree.md                 # 目录结构说明（本文件）
├── decision.md             # 工程决策日志
├── .gitignore              # Git 忽略规则
└── readme.md               # 项目说明文档（用户提供的需求来源）
```

## 文件职责说明

### 核心代码文件

| 文件 | 职责 |
|------|------|
| `index.html` | 主页面，包含学校选择、时间选择、按钮交互等 UI |
| `css/style.css` | 页面样式，响应式布局 |
| `js/main.js` | 主逻辑，协调各模块工作 |
| `js/upload.js` | 封装 tmpfiles.org 文件上传功能 |
| `js/ics-generator.js` | 生成符合 RFC 5545 标准的 ICS 文件 |

### 项目文档文件

| 文件 | 职责 |
|------|------|
| `AGENTS.md` | AI 助手开发行为规范 |
| `plan.md` | 开发计划与进度跟踪 |
| `tree.md` | 目录结构说明（本文件） |
| `decision.md` | 关键工程决策记录 |
| `readme.md` | 项目需求来源（用户提供） |

### 配置文件

| 文件 | 职责 |
|------|------|
| `.gitignore` | Git 版本控制忽略规则 |

## 模块依赖关系

```
main.js
├── 依赖 upload.js（文件上传功能）
└── 依赖 ics-generator.js（ICS 生成功能）
```

## 设计原则

1. **单一职责**: 每个文件只负责一个功能模块
2. **模块化**: 功能模块间通过清晰的接口通信
3. **可维护性**: 文件结构清晰，便于后续维护
4. **可扩展性**: 便于添加新学校的支持