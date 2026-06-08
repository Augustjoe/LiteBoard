import { merge } from 'lodash-es'
import type { ChartSchema, ChartType, DataPool } from '../stores/editorStore'

export const CHART_META: Record<ChartType, { label: string; icon: string }> = {
  bar: { label: '柱状图', icon: '📊' },
  line: { label: '折线图', icon: '📈' },
  pie: { label: '饼图', icon: '🥧' },
  scatter: { label: '散点图', icon: '✦' },
  radar: { label: '雷达图', icon: '◎' },
  gauge: { label: '仪表盘', icon: '◴' },
  funnel: { label: '漏斗图', icon: '▽' },
}

export const CORE_CHART_TYPES: ChartType[] = [
  'bar',
  'line',
  'pie',
  'scatter',
  'radar',
  'gauge',
  'funnel',
]

export type ChartBlockReason =
  | 'no_schema'
  | 'no_global_data'
  | 'no_custom_code'
  | 'no_binding'
  | 'field_not_found'
  | 'invalid_field_shape'
  | 'empty'
  | 'length_mismatch'
  | 'complex_x'
  | 'non_numeric_value'
  | null

function readArray(data: DataPool, field?: string): any[] {
  if (!field) return []
  const value = data[field]
  return Array.isArray(value) ? value : []
}

function hasComplexItems(values: any[]): boolean {
  return values.some((value) =>
    value !== null &&
    value !== undefined &&
    (typeof value === 'object' || typeof value === 'function')
  )
}

function isNumericArray(values: any[]): boolean {
  const present = values.filter((value) => value !== null && value !== undefined && value !== '')
  return present.length > 0 && present.every((value) => Number.isFinite(Number(value)))
}

function toNumber(value: unknown): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

function runCustomDataCode(data: DataPool, code?: string): Record<string, any> {
  if (!code) return {}
  try {
    const fn = new Function('res', code)
    const result = fn(data)
    return result && typeof result === 'object' ? result : {}
  } catch (err) {
    console.error('[chartOptions] Execute customDataCode failed:', err)
    return {}
  }
}
function readCustomArray(result: Record<string, any>, ...keys: string[]): any[] {
  for (const key of keys) {
    if (Array.isArray(result[key])) return result[key]
  }
  return []
}

export function getChartBlockReason(schema: ChartSchema | undefined, data: DataPool | null): ChartBlockReason {
  if (!schema) return 'no_schema'
  if (!data) return 'no_global_data'

  if (schema.useCustomDataCode) {
    return schema.customDataCode ? null : 'no_custom_code'
  }

  const type = schema.chartType

  if (type === 'gauge') {
    if (!schema.valueField) return 'no_binding'
    const values = readArray(data, schema.valueField)
    if (!values.length) return 'empty'
    if (!isNumericArray(values)) return 'non_numeric_value'
    return null
  }

  if (type === 'pie' || type === 'funnel') {
    if (!schema.nameField || !schema.valueField) return 'no_binding'
    const names = readArray(data, schema.nameField)
    const values = readArray(data, schema.valueField)
    if (!names.length || !values.length) return 'empty'
    if (names.length !== values.length) return 'length_mismatch'
    if (hasComplexItems(names)) return 'complex_x'
    if (!isNumericArray(values)) return 'non_numeric_value'
    return null
  }

  if (type === 'radar') {
    return 'no_custom_code'
  }

  if (!schema.xAxisField || !schema.yAxisField) return 'no_binding'
  const xValues = readArray(data, schema.xAxisField)
  const yValues = readArray(data, schema.yAxisField)
  if (data[schema.xAxisField] === undefined || data[schema.yAxisField] === undefined) return 'field_not_found'
  if (!Array.isArray(data[schema.xAxisField]) || !Array.isArray(data[schema.yAxisField])) return 'invalid_field_shape'
  if (!xValues.length || !yValues.length) return 'empty'
  if (xValues.length !== yValues.length) return 'length_mismatch'
  if (type !== 'scatter' && hasComplexItems(xValues)) return 'complex_x'
  if (!isNumericArray(yValues)) return 'non_numeric_value'
  return null
}

