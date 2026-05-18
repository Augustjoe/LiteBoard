# LiteBoard 项目状态切片报告（Project Snapshot）

**生成时间：** 2026-05-18 · **扫描范围：** `schemav-frontend/` + `schemav-server/`

## 1. 📂 真实的文件目录树

```
LiteBoard/
├── .gitignore
├── AI_CONTEXT.md
│
├── schemav-frontend/                     # 前端（Vue 3 + TSX + Pinia + Element Plus）
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── auto-imports.d.ts
│   ├── components.d.ts
│   ├── README.md
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   └── src/
│       ├── main.ts                        # 入口：Pinia + Router + Element Plus + ECharts 注册
│       ├── App.tsx                        # 根组件：仅渲染 <router-view />
│       ├── env.d.ts
│       ├── style.css                      # 全局样式
│       ├── assets/
│       │   ├── hero.png
│       │   ├── vite.svg
│       │   └── vue.svg
│       ├── router/
│       │   └── index.ts                   # 2 条路由：/ → TaskHubView，/editor/:taskId → EditorView
│       ├── stores/
│       │   └── editorStore.ts             # ★ Pinia Store（全局唯一状态树）
│       ├── views/
│       │   ├── TaskHubView.tsx             # 任务大厅页面
│       │   ├── TaskHubView.css
│       │   ├── EditorView.tsx              # 编辑器主页面
│       │   └── EditorView.css
│       ├── components/
│       │   ├── EditorHeader.tsx            # 顶部工具栏（保存/清空/导出代码/全屏/返回大厅）
│       │   ├── DataProbe.tsx               # 左侧探针面板（两步走：请求 → 萃取 → 入库）
│       │   ├── DataProbe.css
│       │   ├── ChartRenderer.tsx           # 画布渲染分发器（遍历 components 创建 ComponentWrapper）
│       │   ├── ComponentWrapper.tsx         # ★ 图表包装器（绝对定位拖拽 + 8 向缩放 + ECharts 绑定）
│       │   ├── ChartConfigPanel.tsx        # 右侧配置面板（资产绑定/基础配置/JSON 深度编辑器）
│       │   └── HelloWorld.tsx              # （Vite 初始模板残留，未使用）
│       └── utils/
│           ├── dataHelper.ts               # 双模数据清洗引擎（数组模式 / 对象翻转模式）
│           └── codeGenerator.ts            # 自动化出码引擎（Schema → .vue SFC 代码字符串）
│
└── schemav-server/                       # 后端（Express + TypeScript + JSON 文件持久化）
    ├── package.json
    ├── tsconfig.json
    ├── app.ts                             # Express 入口，端口 3000
    ├── routes/
    │   └── api.ts                         # 路由注册：/probe、/mock-chart-data、/tasks CRUD
    ├── controllers/
    │   ├── probeController.ts             # 探针控制器（POST /api/probe → 代理转发目标 URL）
    │   ├── mockController.ts              # Mock 数据控制器（6 条月份销售数据）
    │   └── taskController.ts              # ★ 任务 CRUD（JSON 文件持久化，完整类型定义）
    ├── data/
    │   └── tasks.json                     # 任务持久化文件（目前 1 条测试数据）
    ├── utils/
    │   ├── requestUtil.ts                 # Node.js fetch 封装（探针代理用）
    │   └── compiler.ts                    # ★（遗留）旧 Schema 编译器，基于 mock/schema.json
    └── mock/
        └── schema.json                    # （遗留）旧 Schema 定义文件
```

## 2. 🧠 核心 Store 的真实状态与契约

**文件：** [`schemav-frontend/src/stores/editorStore.ts`](schemav-frontend/src/stores/editorStore.ts)

### 2.1 TypeScript 接口定义（完整）

```typescript
/** 数据资产 - 经过清洗入库后的标准化数据集 */
export interface DataAsset {
  id: string
  name: string
  fields: string[]
  data: Record<string, unknown>[]
}

/** 图表配置 Schema（嵌入在 ComponentInstance.props 中） */
export interface ChartSchema {
  chartType: 'bar' | 'line'
  xAxisField: string
  yAxisField: string
  /** 绑定的数据资产 ID */
  assetId?: string
  /** ECharts 深度自定义 JSON 配置 */
  customOption?: string
}

/** 组件位置与尺寸 */
export interface ComponentPosition {
  x: number
  y: number
  w: number
  h: number
}

/** 画布上的一个组件实例 */
export interface ComponentInstance {
  id: string
  type: string
  position: ComponentPosition
  zIndex: number
  props: Record<string, unknown>
}

/** 大屏 Schema — 完整的项目配置 */
export interface DashboardSchema {
  version: string
  title: string
  canvas: {
    width: number
    height: number
    background: string
  }
  components: ComponentInstance[]
  assets: DataAsset[]
  createdAt: string
  updatedAt: string
}

/** 后端返回的 Task 完整结构 */
export interface Task {
  id: string
  name: string
  description: string
  cover: string
  createdAt: string
  updatedAt: string
  schema: DashboardSchema
}
```

