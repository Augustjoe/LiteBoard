# SchemaV (LiteBoard) — 超级探针体验升维与全局数据合并机制重构 · 切片报告

> **生成时间**：2026-05-19  
> **重构范围**：Store、DataProbe、EditorView  
> **TypeScript 类型检查**：✅ `vue-tsc --noEmit` 零错误通过  

---

## 📦 阶段 1：依赖安装

### 新增依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| [`vue-codemirror`](schemav-frontend/package.json:21) | ^6.1.1 | CodeMirror 6 的 Vue 3 官方封装，所有 JSON/JS 输入的标准组件 |
| [`@codemirror/lang-javascript`](schemav-frontend/package.json:12) | ^6.2.5 | JS 语法高亮与自动补全（JS 过滤器） |
| [`@codemirror/lang-json`](schemav-frontend/package.json:13) | ^6.0.2 | JSON 语法高亮与校验（输入区、只读预览、全量编辑） |
| [`@codemirror/theme-one-dark`](schemav-frontend/package.json:14) | ^6.1.3 | 深色编辑器主题 |

### 已存在依赖（无需重复安装）

| 包名 | 说明 |
|------|------|
| `lodash-es` | 深度合并算法，已存在 |
| `@types/lodash-es` | TypeScript 类型定义，已存在 |

---

## 🧠 阶段 2：Store 合并与替换机制

### 文件：[`editorStore.ts`](schemav-frontend/src/stores/editorStore.ts)

#### 变更摘要

| 变更项 | 旧 | 新 |
|--------|-----|-----|
| import | 无 lodash-es | `import { merge } from 'lodash-es'` |
| 更新方法 | `updateGlobalData(data)` — 直接覆盖 | **已删除** |
| 增量合并 | 无 | `mergeGlobalData(data)` — `null` 时赋值，否则 `merge({}, old, new)` |
| 全量替换 | 无 | `replaceGlobalData(data)` — 完全覆盖 |

#### 新增 Action 详述

```typescript
// 增量合并（v2 核心机制）
function mergeGlobalData(data: Record<string, any>): void {
  if (globalData.value === null) {
    globalData.value = data
  } else {
    globalData.value = merge({}, globalData.value, data) as Record<string, any>
  }
}

// 全量替换（编辑弹窗专用）
function replaceGlobalData(data: Record<string, any>): void {
  globalData.value = data
}
```

> `mergeGlobalData` 与 `replaceGlobalData` 均已导出至 Store 的 return 对象中。

---

## 🎨 阶段 3：超级探针弹窗一站式重构

### 文件：[`DataProbe.tsx`](schemav-frontend/src/components/DataProbe.tsx) + [`DataProbe.css`](schemav-frontend/src/components/DataProbe.css)

#### 架构变更：取消分步 → 上下分栏

| 维度 | v1（旧） | v2（新） |
|------|----------|----------|
| 交互模式 | 分两步：① 获取数据 → ② 过滤/保存 | 一站式上下分栏 |
| Props | `visible` + `onClose` + `onSaved` | `visible` + `onClose`（不再需要 `onSaved`，内部直接调 `store.mergeGlobalData`） |
| 手动输入 | `<el-input type="textarea">` | **`vue-codemirror`（JSON 语言 + oneDark 主题）** |
| 原始数据预览 | `<pre>` 标签 | **`vue-codemirror`（JSON 语言，`disabled` 只读）** |
| JS 过滤器 | `<el-input type="textarea">` | **`vue-codemirror`（JavaScript 语言 + oneDark 主题）** |
| 保存按钮 | "执行并覆盖全局数据"（调 `updateGlobalData`） | **"执行并合并至全局数据"（调 `store.mergeGlobalData`）** |
| 格式化按钮 | 无 | **右上角 `{} 格式化 JSON`** |
| 错误提示 | 纯文本 `<div>` | **`ElMessage` + `dangerouslyUseHTMLString` 加粗关键字** |

#### 布局结构

```
┌─────────────────────────────────────────────┐
│  📥 输入源                                   │
│  ┌─ 📡 远程获取 ──┐ ┌─ ✍️ 手动添加 ────────┐ │
│  │ URL + Method   │ │ [{} 格式化 JSON]     │ │
│  │ Headers 管理   │ │ ┌───────────────────┐ │ │
│  │ Body (POST)    │ │ │  CodeMirror JSON  │ │ │
│  │ [发送探针]     │ │ └───────────────────┘ │ │
│  └────────────────┘ │ [校验并载入原始数据]  │ │
│                      └──────────────────────┘ │
├─────────────────────────────────────────────┤
│  📊 数据预览与过滤                            │
│  ┌─ 📦 原始数据(只读) ─┐ ┌─ 🧹 JS 过滤器 ─┐ │
│  │  CodeMirror JSON    │ │  CodeMirror JS  │ │
│  │  (disabled)         │ │                 │ │
│  └─────────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────┤
│                        [取消] [执行并合并至全局数据] │
└─────────────────────────────────────────────┘
```

