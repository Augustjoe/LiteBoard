import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ============================================================
// 接口定义
// ============================================================

/** 图表配置 Schema（嵌入在 ComponentInstance.props 中） */
export interface ChartSchema {
  chartType: 'bar' | 'line'
  xAxisField: string
  yAxisField: string
  /** ECharts 深度自定义 JSON 配置 */
  customOption?: string
  /** 新增：图表标题 */
  title?: string
  /** 新增：主题色 */
  color?: string
  /** 新增：是否使用手写 JS 转换数据 */
  useCustomDataCode?: boolean
  /** 新增：手写 JS 过滤数据代码 */
  customDataCode?: string
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
  globalData: DataPool | null
  createdAt: string
  updatedAt: string
}

/** 当前大屏的公共数据池：字段名 -> 字段值数组 */
export type DataPool = Record<string, any[]>

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

// ============================================================
// 工具函数
// ============================================================

let _nextId = 1

function generateId(): string {
  return `comp-${_nextId++}`
}

/** 恢复组件 id 计数器 */
function restoreNextId(components: ComponentInstance[]): void {
  const maxNum = components.reduce((max, c) => {
    const match = c.id.match(/^comp-(\d+)$/)
    return match ? Math.max(max, parseInt(match[1], 10)) : max
  }, 0)
  _nextId = maxNum + 1
}

const API_BASE = '/api/tasks'

function normalizeDataPool(data: unknown): DataPool | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  const entries = Object.entries(data as Record<string, unknown>)
    .filter(([, value]) => Array.isArray(value))

  if (entries.length === 0) return null
  return Object.fromEntries(entries) as DataPool
}

function isNumericArray(values: any[]): boolean {
  const present = values.filter((value) => value !== null && value !== undefined && value !== '')
  return present.length > 0 && present.every((value) => Number.isFinite(Number(value)))
}

// ============================================================
// Store 定义
// ============================================================