### 2.2 Store State 变量（Pinia Setup Store）

```typescript
// ===================== State =====================

/** 当前编辑的任务 ID */
const currentTaskId = ref<string | null>(null)

/** 大屏标题 */
const title = ref('未命名大屏')

/** 数据资产列表 */
const assets = ref<DataAsset[]>([])

/** 画布上的所有组件实例 */
const components = ref<ComponentInstance[]>([])

/** 当前选中的组件 ID（null 表示未选中） */
const selectedComponentId = ref<string | null>(null)

/** 全屏预览模式 */
const isFullscreenPreview = ref(false)
```

### 2.3 Store Getters（计算属性）

| Getter | 返回类型 | 说明 |
|--------|----------|------|
| `hasData` | `boolean` | `assets.length > 0` |
| `availableFields` | `string[]` | 当前选中组件绑定的资产的所有字段名 |
| `selectedComponent` | `ComponentInstance \| null` | 通过 `selectedComponentId` 查找 |
| `chartSchema` | `ChartSchema` | 当前选中组件的图表配置（带默认值兜底） |
| `isChartReady` | `boolean` | 检查 `assetId + xAxisField + yAxisField` 是否齐全 |
| `currentSchema` | `DashboardSchema` | 实时拼装当前所有 state → 完整 `DashboardSchema` |

### 2.4 Store Actions（方法清单）

| Action | 功能 |
|--------|------|
| `addAsset(asset)` | 添加/更新数据资产 |
| `removeAsset(assetId)` | 删除资产并清理绑定组件的 chartSchema |
| `getAssetById(assetId)` | 按 ID 查找资产 |
| `addComponent(type, props?)` | 在画布添加组件（自动计算 zIndex + 偏移） |
| `updateComponentPosition(id, pos)` | 更新组件位置/尺寸（局部合并） |
| `selectComponent(id)` | 选中组件（自动提升 zIndex 至顶层） |
| `updateChartSchema(partial)` | 局部更新选中组件的 chartSchema |
| `updateCustomOption(jsonStr)` | 更新选中组件的 ECharts 自定义 JSON |
| `removeComponent(id)` | 删除组件 |
| `clearData()` | 清空 assets + components |
| `autoSelectFields()` | 自动填充选中组件的 X/Y 轴字段（第一个/最后一个） |
| `applySchema(schema)` | 从 DashboardSchema 对象填充全部 state |
| `loadTask(taskId)` | ★ GET /api/tasks/:id → applySchema |
| `saveTask()` | ★ PUT /api/tasks/:id → 持久化 currentSchema |
| `saveSchema()` | ⚠️ deprecated，委托 saveTask() |
| `loadSchema()` | ⚠️ deprecated |
| `clearCanvas()` | 清空画布组件 |
| `resetAll()` | 完全重置所有 state |
| `toggleFullscreenPreview()` | 切换全屏预览 |
| `setTitle(newTitle)` | 设置大屏标题 |

## 3. 🚦 当前功能与遗留问题速览

### 3.1 ✅ 已经彻底跑通的核心功能