#### UI 规范

- 弹窗内容区 `height: 72vh`，Flex 纵向布局，`overflow: hidden` 严禁触发外层滚动
- CodeMirror 组件通过 `.probe-codemirror-wrapper` 包裹，`flex: 1; min-height: 0; overflow: hidden`，内部 `.cm-scroller { overflow: auto }` 独立滚动
- 下半区左右平分：`flex: 1 1 50%`

---

## ⚙️ 阶段 4：直接编辑全局数据

### 文件：[`EditorView.tsx`](schemav-frontend/src/views/EditorView.tsx)

#### 新增功能

| 功能 | 位置 | 描述 |
|------|------|------|
| **✏️ 编辑数据 按钮** | 左侧面板"🌐 全局数据"区域 | 仅在 `globalData !== null` 时显示 |
| **全量编辑弹窗** | 新 `<el-dialog>` | `title="✏️ 全量编辑全局数据"` |
| **JSON 编辑器** | 弹窗内 `vue-codemirror` | JSON 语言 + oneDark 主题，初始值为 `store.globalData` 序列化字符串 |
| **格式化按钮** | 弹窗底部左侧 | 调用 `JSON.parse` → `JSON.stringify` 美化 |
| **保存并全量替换** | 弹窗底部右侧 | 校验 JSON 格式 → 调用 `store.replaceGlobalData(parsed)` → `ElMessage.success` |

#### 左侧面板按钮布局

```
🌐 全局数据
├── ✅ 全局数据已挂载
├── 📋 数据预览（只读 textarea）
├── [🔄 重新获取数据]   → 打开 DataProbe
└── [✏️ 编辑数据]       → 打开全量编辑弹窗  ← 新增
```

#### DataProbe 调用变更

- 移除了 `onSaved` prop（DataProbe 内部直接调用 `store.mergeGlobalData`）
- `EditorView` 不再需要 `onProbeSaved` 回调

---

## 📂 最终项目结构

```
schemav-frontend/src/
├── components/
│   ├── ChartConfigPanel.tsx
│   ├── ChartRenderer.tsx
│   ├── ComponentWrapper.tsx
│   ├── DataProbe.tsx          ← 🔄 重写（上下分栏 + vue-codemirror）
│   ├── DataProbe.css          ← 🔄 更新（80vh Flex 布局）
│   ├── EditorHeader.tsx
│   └── HelloWorld.tsx
├── stores/
│   └── editorStore.ts         ← 🔄 mergeGlobalData / replaceGlobalData（lodash-es merge）
├── views/
│   ├── EditorView.tsx         ← 🔄 新增编辑按钮 + 全量编辑弹窗
│   ├── EditorView.css
│   ├── TaskHubView.tsx
│   └── TaskHubView.css
├── utils/
│   ├── codeGenerator.ts
│   └── dataHelper.ts
├── router/
│   └── index.ts
├── App.tsx
├── main.ts
└── style.css
```

---

## 🔑 Store Action 速查表

| Action | 签名 | 行为 |
|--------|------|------|
| `mergeGlobalData` | `(data: Record<string, any>) => void` | `globalData` 为 `null` 时直接赋值；否则 `lodash-es merge` 深度合并 |
| `replaceGlobalData` | `(data: Record<string, any>) => void` | 全量覆盖 `globalData`（编辑弹窗专用） |

---

## 🧪 验证结果

```bash
$ npx vue-tsc --noEmit
# ✅ Exit code 0，零类型错误
```

---

## 📋 组件依赖关系图

```
EditorView
├── EditorHeader
├── DataProbe (弹窗)
│   ├── Codemirror (vue-codemirror) ×3
│   │   ├── @codemirror/lang-json
│   │   ├── @codemirror/lang-javascript
│   │   └── @codemirror/theme-one-dark
│   └── useEditorStore().mergeGlobalData()
├── ChartRenderer
├── ChartConfigPanel
└── 全量编辑弹窗 (内联)
    ├── Codemirror (vue-codemirror) ×1
    │   ├── @codemirror/lang-json
    │   └── @codemirror/theme-one-dark
    └── useEditorStore().replaceGlobalData()
```

---

*报告结束。所有阶段重构已完成，`vue-tsc` 类型检查零错误通过。*
