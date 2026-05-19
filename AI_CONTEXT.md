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
- **语法风格**：TSX (TypeScript XML) 风格，严禁混用普通的 `.vue` 模版语法
- **构建工具**：Vite + `vue-tsc` (严格类型检查)
- **状态管理**：Pinia
- **UI 组件库**：Element Plus (全量引入及全局样式注册)
- **图表引擎**：`vue-echarts` + `echarts` 核心包
- **代码编辑器**：`vue-codemirror` + CodeMirror 6（所有涉及 JSON/JS 编写的区域必须使用此组件，严禁使用原生 textarea）

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
│   │   ├── DataProbe.tsx          # 超级探针弹窗（远程获取/手动粘贴 + JS 数据过滤器 + 纯对象校验）
│   │   ├── ChartRenderer.tsx      # 画布渲染分发器
│   │   ├── ComponentWrapper.tsx   # 高阶组件包装器（处理 8 向缩放、拖拽、网格吸附、事件隔离）
│   │   └── ChartConfigPanel.tsx   # 右侧双向绑定配置面板（含基础配置与高级 JSON 编辑器）
│   ├── stores/
│   │   └── editorStore.ts  # 全局唯一状态中心（画布组件树、单一数据湖 globalData、选中态管理）
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
  chartType: 'bar' | 'line'
  xAxisField: string        // 对应 globalData 的顶层 key（X 轴维度）
  yAxisField: string        // 对应 globalData 的顶层 key（Y 轴指标）
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

/** 4. 完整的大屏序列化 JSON Schema */
export interface DashboardSchema {
  version: string
  title: string
  canvas: {
    width: number
    height: number
    background: string
  }
  components: ComponentInstance[]
  globalData: Record<string, any> | null // 单一全局数据湖 (Data Lake)，整个大屏唯一的数据基座
  createdAt: string
  updatedAt: string
}
```

核心架构设计原则
绝对定位坐标系：
中间画布区域使用 position: relative 容器。所有图表组件通过 ComponentWrapper 赋予 position: absolute。拖拽和缩放必须采用 GRID_SIZE = 20 进行吸附计算。

单一数据湖与视图解耦 (Data Lake & Mapping)：
全屏共享唯一的 globalData 对象（一个纯对象）。超级探针通过 JS 数据过滤器清洗原始数据后，直接覆盖写入 globalData。图表组件通过 xAxisField/yAxisField 绑定 globalData 的顶层 key，ComponentWrapper 运行时从 globalData[字段] 中提取数据并自动适配数组/单值。

超级探针三步式交互 (DataProbe)：
步骤 1：远程获取（通过 Node 中转层代理）或手动粘贴 JSON。
步骤 2：JS 数据过滤器 — 用户编写清洗代码（变量 res，必须 return 纯对象）。
步骤 3：new Function 动态执行 + 纯对象强校验，通过后写入 store.globalData。

智能深度合并 (Deep Merge)：
图表的最终呈现由前端生成的 BaseOption 与用户手写的 customOption 通过 lodash-es 的 merge() 进行运行时深度合并，释放 ECharts 的全量原生能力。无白屏安全兜底机制。

🚀 当前演进节点：全局单一数据源架构
目前系统已完成"全局单一数据源"的架构重构。删除了多资产列表 (DataAsset/assets)，引入 globalData: Record<string, any> | null 作为唯一数据基座。图表直接绑定 globalData 的顶层字段，无需中间资产 ID 映射。

### 外层项目/任务管理

引入 `vue-router`，建立首页 `/projects`（任务大厅）与编辑器 `/editor/:taskId` 的路由映射。

### RESTful API 联动

改造 `editorStore.ts`。废弃浏览器的 `localStorage`，全面对接 Node 端的 JSON 读写接口（`GET/POST/PUT/DELETE /api/tasks`）。

### 双模数据清洗

开发 `dataHelper.ts`，既支持列表型 JSON 数组提取，又支持结构型 JSON 对象的翻转（KV Pivot），自动输出符合 ECharts 消费的标准一维数组。