| 功能 | 状态 | 关键代码 |
|------|:----:|----------|
| 绝对定位拖拽 + 20px 网格吸附 | ✅ | `ComponentWrapper.tsx` — onDragMouseDown + snapToGrid |
| 8 向手柄缩放（含尺寸/位置约束） | ✅ | `ComponentWrapper.tsx` — onResizeMouseDown，NW/NE/SW/SE/N/S/W/E |
| 组件选中态（蓝色边框 + 8 手柄 + 标题栏 + zIndex 提升） | ✅ | `ComponentWrapper.tsx` |
| 键盘 Delete/Backspace 删除选中组件 | ✅ | `ComponentWrapper.tsx` |
| ECharts 图表实时渲染（bar/line） | ✅ | `ComponentWrapper.tsx` — chartOption computed |
| customOption JSON 深度合并（lodash merge） | ✅ | `ComponentWrapper.tsx` + `codeGenerator.ts` |
| 右侧配置面板 JSON 编辑器实时校验 + 防抖 + 双向同步 | ✅ | `ChartConfigPanel.tsx` — 500ms debounce + isProgrammaticUpdate 标记 |
| 数据资产绑定（Asset → ChartSchema.assetId） | ✅ | `ChartConfigPanel.tsx` + availableFields getter |
| 探针面板：两步走向导（发送探针 → 选择路径 → 勾选字段 → 保存资产） | ✅ | `DataProbe.tsx` |
| 双模数据清洗（数组模式 + 对象翻转模式） | ✅ | `dataHelper.ts` — extractCleanData |
| findValidPaths 递归扫描 JSON 数据路径 | ✅ | `dataHelper.ts` |
| 自动化出码引擎（Schema → .vue SFC） | ✅ | `codeGenerator.ts` — generateVueCode + downloadVueFile |
| 全栈持久化：Task CRUD（JSON 文件存储） | ✅ | `taskController.ts` — getTasks/createTask/getTaskById/updateTask/deleteTask/copyTask |
| 任务大厅页面（搜索/新建/复制/删除/编辑/预览） | ✅ | `TaskHubView.tsx` |
| 路由：/→TaskHub, /editor/:taskId→Editor | ✅ | `index.ts` |
| 全屏预览模式 | ✅ | isFullscreenPreview + 左右面板隐藏 |
| ECharts 实例 resize 响应（watch 尺寸变化） | ✅ | `ComponentWrapper.tsx` |
| 删除资产时自动清理关联组件的绑定 | ✅ | `editorStore.ts` — removeAsset |
| 创建任务自动生成随机渐变色封面 | ✅ | `taskController.ts` |

### 3.2 ⚠️ 硬编码、未解决报错与体验妥协

| 问题 | 严重程度 | 位置 | 详述 |
|------|:-------:|------|------|
| Canvas 尺寸硬编码 1920×1080 | 🔶 中 | `editorStore.ts` | currentSchema getter 中 width: 1920, height: 1080 写死，无法通过 UI 修改 |
| Canvas 背景色硬编码 #f0f2f5 | 🔶 中 | `editorStore.ts` | 同上 |
| 新增组件默认尺寸硬编码 480×320 | 🔶 中 | `editorStore.ts` | addComponent 中 w/h 写死，所有组件初始尺寸相同 |
| 组件添加偏移逻辑简单粗暴 | 🟡 低 | `editorStore.ts` | (components.length % 5) * 30 — 组件多了会堆叠出画布 |
| DataProbe 默认探针 URL 硬编码 localhost:3000 | 🔶 中 | `DataProbe.tsx` | targetUrl.default = 'http://localhost:3000/api/mock-chart-data' |
| 探针请求目标 URL 硬编码 localhost:3000（fetch 地址） | 🔴 高 | `DataProbe.tsx` | 发送探针时也是 http://localhost:3000/api/probe hardcoded，非相对路径，部署后必崩 |
| chartType 仅支持 bar/line | 🔶 中 | `editorStore.ts` | ChartSchema.chartType: 'bar' \| 'line' — 无饼图、散点图等 |
| ComponentInstance.type 为自由 string | 🟡 低 | `editorStore.ts` | 无枚举约束，ComponentWrapper 仅对 chart-* 前缀有特殊渲染 |
| ECharts resize 使用 (vc as any).chart | 🟡 低 | `ComponentWrapper.tsx` | 类型安全不足 |
| saveSchema() 是 fire-and-forget | 🟡 低 | `editorStore.ts` | 调用方拿不到保存结果 |
| document.execCommand('copy') 已废弃 | 🟡 低 | `EditorHeader.tsx` | 作为 clipboard API 的 fallback，但该方法已 deprecated |
| 服务端 compiler.ts 是遗留代码 | 🔶 中 | `compiler.ts` | 基于旧 mock/schema.json 的编译器，与当前 codeGenerator.ts 架构不一致，属于死代码 |
| 服务端类型定义与前端重复 | 🔶 中 | `taskController.ts` | ComponentPosition、ChartSchema、ComponentInstance、DataAsset、DashboardSchema、Task 在前后端各自定义，未抽取共享类型包 |
| tasks.json 仅内存-文件双写，无并发锁 | 🟡 低 | `taskController.ts` | 多用户并发写可能数据竞争 |
| 无用户认证/多租户 | 🔴 高 | 全局 | Task 无 owner 字段，所有用户共享同一份 tasks.json |
| 图表配置面板显示"暂无数据资产"警告区域 | 🟡 低 | `ChartConfigPanel.tsx` | 当 assets.length === 0 时 always 显示 alert，但未对空画布时做区分 |
| HelloWorld.tsx 残留 | 🟢 优 | `HelloWorld.tsx` | Vite 脚手架初始模板，未使用但未删除 |

---

*报告完毕。下一步规划（任务大厅增强 + 双模清洗引擎）可基于以上真实状态切入。*
