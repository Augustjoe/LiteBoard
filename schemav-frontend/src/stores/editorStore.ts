import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ============================================================
// 接口定义
// ============================================================

/** 数据资产 - 数据湖架构：直接全量存储后端返回的复杂对象或用户粘贴的 JSON */
export interface DataAsset {
  id: string
  name: string
  fields: string[]
  data: any
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

// ============================================================
// 工具函数
// ============================================================

let _nextId = 1
let _nextAssetId = 1

function generateId(): string {
  return `comp-${_nextId++}`
}

function generateAssetId(): string {
  return `asset-${_nextAssetId++}`
}

/** 恢复组件 id 计数器 */
function restoreNextId(components: ComponentInstance[]): void {
  const maxNum = components.reduce((max, c) => {
    const match = c.id.match(/^comp-(\d+)$/)
    return match ? Math.max(max, parseInt(match[1], 10)) : max
  }, 0)
  _nextId = maxNum + 1
}

/** 恢复资产 id 计数器 */
function restoreNextAssetId(assets: DataAsset[]): void {
  const maxNum = assets.reduce((max, a) => {
    const match = a.id.match(/^asset-(\d+)$/)
    return match ? Math.max(max, parseInt(match[1], 10)) : max
  }, 0)
  _nextAssetId = maxNum + 1
}

const API_BASE = '/api/tasks'

// ============================================================
// Store 定义
// ============================================================

export const useEditorStore = defineStore('editor', () => {
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

  // ===================== Getters =====================

  const hasData = computed(() => assets.value.length > 0)

  const availableFields = computed<string[]>(() => {
    const comp = selectedComponent.value
    if (!comp) return []
    const schema = comp.props.chartSchema as ChartSchema | undefined
    if (!schema?.assetId) return []
    const asset = assets.value.find((a) => a.id === schema.assetId)
    return asset?.fields ?? []
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
      !!cs.assetId &&
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
        width: 1920,
        height: 1080,
        background: '#f0f2f5',
      },
      components: components.value,
      assets: assets.value,
      createdAt: now,
      updatedAt: now,
    }
  })

  // ===================== Actions =====================

  function addAsset(asset: DataAsset): void {
    const id = asset.id || generateAssetId()
    const entry: DataAsset = { ...asset, id }
    const existingIdx = assets.value.findIndex((a) => a.id === id)
    if (existingIdx !== -1) {
      assets.value[existingIdx] = entry
    } else {
      assets.value.push(entry)
    }
  }

  function removeAsset(assetId: string): void {
    const idx = assets.value.findIndex((a) => a.id === assetId)
    if (idx === -1) return
    assets.value.splice(idx, 1)
    components.value.forEach((comp) => {
      const schema = comp.props.chartSchema as ChartSchema | undefined
      if (schema?.assetId === assetId) {
        comp.props.chartSchema = {
          ...(schema ?? { chartType: 'bar', xAxisField: '', yAxisField: '' }),
          assetId: undefined,
          xAxisField: '',
          yAxisField: '',
        }
      }
    })
  }

  function getAssetById(assetId: string): DataAsset | undefined {
    return assets.value.find((a) => a.id === assetId)
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
    assets.value = []
    components.value = []
    selectedComponentId.value = null
  }

  function autoSelectFields() {
    const fields = availableFields.value
    if (fields.length === 0) return
    const comp = selectedComponent.value
    if (!comp) return
    const schema = comp.props.chartSchema as ChartSchema | undefined
    if (!schema) {
      comp.props.chartSchema = {
        chartType: 'bar',
        xAxisField: fields[0],
        yAxisField: fields[fields.length - 1],
      }
      return
    }

    if (!schema.xAxisField || !fields.includes(schema.xAxisField)) {
      schema.xAxisField = fields[0]
    }
    if (!schema.yAxisField || !fields.includes(schema.yAxisField)) {
      schema.yAxisField = fields[fields.length - 1]
    }
  }

  // ===================== 从 Schema 对象填充 State =====================

  function applySchema(schema: DashboardSchema): void {
    title.value = schema.title || '未命名大屏'
    components.value = schema.components ?? []
    assets.value = Array.isArray(schema.assets) ? schema.assets : []
    selectedComponentId.value = null

    restoreNextId(schema.components ?? [])
    restoreNextAssetId(assets.value)

    console.log(
      `[editorStore] Schema 已应用，共 ${schema.components?.length ?? 0} 个组件，${assets.value.length} 个数据资产`
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
    assets.value = []
    components.value = []
    selectedComponentId.value = null
    isFullscreenPreview.value = false
    currentTaskId.value = null
    _nextId = 1
    _nextAssetId = 1
    console.log('[editorStore] 编辑器已完全重置')
  }

  function toggleFullscreenPreview(): void {
    isFullscreenPreview.value = !isFullscreenPreview.value
  }

  function setTitle(newTitle: string): void {
    title.value = newTitle
  }

  // ===================== 导出 =====================

  return {
    // state
    currentTaskId,
    title,
    assets,
    components,
    selectedComponentId,
    isFullscreenPreview,
    // getters
    availableFields,
    hasData,
    chartSchema,
    isChartReady,
    selectedComponent,
    currentSchema,
    // actions
    addAsset,
    removeAsset,
    getAssetById,
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
  }
})
