# SchemaV (LiteBoard) — 状态切片报告

> **切片时间**: 2026-05-18  
> **版本标签**: `v2.0-data-lake`  
> **主题**: 双模探针弹窗 + 全局数据湖改造

---

## 📂 项目目录树

```text
LiteBoard/
├── AI_CONTEXT.md                          # 项目全局架构锚点
├── report.md                              # 本报告
├── schemav-frontend/                      # 前端 Vue 3 + TSX + Pinia
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChartConfigPanel.tsx       # 右侧图表配置面板（双向绑定）
│   │   │   ├── ChartRenderer.tsx          # 画布渲染分发器
│   │   │   ├── ComponentWrapper.tsx       # 高阶包装器（拖拽/缩放/防崩溃兜底）✅ 已改造
│   │   │   ├── DataProbe.css              # 探针样式（保留但不再导入）
│   │   │   ├── DataProbe.tsx              # 双模超级探针弹窗 ✅ 完全重写
│   │   │   ├── EditorHeader.tsx           # 顶部工具栏
│   │   │   └── HelloWorld.tsx             # 初始默认组件
│   │   ├── stores/
│   │   │   └── editorStore.ts             # 全局 Pinia Store ✅ 已升级数据湖
│   │   ├── utils/
│   │   │   ├── codeGenerator.ts           # 出码引擎
│   │   │   └── dataHelper.ts              # 双模数据清洗引擎
│   │   ├── views/
│   │   │   ├── EditorView.css             # 编辑器主布局样式 ✅ 新增资产超市样式
│   │   │   ├── EditorView.tsx             # 编辑器主视图 ✅ 左侧改为资产超市
│   │   │   ├── TaskHubView.css            # 任务大厅样式
│   │   │   └── TaskHubView.tsx            # 任务大厅视图
│   │   ├── router/
│   │   │   └── index.ts                   # 路由配置
│   │   ├── assets/                        # 静态资源
│   │   ├── App.tsx                        # 根组件
│   │   └── main.ts                        # 入口（挂载 Router/Pinia/ElementPlus）
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
└── schemav-server/                        # 后端 Node.js + Express
    ├── controllers/
    │   ├── mockController.ts
    │   ├── probeController.ts              # 探针中转层 ✅ 支持 headers/body 转发
    │   └── taskController.ts
    ├── routes/
    │   └── api.ts
    ├── utils/
    │   ├── compiler.ts
    │   └── requestUtil.ts                  # HTTP 请求工具 ✅ 支持自定义 headers/body
    ├── data/
    │   └── tasks.json
    ├── app.ts
    └── package.json
```

---

## 🧠 核心 Store 状态 (Pinia: `useEditorStore`)

| 状态字段 | 类型 | 说明 |
|---|---|---|
| `currentTaskId` | `string \| null` | 当前编辑的任务 ID |
| `title` | `string` | 大屏标题 |
| `assets` | `DataAsset[]` | **数据湖资产列表** |
| `components` | `ComponentInstance[]` | 画布上的组件实例 |
| `selectedComponentId` | `string \| null` | 当前选中的组件 ID |
| `isFullscreenPreview` | `boolean` | 全屏预览模式 |

### `DataAsset` 接口（数据湖重构后）

```typescript
export interface DataAsset {
  id: string        // 资产唯一 ID
  name: string      // 用户自定义名称
  fields: string[]  // 清洗后保留的可用字段列表
  data: any         // 🔥 数据湖核心：直接全量存储，可以是 Array / Object / 任意复杂结构
}
```

**关键变更**: `data` 字段类型从 `Record<string, unknown>[]` 改为 `any`，彻底废弃旧的单维数组限制。后端返回的复杂对象或用户粘贴的任意 JSON 均可原封不动存入。

### `addAsset()` 方法（完善后）

```typescript
function addAsset(asset: DataAsset): void {
  const id = asset.id || generateAssetId()
  const entry: DataAsset = { ...asset, id }
  const existingIdx = assets.value.findIndex((a) => a.id === id)
  if (existingIdx !== -1) {
    assets.value[existingIdx] = entry  // 覆盖更新
  } else {
    assets.value.push(entry)           // 新增
  }
}
```

