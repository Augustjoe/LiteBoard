# SchemaV (LiteBoard) - 项目全局架构与 AI 上下文锚点

> **唯一真理来源 (Single Source of Truth)**
> 本文档定义了 SchemaV 项目的全局愿景、技术栈规范、核心数据结构及开发规约。
> 无论是重构旧代码还是开发新特性，AI 编码助手（如 Roo Code）必须首先阅读本文档，确保代码颗粒度与架构演进方向完全一致。

---

## 🎯 项目愿景与核心定位

SchemaV (LiteBoard) 不是一个传统的后台管理系统，而是一个**生产级的"低代码大屏可视化编辑器"**。
用户可以通过拖拽、缩放组件，在绝对定位的画布上自由排版，通过可视化配置或编写高级原生 ECharts JSON，最终将大屏序列化为 JSON Schema，并支持**自动化出码（导出独立的 Vue 单文件组件）**。

---

## 🛠️ 技术栈规范

### 前端 (Frontend)

- **核心框架**：Vue 3 (Composition API)
- **语法风格**：**TSX (TypeScript XML)** 风格，严禁混用普通的 `.vue` 模板语法
- **构建工具**：Vite + `vue-tsc`（严格类型检查）
- **状态管理**：Pinia
- **UI 组件库**：Element Plus（全量引入及全局样式注册）
- **图表引擎**：`vue-echarts` + `echarts` 核心包

### 后端 (Backend)

- **核心框架**：Node.js + Express
- **存储方案**：**无状态本地 JSON 文件存储**（位于 `server/data/` 目录下），现阶段不引入重量级关系型或非关系型数据库。

---

## 📂 核心文件目录规约

```text
schemav-frontend/
├── src/
│   ├── assets/             # 静态资源（Logo, 插画等）
│   ├── components/         # 核心原子/复合组件
│   │   ├── EditorHeader.tsx       # 编辑器顶部工具栏（保存、清空、导出、全屏）
│   │   ├── DataProbe.tsx          # 数据探针/超级资产提取模块
│   │   ├── ChartRenderer.tsx      # 画布渲染分发器
│   │   ├── ComponentWrapper.tsx   # 高阶组件包装器（处理 8 向缩放、拖拽、网格吸附、事件隔离）
│   │   └── ChartConfigPanel.tsx   # 右侧双向绑定配置面板（含基础配置与高级 JSON 编辑器）
│   ├── stores/
│   │   └── editorStore.ts  # 全局唯一状态中心（画布组件树、数据资产、选中态管理）
│   ├── views/
│   │   ├── EditorView.tsx         # 大屏画布编辑器主视图
│   │   └── TaskHubView.tsx        # (当前迭代) 任务/项目管理中台主视图
│   ├── utils/
│   │   ├── codeGenerator.ts       # 自动化出码引擎（编译 Schema 为 Vue SFC 字符串）
│   │   └── dataHelper.ts          # (当前迭代) 双模数据清洗与 ETL 算法核心工具
│   └── main.ts             # 挂载路由、Pinia 与 Element Plus 全局样式
```

## 🧠 核心数据结构定义 (TypeScript Interfaces)

所有状态流转与序列化必须严格遵循以下接口契约：

```typescript
/** 1. 单个图表组件的配置 Schema */
export interface ChartSchema {
  chartType: 'bar' | 'line' | 'pie'
  xAxisField: string
  yAxisField: string
  assetId?: string          // 关联的数据资产 ID
  customOption?: string     // 用户手写的原生 ECharts JSON 字符串
}

/** 2. 组件绝对定位坐标与尺寸 */
export interface ComponentPosition {
  x: number                 // 强制对齐 20px 网格点
  y: number                 // 强制对齐 20px 网格点
  w: number                 // 宽度 (px)
  h: number                 // 高度 (px)
}

/** 3. 画布上的组件实例包装结构 */
export interface ComponentInstance {
  id: string                // 唯一标识 (例如 comp-1)
  type: string              // 组件类型 (如 'chart-bar' | 'chart-line')
  position: ComponentPosition
  zIndex: number            // 层级管理，激活组件自动置顶
  props: Record<string, unknown> // 包含 chartSchema 等特有配置
}

/** 4. 数据资产结构 (解耦多图表多数据源的核心) */
export interface DataAsset {
  id: string                // 资产 ID (例如 asset-1)
  name: string              // 用户自定义资产名称
  fields: string[]          // 清洗后保留的可用字段列表
  data: Record<string, unknown>[] // 标准一维对象数组，供图表直接消费
}

/** 5. 完整的大屏序列化 JSON Schema */
export interface DashboardSchema {
  version: string
  title: string
  canvas: {
    width: number
    height: number
    background: string
  }
  components: ComponentInstance[]
  assets: DataAsset[]       // 嵌入式项目专属资产库
  createdAt: string
  updatedAt: string
}
```

## 核心架构设计原则

### 绝对定位坐标系

中间画布区域（`ChartRenderer`）使用 `position: relative` 容器。所有的图表组件均通过 `ComponentWrapper` 赋予 `position: absolute`。拖拽和缩放必须采用 `GRID_SIZE = 20` 进行吸附计算（`Math.round(val / 20) * 20`），实现磁吸效果。

### 数据与视图彻底解耦 (Data-View Decoupling)

图表渲染器不直接发起 API 请求，也不共享全局唯一的裸数据。图表只绑定 `assetId`。左侧探针转换为"进货台"，负责将洗干净的 `DataAsset` 存入资产库，右侧面板负责做图表字段与对应资产字段的映射。

### 智能深度合并 (Deep Merge)

图表的最终呈现由 `BaseOption`（前端根据绑定的轴字段自动生成的 ECharts 基础架子）与 `customOption`（用户手写的原生高级 JSON 字符串）通过 `lodash-es` 的 `merge()` 进行运行时深度合并，释放 ECharts 的全量原生能力。

### 无白屏安全兜底

用户手写 JSON 时必须使用 `try...catch` 块进行防抖异步校验（建议 500ms debounce）。格式错误时，UI 抛出红字提示但不破坏现有的状态更新，严禁因单点 JSON 格式错误导致整个页面崩溃白屏。

## 🚀 当前演进节点：全栈任务大厅与资产化改造

目前系统正在从"单页面内存应用"向"全栈多任务平台"演进。当前开发重心：

### 外层项目/任务管理

引入 `vue-router`，建立首页 `/projects`（任务大厅）与编辑器 `/editor/:taskId` 的路由映射。

### RESTful API 联动

改造 `editorStore.ts`。废弃浏览器的 `localStorage`，全面对接 Node 端的 JSON 读写接口（`GET/POST/PUT/DELETE /api/tasks`）。

### 双模数据清洗

开发 `dataHelper.ts`，既支持列表型 JSON 数组提取，又支持结构型 JSON 对象的翻转（KV Pivot），自动输出符合 ECharts 消费的标准一维数组。
