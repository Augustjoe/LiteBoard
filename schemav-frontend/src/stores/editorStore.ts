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
  /** ECharts 深度自定义 JSON 配置（用户手写的 JSON 字符串，将与基础图表深度合并） */
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
  type: string // 组件类型，如 'chart-bar' | 'chart-line' | ...
  position: ComponentPosition
  zIndex: number
  props: Record<string, unknown> // 组件特有配置（chartSchema 等）
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
  createdAt: string
  updatedAt: string
}

// ============================================================
// 工具函数
// ============================================================

let _nextId = 1
function generateId(): string {
  return `comp-${_nextId++}`
}

/** 从 localStorage 恢复 _nextId，避免 id 冲突 */
function restoreNextId(components: ComponentInstance[]): void {
  const maxNum = components.reduce((max, c) => {
    const match = c.id.match(/^comp-(\d+)$/)
    return match ? Math.max(max, parseInt(match[1], 10)) : max
  }, 0)
  _nextId = maxNum + 1
}

const STORAGE_KEY = 'liteboard-dashboard-schema'

// ============================================================
// Store 定义
// ============================================================

export const useEditorStore = defineStore('editor', () => {
  // ===================== State =====================

  /** 大屏标题 */
  const title = ref('未命名大屏')

  /** 探针抓取的原始数据 */
  const rawData = ref<unknown[]>([])

  /** 从 rawData 第一项中提取的可用字段列表 */
  const availableFields = computed<string[]>(() => {
    const first = rawData.value[0]
    if (!first || typeof first !== 'object') return []
    return Object.keys(first as Record<string, unknown>)
  })

  /** 画布上的所有组件实例 */
  const components = ref<ComponentInstance[]>([])

  /** 当前选中的组件 ID（null 表示未选中） */
  const selectedComponentId = ref<string | null>(null)

  /** 全屏预览模式 */
  const isFullscreenPreview = ref(false)

  // ===================== Getters =====================

  const hasData = computed(() => rawData.value.length > 0)

  /** 当前选中的组件实例（便捷访问） */
  const selectedComponent = computed<ComponentInstance | null>(() => {
    if (!selectedComponentId.value) return null
    return components.value.find((c) => c.id === selectedComponentId.value) ?? null
  })

  /** 当前选中组件的图表 Schema（兼容旧 API，保持 ChartConfigPanel 正常运作） */
  const chartSchema = computed<ChartSchema>(() => {
    const comp = selectedComponent.value
    if (!comp) {
      return { chartType: 'bar', xAxisField: '', yAxisField: '' }
    }
    const schema = comp.props.chartSchema as ChartSchema | undefined
    return schema ?? { chartType: 'bar', xAxisField: '', yAxisField: '' }
  })

  /** 图表是否就绪（有数据 + 已配置 X/Y 轴） */
  const isChartReady = computed(() => {
    return (
      hasData.value &&
      chartSchema.value.xAxisField !== '' &&
      chartSchema.value.yAxisField !== ''
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
      createdAt: now,
      updatedAt: now,
    }
  })

  // ===================== Actions =====================

  /** 设置探针返回的原始数据（纯数据存储，不自动选字段） */
  function setRawData(data: unknown[]) {
    rawData.value = Array.isArray(data) ? data : [data]
  }

  /** 向画布添加新组件，自动选中并置顶 */
  function addComponent(type: string, defaultProps?: Record<string, unknown>) {
    const maxZ = components.value.reduce((max, c) => Math.max(max, c.zIndex), 0)
    // 新组件做轻微偏移，避免完全重叠
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

    // 图表类组件：自动根据 availableFields 预选 X/Y 轴字段
    if (type.startsWith('chart-') && hasData.value) {
      autoSelectFields()
    }
  }

  /** 更新指定组件的位置和/或尺寸 */
  function updateComponentPosition(id: string, newPos: Partial<ComponentPosition>) {
    const comp = components.value.find((c) => c.id === id)
    if (comp) {
      comp.position = { ...comp.position, ...newPos }
    }
  }

  /** 选中组件（同时将其 zIndex 置顶） */
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

  /** 更新当前选中组件的图表 Schema */
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

  /** 更新当前选中组件的 customOption（JSON 编辑器双向绑定用） */
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

  /** 删除指定组件，同时取消选中 */
  function removeComponent(id: string) {
    const idx = components.value.findIndex((c) => c.id === id)
    if (idx === -1) return
    components.value.splice(idx, 1)
    // 无论删除的是否为当前选中组件，一律取消选中，避免悬空引用
    selectComponent(null)
  }

  /** 清空所有数据与组件 */
  function clearData() {
    rawData.value = []
    components.value = []
    selectedComponentId.value = null
  }

  /** 自动选择字段：X=第一个字段，Y=最后一个字段 */
  function autoSelectFields() {
    const fields = availableFields.value
    if (fields.length === 0) return
    const comp = selectedComponent.value
    if (!comp) return
    const schema = comp.props.chartSchema as ChartSchema | undefined
    if (!schema) {
      // 没有 chartSchema 则初始化一个
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

  // ===================== Schema 持久化 =====================

  /** 将当前 Schema 序列化为 JSON 字符串并存入 localStorage */
  function saveSchema(): DashboardSchema {
    const schema = currentSchema.value
    schema.updatedAt = new Date().toISOString()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(schema))
      console.log('[editorStore] Schema 已保存到 localStorage')
    } catch (err) {
      console.error('[editorStore] 保存 Schema 失败：', err)
    }
    return schema
  }

  /** 从 localStorage 加载 Schema，返回是否加载成功 */
  function loadSchema(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        console.log('[editorStore] localStorage 中无已保存的 Schema')
        return false
      }

      const schema: DashboardSchema = JSON.parse(raw)

      // 基础校验
      if (!schema.components || !Array.isArray(schema.components)) {
        console.warn('[editorStore] Schema 格式无效，已忽略')
        return false
      }

      title.value = schema.title || '未命名大屏'
      components.value = schema.components
      selectedComponentId.value = null

      // 恢复 id 计数器
      restoreNextId(schema.components)

      console.log(`[editorStore] Schema 加载成功，共 ${schema.components.length} 个组件`)
      return true
    } catch (err) {
      console.error('[editorStore] 加载 Schema 失败：', err)
      return false
    }
  }

  /** 清空画布所有组件（保留数据） */
  function clearCanvas(): void {
    components.value = []
    selectedComponentId.value = null
    console.log('[editorStore] 画布已清空')
  }

  /** 重置整个编辑器（清空一切，包括 localStorage） */
  function resetAll(): void {
    title.value = '未命名大屏'
    rawData.value = []
    components.value = []
    selectedComponentId.value = null
    isFullscreenPreview.value = false
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (_) { /* ignore */ }
    console.log('[editorStore] 编辑器已完全重置')
  }

  /** 切换全屏预览模式 */
  function toggleFullscreenPreview(): void {
    isFullscreenPreview.value = !isFullscreenPreview.value
  }

  /** 设置大屏标题 */
  function setTitle(newTitle: string): void {
    title.value = newTitle
  }

  // ===================== 导出 =====================

  return {
    // state
    title,
    rawData,
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
    setRawData,
    addComponent,
    updateComponentPosition,
    selectComponent,
    updateChartSchema,
    updateCustomOption,
    removeComponent,
    clearData,
    autoSelectFields,
    // schema persistence
    saveSchema,
    loadSchema,
    clearCanvas,
    resetAll,
    toggleFullscreenPreview,
    setTitle,
  }
})