**已清理的陈旧逻辑**: 旧版 `rawData` / `setRawData` 等字段已完全不存在于当前 Store 中。

---

## ✅ 已完成功能列表

### 📦 阶段 1：Store 数据湖升级
- [x] `DataAsset.data` 类型改为 `any`
- [x] `addAsset()` 方法完善（支持 id 自动生成 + 覆盖更新）
- [x] 确认无旧版 `rawData` / `setRawData` 残留

### 🎨 阶段 2：左侧资产超市 UI
- [x] `EditorView.tsx` 左侧面板不再直接渲染探针
- [x] 顶部醒目 `el-button type="primary" icon="Plus"`「添加数据资产」按钮
- [x] 资产列表以卡片式 (`asset-card`) 展示，含名称、ID、字段数、数据类型
- [x] 无资产时显示 `<el-empty>` 提示
- [x] `EditorView.css` 新增 `.asset-market` / `.asset-card` 样式
- [x] 单击「添加数据资产」打开 DataProbe 弹窗

### 📡 阶段 3：双模超级探针弹窗
- [x] `DataProbe.tsx` 完全重写为 `<el-dialog>` 弹窗模式
- [x] `<el-tabs>` 分两个页签：【📡 远程获取】和【✍️ 手动添加】
- [x] **远程获取页签**: URL 输入 + Method 切换 (GET/POST) + 动态 Headers Key-Value + POST Body 文本区
- [x] **手动添加页签**: 大文本框粘贴 JSON，`JSON.parse` 校验
- [x] **统一入库**: 底部资产名称输入 + 「保存为数据资产」按钮
- [x] 远程模式把 `headers` / `body` 一并发送到 Node 中转层 `/api/probe`
- [x] Node 层 `probeController.ts` 接收并转发 `headers` / `body`
- [x] Node 层 `requestUtil.ts` 支持自定义 headers 和 POST body 转发
- [x] 弹窗关闭时自动重置所有状态

### 🛡️ 阶段 4：图表渲染防崩溃兜底
- [x] `ComponentWrapper.tsx` 新增 `chartBlockReason` computed（区分 no_binding / no_asset / complex_object / empty）
- [x] 当 `asset.data` 不是 `Array` 时，`chartOption` 返回 `null`
- [x] Fallback UI 显示：「数据格式为复杂对象，请等待右侧数据映射器配置」
- [x] 其他原因分别显示对应的提示文案

### 🔗 基础设施
- [x] 安装 `vue-router` 依赖，解决 TS 类型检查问题
- [x] `vue-tsc --noEmit` 零错误通过
- [x] `vite build` 构建成功

---

## 🗺️ 数据流全景

```
用户操作                        数据流向
──────────                      ──────────
[添加数据资产] 按钮              → 打开 DataProbe 弹窗
  ├─ 📡 远程获取                 → /api/probe (Node 中间层) → 目标 URL → 返回原始 JSON
  │   └─ headers/body 透传      → probeController → requestUtil.fetchData()
  └─ ✍️ 手动粘贴 JSON            → 客户端 JSON.parse 校验

[保存为数据资产]                  → store.addAsset({ id, name, fields, data: rawData })
  └─ data 原封不动存入 (any 类型)

[图表组件绑定 assetId]            → ComponentWrapper.chartOption computed
  └─ chartBlockReason 检测
      ├─ complex_object          → 返回 null → Fallback: "数据格式为复杂对象..."
      └─ Array                   → 生成 ECharts option → 渲染图表
```

---

## 🔮 后续规划建议

1. **数据映射器 (`dataHelper.ts` 扩展)**: 当前 `dataHelper.ts` 提供了 `findValidPaths` / `extractCleanData` 等 ETL 工具，但这些逻辑尚在旧版 DataProbe 中。后续可在右侧配置面板或独立的映射器组件中，根据图表类型从数据湖的复杂对象中按路径提取所需子集。

2. **后端 `requestUtil.ts`**: 当前已支持自定义 headers 和 body 转发，可进一步扩展超时控制、重试机制、响应缓存等。

3. **资产详情面板**: 左侧资产卡片目前仅展示基本信息，可增加点击展开查看 rawData 的 JSON 预览功能。
