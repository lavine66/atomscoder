# AtomsCoder - AI 驱动的代码生成工具

<p align="center">
  <strong>用自然语言描述你的想法，AI 帮你生成完整的 Web 应用代码</strong>
</p>

---

## 📖 项目简介

AtomsCoder 是一款 AI 驱动的代码生成工具，类似于 Atoms.dev。用户只需用自然语言描述想要构建的应用，AI 会自动生成完整的 HTML/CSS/JavaScript 代码，并提供实时预览、代码编辑、版本管理和一键发布功能。

## ✨ 功能特性

- 🤖 **AI 代码生成** — 通过对话式交互，AI 自动生成完整的 Web 应用代码
- 👁️ **实时预览** — 在安全的 iframe 沙箱中即时预览生成的应用
- 📁 **文件管理** — 完整的文件树视图，支持多文件项目结构
- ✏️ **代码编辑** — 内置语法高亮代码编辑器，支持手动修改代码
- 📜 **版本历史** — 自动保存每次生成的版本，支持一键回滚
- 🚀 **一键发布** — 将应用发布到公开 URL，方便分享展示
- 🔐 **用户认证** — 完整的注册/登录系统，项目数据安全隔离
- 🔄 **模型降级** — 自动模型降级机制，确保 AI 服务高可用

## 🛠️ 技术栈

### 前端
- **React 18** + **TypeScript** — 现代化前端框架
- **Vite** — 极速构建工具
- **Tailwind CSS** — 原子化 CSS 框架
- **shadcn/ui** — 高质量 UI 组件库
- **React Router** — 客户端路由

### 后端
- **Atoms Cloud** — 全托管后端服务
  - Auth（用户认证）
  - Database（PostgreSQL 数据库）
  - Edge Functions（无服务器函数）
  - Object Storage（对象存储）
  - AI Hub（AI 模型调用）

### AI 模型
- **claude-opus-4.6**（主模型）— 最优代码生成质量
- **deepseek-v4-pro**（备选）— 高性价比
- **gpt-5.4**（备选）— 通用备选方案

## 📂 项目结构

```
app/
├── backend/                    # 后端代码
│   ├── routers/
│   │   ├── ai_generate.py     # AI 代码生成接口（流式输出）
│   │   ├── publish.py         # 项目发布接口
│   │   ├── projects.py        # 项目 CRUD
│   │   ├── conversations.py   # 对话管理
│   │   ├── project_files.py   # 文件管理
│   │   └── versions.py        # 版本管理
│   ├── services/
│   │   ├── aihub.py           # AI Hub 服务封装
│   │   └── object_storage.py  # 对象存储服务
│   ├── models/                # 数据模型
│   ├── core/                  # 核心配置
│   └── main.py               # 应用入口
├── frontend/                  # 前端代码
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Index.tsx      # 首页 + 项目仪表盘
│   │   │   ├── Workspace.tsx  # 工作区主页面
│   │   │   └── AuthCallback.tsx # 认证回调
│   │   ├── components/
│   │   │   └── workspace/
│   │   │       ├── ChatPanel.tsx      # 对话面板
│   │   │       ├── PreviewPanel.tsx   # 预览面板
│   │   │       ├── CodeEditor.tsx     # 代码编辑器
│   │   │       ├── FileTree.tsx       # 文件树
│   │   │       ├── VersionHistory.tsx # 版本历史
│   │   │       └── WorkspaceHeader.tsx # 工作区头部
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx # 认证上下文
│   │   ├── lib/
│   │   │   ├── client.ts     # Atoms Cloud SDK 客户端
│   │   │   └── api.ts        # API 请求封装
│   │   └── App.tsx           # 路由配置
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## 🚀 部署指南

### 前置要求

- Node.js >= 18
- pnpm >= 8
- Atoms Cloud 账户（用于后端服务）

### 前端部署

#### 1. 安装依赖

```bash
cd frontend
pnpm install
```

#### 2. 配置环境变量

前端通过 `src/lib/client.ts` 连接 Atoms Cloud 后端。确保以下配置正确：

```typescript
// src/lib/client.ts
// SDK 会自动读取 Atoms Cloud 项目配置
```

#### 3. 启动开发服务器

```bash
pnpm run dev
```

应用将在 `http://localhost:5173` 启动。

#### 4. 构建生产版本

```bash
pnpm run build
```

构建产物输出到 `dist/` 目录，可部署到任何静态托管服务。

#### 5. 代码检查

```bash
pnpm run lint
```

### 后端配置

AtomsCoder 使用 Atoms Cloud 作为后端，需要配置以下服务：

#### 数据库表

项目使用以下数据库表（通过 Atoms Cloud 自动管理）：

| 表名 | 说明 |
|------|------|
| `projects` | 用户项目信息 |
| `conversations` | 对话历史记录 |
| `project_files` | 项目文件内容 |
| `versions` | 版本快照 |

#### 对象存储

- **Bucket**: `published-projects` — 存储已发布项目的静态文件

#### AI 服务

后端通过 Atoms Cloud AI Hub 调用大语言模型进行代码生成，支持自动降级：
1. claude-opus-4.6（首选）
2. deepseek-v4-pro（备选）
3. gpt-5.4（兜底）

#### Edge Functions

- `/api/v1/ai/generate` — AI 代码生成（SSE 流式响应）
- `/api/v1/publish` — 项目发布到公开 URL

## 📖 使用说明

### 1. 注册/登录

访问应用首页，点击「开始使用」按钮进行注册或登录。支持邮箱注册和第三方登录。

### 2. 创建项目

登录后进入项目仪表盘，点击「新建项目」按钮，输入项目名称创建新项目。

### 3. 对话生成代码

进入项目工作区后，在左侧对话面板中用自然语言描述你想要构建的应用，例如：

> "帮我创建一个待办事项应用，支持添加、删除和标记完成"

AI 会自动生成完整的 HTML、CSS 和 JavaScript 代码。

### 4. 预览和编辑

- **预览面板**：右侧实时显示生成的应用效果
- **代码编辑器**：查看和手动修改生成的代码
- **文件树**：浏览项目的所有文件

### 5. 版本管理

每次 AI 生成代码都会自动保存为一个版本。你可以：
- 查看版本历史列表
- 对比不同版本的差异
- 一键回滚到任意历史版本

### 6. 发布应用

点击工作区顶部的「发布」按钮，应用将被部署到公开 URL，你可以将链接分享给任何人。

## 🔧 开发指南

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/lavine66/atomscoder.git
cd atomscoder

# 安装前端依赖
cd frontend
pnpm install

# 启动开发服务器
pnpm run dev
```

### 代码规范

- 使用 ESLint 进行代码检查
- 遵循 TypeScript 严格模式
- 组件使用函数式组件 + Hooks
- 样式使用 Tailwind CSS 工具类

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

<p align="center">
  Built with ❤️ using <a href="https://atoms.dev">Atoms</a>
</p>