export function buildChartOption(schema: ChartSchema, data: DataPool): Record<string, any> {
  const type = schema.chartType
  const title = schema.title || CHART_META[type]?.label || '图表'
  const color = schema.color ? [schema.color] : undefined
  const customResult = schema.useCustomDataCode ? runCustomDataCode(data, schema.customDataCode) : {}

  let baseOption: Record<string, any>

  if (type === 'pie' || type === 'funnel') {
    const names = schema.useCustomDataCode
      ? readCustomArray(customResult, 'name', 'names', 'nameData', 'xAxis', 'xData')
      : readArray(data, schema.nameField)
    const values = schema.useCustomDataCode
      ? readCustomArray(customResult, 'value', 'values', 'valueData', 'yAxis', 'yData')
      : readArray(data, schema.valueField)
    const seriesName = schema.valueField || title
    baseOption = {
      title: { text: title, left: 'center', top: 8, textStyle: { fontSize: 16, fontWeight: 600, color: '#303133' } },
      color,
      tooltip: { trigger: 'item' },
      legend: { bottom: 8 },
      series: [{
        name: seriesName,
        type,
        radius: type === 'pie' ? ['35%', '65%'] : undefined,
        left: type === 'funnel' ? '10%' : undefined,
        top: type === 'funnel' ? 54 : undefined,
        bottom: type === 'funnel' ? 24 : undefined,
        data: names.map((name, index) => ({ name: String(name ?? ''), value: toNumber(values[index]) })),
      }],
    }
  } else if (type === 'gauge') {
    const values = schema.useCustomDataCode
      ? readCustomArray(customResult, 'value', 'values', 'valueData', 'yAxis', 'yData')
      : readArray(data, schema.valueField)
    baseOption = {
      title: { text: title, left: 'center', top: 8, textStyle: { fontSize: 16, fontWeight: 600, color: '#303133' } },
      color,
      tooltip: { formatter: '{a}<br/>{b}: {c}' },
      series: [{
        name: title,
        type: 'gauge',
        radius: '78%',
        center: ['50%', '58%'],
        progress: { show: true },
        detail: { valueAnimation: true, formatter: '{value}' },
        data: [{ value: toNumber(values[0]), name: schema.valueField || '指标' }],
      }],
    }
  } else if (type === 'radar') {
    const indicators = readCustomArray(customResult, 'indicator', 'indicators')
    const names = indicators.length
      ? indicators
      : readCustomArray(customResult, 'xAxis', 'xData', 'name', 'names').map((name) => ({ name: String(name ?? '') }))
    const values = readCustomArray(customResult, 'value', 'values', 'yAxis', 'yData')
    const max = Math.max(...values.map(toNumber), 100)
    baseOption = {
      title: { text: title, left: 'center', top: 8, textStyle: { fontSize: 16, fontWeight: 600, color: '#303133' } },
      color,
      tooltip: {},
      radar: {
        indicator: names.map((item: any) => typeof item === 'object'
          ? { max, ...item, name: String(item.name ?? '') }
          : { name: String(item ?? ''), max }),
        radius: '58%',
      },
      series: [{ name: title, type: 'radar', data: [{ value: values.map(toNumber), name: title }] }],
    }
  } else {
    const xData = schema.useCustomDataCode
      ? readCustomArray(customResult, 'xAxis', 'xData')
      : readArray(data, schema.xAxisField)
    const yData = schema.useCustomDataCode
      ? readCustomArray(customResult, 'yAxis', 'yData')
      : readArray(data, schema.yAxisField)
    const seriesName = schema.yAxisField || title
    const isScatter = type === 'scatter'
    baseOption = {
      title: { text: title, left: 'center', top: 8, textStyle: { fontSize: 16, fontWeight: 600, color: '#303133' } },
      color,
      tooltip: { trigger: isScatter ? 'item' : 'axis' },
      legend: { data: [seriesName], bottom: 8 },
      grid: { left: '5%', right: '5%', top: 48, bottom: 48, containLabel: true },
      xAxis: {
        type: isScatter ? 'value' : 'category',
        data: isScatter ? undefined : xData.map((item) => String(item ?? '')),
        axisLabel: { rotate: !isScatter && xData.length > 8 ? 30 : 0, fontSize: 11 },
      },
      yAxis: { type: 'value', name: seriesName },
      series: [{
        name: seriesName,
        type,
        data: isScatter
          ? xData.map((item, index) => [toNumber(item), toNumber(yData[index])])
          : yData.map(toNumber),
        emphasis: { focus: 'series' },
        animationDelay: (idx: number) => idx * 50,
      }],
    }
  }

  const customStr = schema.customOption
  if (!customStr || customStr === '{}') return baseOption

  try {
    return merge({}, baseOption, JSON.parse(customStr))
  } catch (err) {
    console.warn('[chartOptions] customOption JSON parse failed:', err)
    return baseOption
  }
}
