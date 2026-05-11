import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ChartSchema {
  chartType: 'bar' | 'line'
  xAxisField: string
  yAxisField: string
}

export const useEditorStore = defineStore('editor', () => {
  // ========== State ==========
  /** 探针抓取的原始数据 */
  const rawData = ref<unknown[]>([])

  /** 从 rawData 第一项中提取的可用字段列表 */
  const availableFields = computed<string[]>(() => {
    const first = rawData.value[0]
    if (!first || typeof first !== 'object') return []
    return Object.keys(first as Record<string, unknown>)
  })

  /** 当前图表配置 */
  const chartSchema = ref<ChartSchema>({
    chartType: 'bar',
    xAxisField: '',
    yAxisField: '',
  })

  // ========== Getters ==========
  const hasData = computed(() => rawData.value.length > 0)

  const isChartReady = computed(() => {
    return (
      hasData.value &&
      chartSchema.value.xAxisField !== '' &&
      chartSchema.value.yAxisField !== ''
    )
  })

  // ========== Actions ==========
  /** 设置探针返回的原始数据 */
  function setRawData(data: unknown[]) {
    rawData.value = Array.isArray(data) ? data : [data]
    // 当数据更新时，自动选择第一个非数字字段为 X 轴，第一个数字字段为 Y 轴
    autoSelectFields()
  }

  /** 更新图表 Schema */
  function updateChartSchema(partial: Partial<ChartSchema>) {
    chartSchema.value = { ...chartSchema.value, ...partial }
  }

  /** 清空所有数据 */
  function clearData() {
    rawData.value = []
    chartSchema.value = {
      chartType: 'bar',
      xAxisField: '',
      yAxisField: '',
    }
  }

  /** 自动选择字段 */
  function autoSelectFields() {
    const fields = availableFields.value
    if (fields.length === 0) return

    // 策略：选择第一个字段为 X 轴，最后一个字段为 Y 轴
    // 如果用户已经手动选择了，则保留用户选择
    if (!chartSchema.value.xAxisField || !fields.includes(chartSchema.value.xAxisField)) {
      chartSchema.value.xAxisField = fields[0]
    }
    if (!chartSchema.value.yAxisField || !fields.includes(chartSchema.value.yAxisField)) {
      chartSchema.value.yAxisField = fields[fields.length - 1]
    }
  }

  return {
    // state
    rawData,
    chartSchema,
    // getters
    availableFields,
    hasData,
    isChartReady,
    // actions
    setRawData,
    updateChartSchema,
    clearData,
  }
})