export const useEditorStore = defineStore('editor', () => {
  // ===================== State =====================

  /** 当前编辑的任务 ID */
  const currentTaskId = ref<string | null>(null)

  /** 大屏标题 */
  const title = ref('未命名大屏')

  /** 🔥 全局单一数据湖 — 当前大屏的唯一数据基座 */
  const globalData = ref<DataPool | null>(null)

  /** 画布上的所有组件实例 */
  const components = ref<ComponentInstance[]>([])

  /** 当前选中的组件 ID（null 表示未选中） */
  const selectedComponentId = ref<string | null>(null)

  /** 全屏预览模式 */
  const isFullscreenPreview = ref(false)

  /** 画布配置 */
  const canvasConfig = ref({
    width: 1920,
    height: 1080,
    scale: 1, // 当前缩放比例，默认 1
    background: '#f8f9fb'
  })

  // ===================== Getters =====================

  /** 全局数据是否已挂载 */
  const hasData = computed(() => globalData.value !== null)

  /** 从 globalData 顶层 keys 推导可用字段 */
  const availableFields = computed<string[]>(() => {
    if (!globalData.value) return []
    return Object.keys(globalData.value).filter((field) => Array.isArray(globalData.value?.[field]))
  })

  const numericFields = computed<string[]>(() => {
    if (!globalData.value) return []
    return availableFields.value.filter((field) => isNumericArray(globalData.value![field]))
  })

  const dimensionFields = computed<string[]>(() => {
    const numeric = new Set(numericFields.value)
    return availableFields.value.filter((field) => !numeric.has(field))
  })

  const selectedComponent = computed<ComponentInstance | null>(() => {
    if (!selectedComponentId.value) return null
    return components.value.find((c) => c.id === selectedComponentId.value) ?? null
  })

  const chartSchema = computed<ChartSchema>(() => {
    const comp = selectedComponent.value
    if (!comp) {
      return { chartType: 'bar', xAxisField: '', yAxisField: '' }
    }
    const schema = comp.props.chartSchema as ChartSchema | undefined
    return schema ?? { chartType: 'bar', xAxisField: '', yAxisField: '' }
  })

  const isChartReady = computed(() => {
    const cs = chartSchema.value
    return (
      cs.xAxisField !== '' &&
      cs.yAxisField !== ''
    )
  })

  /** 构建当前大屏 Schema 对象 */
  const currentSchema = computed<DashboardSchema>(() => {
    const now = new Date().toISOString()
    return {
      version: '1.0.0',
      title: title.value,
      canvas: {
        width: canvasConfig.value.width,
        height: canvasConfig.value.height,
        background: canvasConfig.value.background,
      },
      components: components.value,
      globalData: globalData.value,
      createdAt: now,
      updatedAt: now,
    }
  })

  // ===================== Actions =====================

  /** 🔥 增量合并全局数据 — 使用 lodash-es merge 深度合并 */
  function mergeGlobalData(data: DataPool): void {
    if (globalData.value === null) {
      globalData.value = data
    } else {
      globalData.value = { ...globalData.value, ...data }
    }
    console.log('[editorStore] 全局数据已合并，顶层 keys:', Object.keys(globalData.value!).join(', '))
  }

  /** 🔥 全量替换全局数据 — 完全覆盖现有数据 */
  function replaceGlobalData(data: DataPool): void {
    globalData.value = data
    console.log('[editorStore] 全局数据已替换，顶层 keys:', Object.keys(data).join(', '))
  }

  function getFieldValues(field: string): any[] {
    if (!globalData.value) return []
    const values = globalData.value[field]
    return Array.isArray(values) ? values : []
  }

  function isNumericField(field: string): boolean {
    return isNumericArray(getFieldValues(field))
  }

  function getDefaultChartFields(): { xAxisField: string; yAxisField: string } {
    const xAxisField = dimensionFields.value[0] ?? availableFields.value[0] ?? ''
    const yAxisField =
      numericFields.value.find((field) => field !== xAxisField) ??
      availableFields.value.find((field) => field !== xAxisField) ??
      xAxisField

    return { xAxisField, yAxisField }
  }

  function addComponent(type: string, defaultProps?: Record<string, unknown>) {
    const maxZ = components.value.reduce((max, c) => Math.max(max, c.zIndex), 0)
    const offset = (components.value.length % 5) * 30

    const newComp: ComponentInstance = {
      id: generateId(),
      type,
      position: {
        x: 100 + offset,
        y: 80 + offset,
        w: 480,
        h: 320,
      },
      zIndex: maxZ + 1,
      props: defaultProps ?? {},
    }

    components.value.push(newComp)
    selectedComponentId.value = newComp.id
  }

  function updateComponentPosition(id: string, newPos: Partial<ComponentPosition>) {
    const comp = components.value.find((c) => c.id === id)
    if (comp) {
      comp.position = { ...comp.position, ...newPos }
    }
  }

  function selectComponent(id: string | null) {
    selectedComponentId.value = id
    if (id) {
      const comp = components.value.find((c) => c.id === id)
      if (comp) {
        const maxZ = components.value.reduce((max, c) => Math.max(max, c.zIndex), 0)
        comp.zIndex = maxZ + 1
      }
    }
  }

  function updateChartSchema(partial: Partial<ChartSchema>) {
    const comp = selectedComponent.value
    if (!comp) return
    const current = (comp.props.chartSchema as ChartSchema) ?? {
      chartType: 'bar',
      xAxisField: '',
      yAxisField: '',
    }
    comp.props.chartSchema = { ...current, ...partial }
  }

  function updateCustomOption(jsonStr: string) {
    const comp = selectedComponent.value
    if (!comp) return
    const current = (comp.props.chartSchema as ChartSchema) ?? {
      chartType: 'bar',
      xAxisField: '',
      yAxisField: '',
    }
    comp.props.chartSchema = { ...current, customOption: jsonStr }
  }

  function removeComponent(id: string) {
    const idx = components.value.findIndex((c) => c.id === id)
    if (idx === -1) return
    components.value.splice(idx, 1)
    selectComponent(null)
  }

  function clearData() {
    globalData.value = null
    components.value = []
    selectedComponentId.value = null
  }

  function autoSelectFields() {
    const comp = selectedComponent.value
    if (!comp) return
    const defaults = getDefaultChartFields()
    if (!defaults.xAxisField || !defaults.yAxisField) return

    const schema = comp.props.chartSchema as ChartSchema | undefined
    if (!schema) {
      comp.props.chartSchema = {
        chartType: 'bar',
        xAxisField: defaults.xAxisField,
        yAxisField: defaults.yAxisField,
      }
      return
    }

    if (!schema.xAxisField || !availableFields.value.includes(schema.xAxisField)) {
      schema.xAxisField = defaults.xAxisField
    }
    if (!schema.yAxisField || !availableFields.value.includes(schema.yAxisField)) {
      schema.yAxisField = defaults.yAxisField
    }
  }

  // ===================== 从 Schema 对象填充 State =====================

  function applySchema(schema: DashboardSchema): void {
    title.value = schema.title || '未命名大屏'
    components.value = schema.components ?? []
    globalData.value = normalizeDataPool(schema.globalData) ?? null
    selectedComponentId.value = null
    
    if (schema.canvas) {
      canvasConfig.value.width = schema.canvas.width || 1920
      canvasConfig.value.height = schema.canvas.height || 1080
      canvasConfig.value.background = schema.canvas.background || '#f8f9fb'
      canvasConfig.value.scale = 1 // 默认加载时缩放比例为 1
    }

    restoreNextId(schema.components ?? [])

    console.log(
      `[editorStore] Schema 已应用，共 ${schema.components?.length ?? 0} 个组件，globalData: ${globalData.value ? '已挂载' : '空'}`
    )
  }

  // ===================== API 持久化（全栈重构） =====================

  /**
   * loadTask(taskId) — 从后端加载任务数据并填充 Store
   * GET /api/tasks/:id → 获取完整 Task（含 schema）
   */
  async function loadTask(taskId: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/${taskId}`)
      if (!res.ok) {
        console.error(`[editorStore] 加载任务失败 HTTP ${res.status}`)
        return false
      }

      const task: Task = await res.json()

      if (!task.schema) {
        console.warn('[editorStore] 任务数据中无 schema')
        return false
      }

      currentTaskId.value = task.id
      applySchema(task.schema)

      console.log(`[editorStore] 任务已加载: ${task.id} — "${task.name}"`)
      return true
    } catch (err) {
      console.error('[editorStore] 加载任务异常:', err)
      return false
    }
  }

  /**
   * saveTask() — 将当前 Schema 持久化到后端
   * PUT /api/tasks/:id → 提交 currentSchema
   */
  async function saveTask(): Promise<boolean> {
    const taskId = currentTaskId.value
    if (!taskId) {
      console.warn('[editorStore] 无 currentTaskId，无法保存')
      return false
    }

    try {
      const schema = currentSchema.value
      schema.updatedAt = new Date().toISOString()

      const res = await fetch(`${API_BASE}/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema }),
      })

      if (!res.ok) {
        console.error(`[editorStore] 保存任务失败 HTTP ${res.status}`)
        return false
      }

      console.log('[editorStore] 任务已保存到后端')
      return true
    } catch (err) {
      console.error('[editorStore] 保存任务异常:', err)
      return false
    }
  }

  /**
   * saveSchema() — 兼容旧 API，内部委托给 saveTask()
   * @deprecated 推荐使用 saveTask()
   */
  function saveSchema(): DashboardSchema {
    const schema = currentSchema.value
    schema.updatedAt = new Date().toISOString()
    // 异步保存（fire-and-forget + 同步返回 schema 以兼容旧调用）
    saveTask().catch((err) => console.error('[editorStore] saveSchema 异步保存失败:', err))
    return schema
  }

  /**
   * loadSchema() — 兼容旧 API，无 taskId 时无法工作
   * @deprecated 推荐使用 loadTask(taskId)
   */
  function loadSchema(): boolean {
    console.warn('[editorStore] loadSchema() 已废弃，请使用 loadTask(taskId)')
    return false
  }

  function clearCanvas(): void {
    components.value = []
    selectedComponentId.value = null
    console.log('[editorStore] 画布已清空')
  }

  function resetAll(): void {
    title.value = '未命名大屏'
    globalData.value = null
    components.value = []
    selectedComponentId.value = null
    isFullscreenPreview.value = false
    currentTaskId.value = null
    _nextId = 1
    console.log('[editorStore] 编辑器已完全重置')
  }

  function toggleFullscreenPreview(): void {
    isFullscreenPreview.value = !isFullscreenPreview.value
  }

  function updateCanvasConfig(partial: Partial<typeof canvasConfig.value>): void {
    canvasConfig.value = { ...canvasConfig.value, ...partial }
  }

  function setTitle(newTitle: string): void {
    title.value = newTitle
  }

  // ===================== 导出 =====================

  return {
    // state
    currentTaskId,
    title,
    globalData,
    components,
    selectedComponentId,
    isFullscreenPreview,
    canvasConfig,
    // getters
    availableFields,
    numericFields,
    dimensionFields,
    hasData,
    chartSchema,
    isChartReady,
    selectedComponent,
    currentSchema,
    // actions
    mergeGlobalData,
    replaceGlobalData,
    getFieldValues,
    isNumericField,
    getDefaultChartFields,
    addComponent,
    updateComponentPosition,
    selectComponent,
    updateChartSchema,
    updateCustomOption,
    removeComponent,
    clearData,
    autoSelectFields,
    applySchema,
    // persistence
    loadTask,
    saveTask,
    saveSchema,
    loadSchema,
    clearCanvas,
    resetAll,
    toggleFullscreenPreview,
    setTitle,
    updateCanvasConfig,
  }
})
