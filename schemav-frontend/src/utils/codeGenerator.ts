import type { ChartSchema, ComponentInstance, DashboardSchema, MetricCardSchema, TableSchema, TextSchema } from '../stores/editorStore'

function serializeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return 'null'
  }
}

function jsString(value: string): string {
  return JSON.stringify(value)
}

function safeVarName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isChartComponent(comp: ComponentInstance): boolean {
  return comp.type.startsWith('chart-')
}

function buildWrapperStyle(comp: ComponentInstance): string {
  const { position } = comp
  return [
    'position: absolute',
    `left: ${position.x}px`,
    `top: ${position.y}px`,
    `width: ${position.w}px`,
    `height: ${position.h}px`,
    `z-index: ${comp.zIndex}`,
    'background: #fff',
    'border-radius: 8px',
    'box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08)',
    'overflow: hidden',
  ].join('; ')
}

function buildTextTemplate(comp: ComponentInstance): string[] {
  const schema = (comp.props.textSchema as TextSchema | undefined) ?? {
    content: '文本',
    fontSize: 32,
    fontWeight: '600',
    color: '#303133',
    textAlign: 'center',
    background: 'transparent',
    padding: 16,
  }
  return [
    `      <div class="lb-text" style="`,
    `        display: flex;`,
    `        align-items: center;`,
    `        justify-content: ${schema.textAlign === 'left' ? 'flex-start' : schema.textAlign === 'right' ? 'flex-end' : 'center'};`,
    `        width: 100%;`,
    `        height: 100%;`,
    `        padding: ${schema.padding}px;`,
    `        background: ${schema.background};`,
    `        color: ${schema.color};`,
    `        font-size: ${schema.fontSize}px;`,
    `        font-weight: ${schema.fontWeight};`,
    `        text-align: ${schema.textAlign};`,
    `        white-space: pre-wrap;`,
    `        word-break: break-word;`,
    `        line-height: 1.25;`,
    `      ">${escapeHtml(schema.content)}</div>`,
  ]
}

function buildTableTemplate(comp: ComponentInstance): string[] {
  const varName = `table_${safeVarName(comp.id)}`
  const schema = (comp.props.tableSchema as TableSchema | undefined) ?? { title: '', dataKey: '', columns: [], maxRows: 8, showHeader: true }
  return [
    `      <div class="lb-table">`,
    schema.title ? `        <div class="lb-table__title">${escapeHtml(schema.title)}</div>` : '',
    `        <div v-if="${varName}.rows.length === 0 || ${varName}.columns.length === 0" class="lb-table__empty">暂无表格数据</div>`,
    `        <div v-else class="lb-table__body">`,
    `          <table>`,
    schema.showHeader ? `            <thead><tr><th v-for="column in ${varName}.columns" :key="column.key">{{ column.label }}</th></tr></thead>` : '',
    `            <tbody>`,
    `              <tr v-for="(row, rowIndex) in ${varName}.rows" :key="rowIndex">`,
    `                <td v-for="column in ${varName}.columns" :key="column.key">{{ row[column.key] ?? '' }}</td>`,
    `              </tr>`,
    `            </tbody>`,
    `          </table>`,
    `        </div>`,
    `      </div>`,
  ].filter(Boolean)
}

function buildMetricCardTemplate(comp: ComponentInstance): string[] {
  const varName = `metric_${safeVarName(comp.id)}`
  const schema = (comp.props.metricCardSchema as MetricCardSchema | undefined) ?? {
    title: '指标卡',
    valueField: '',
    aggregate: 'first',
    prefix: '',
    suffix: '',
    decimals: 0,
    color: '#2563eb',
    background: '#ffffff',
  }
  return [
    `      <div class="lb-metric-card" style="background: ${schema.background || '#ffffff'};">`,
    `        <div class="lb-metric-card__title">${escapeHtml(schema.title || '指标卡')}</div>`,
    `        <div class="lb-metric-card__value" style="color: ${schema.color || '#2563eb'};">{{ ${varName}.display }}</div>`,
    `        <div class="lb-metric-card__meta">${escapeHtml(schema.valueField ? `${schema.valueField} · ${schema.aggregate}` : '请选择数值字段')}</div>`,
    `      </div>`,
  ]
}

function buildChartTemplate(comp: ComponentInstance): string[] {
  return [
    `      <v-chart`,
    `        :option="chartOption_${safeVarName(comp.id)}"`,
    `        style="width: 100%; height: 100%"`,
    `        autoresize`,
    `      />`,
  ]
}

function buildTableDataCode(comp: ComponentInstance): string {
  const schema = (comp.props.tableSchema as TableSchema | undefined) ?? { title: '', dataKey: '', columns: [], maxRows: 8, showHeader: true }
  return `const table_${safeVarName(comp.id)} = (() => {
  const rows = Array.isArray(globalData?.[${jsString(schema.dataKey)}])
    ? globalData[${jsString(schema.dataKey)}].filter(row => row && typeof row === 'object' && !Array.isArray(row)).slice(0, ${schema.maxRows || 8})
    : []
  const configuredColumns = ${serializeJson(schema.columns)}
  const columns = configuredColumns.filter(column => column.visible)
  if (columns.length > 0 || rows.length === 0) return { rows, columns }
  return {
    rows,
    columns: Object.keys(rows[0]).map(key => ({ key, label: key, visible: true })),
  }
})()`
}

function buildMetricCardDataCode(comp: ComponentInstance): string {
  const schema = (comp.props.metricCardSchema as MetricCardSchema | undefined) ?? {
    title: '指标卡',
    valueField: '',
    aggregate: 'first',
    prefix: '',
    suffix: '',
    decimals: 0,
    color: '#2563eb',
    background: '#ffffff',
  }
  return `const metric_${safeVarName(comp.id)} = (() => {
  const values = Array.isArray(globalData?.[${jsString(schema.valueField)}]) ? globalData[${jsString(schema.valueField)}] : []
  const numbers = values.map(item => Number(item)).filter(item => Number.isFinite(item))
  let value = null
  if (${jsString(schema.aggregate)} === 'count') value = values.length
  else if (numbers.length > 0 && ${jsString(schema.aggregate)} === 'sum') value = numbers.reduce((sum, item) => sum + item, 0)
  else if (numbers.length > 0 && ${jsString(schema.aggregate)} === 'avg') value = numbers.reduce((sum, item) => sum + item, 0) / numbers.length
  else if (numbers.length > 0 && ${jsString(schema.aggregate)} === 'max') value = Math.max(...numbers)
  else if (numbers.length > 0 && ${jsString(schema.aggregate)} === 'min') value = Math.min(...numbers)
  else if (values.length > 0 && Number.isFinite(Number(values[0]))) value = Number(values[0])
  const decimals = Math.max(0, ${schema.decimals ?? 0})
  const display = value === null
    ? '--'
    : ${jsString(schema.prefix || '')} + Number(value).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ${jsString(schema.suffix || '')}
  return { value, display }
})()`
}

function buildChartOptionHelper(): string {
  return `function toNumber(value) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

function readArray(data, field) {
  if (!field || !data) return []
  return Array.isArray(data[field]) ? data[field] : []
}

function readCustomArray(result, keys) {
  for (const key of keys) {
    if (Array.isArray(result[key])) return result[key]
  }
  return []
}

function runCustomDataCode(data, code) {
  if (!code) return {}
  try {
    const fn = new Function('res', code)
    const result = fn(data)
    return result && typeof result === 'object' ? result : {}
  } catch (err) {
    console.error('Execute customDataCode failed:', err)
    return {}
  }
}

function mergeCustomOption(baseOption, customOption) {
  if (!customOption || customOption === '{}') return baseOption
  try {
    return merge({}, baseOption, JSON.parse(customOption))
  } catch (err) {
    console.warn('customOption JSON parse failed:', err)
    return baseOption
  }
}

function buildChartOption(schema) {
  const type = schema.chartType
  const title = schema.title || type
  const color = schema.color ? [schema.color] : undefined
  const customResult = schema.useCustomDataCode ? runCustomDataCode(globalData, schema.customDataCode) : {}
  let baseOption

  if (type === 'pie' || type === 'funnel') {
    const names = schema.useCustomDataCode ? readCustomArray(customResult, ['name', 'names', 'nameData', 'xAxis', 'xData']) : readArray(globalData, schema.nameField)
    const values = schema.useCustomDataCode ? readCustomArray(customResult, ['value', 'values', 'valueData', 'yAxis', 'yData']) : readArray(globalData, schema.valueField)
    baseOption = {
      title: { text: title, left: 'center', top: 8, textStyle: { fontSize: 16, fontWeight: 600, color: '#303133' } },
      color,
      tooltip: { trigger: 'item' },
      legend: { bottom: 8 },
      series: [{
        name: schema.valueField || title,
        type,
        radius: type === 'pie' ? ['35%', '65%'] : undefined,
        left: type === 'funnel' ? '10%' : undefined,
        top: type === 'funnel' ? 54 : undefined,
        bottom: type === 'funnel' ? 24 : undefined,
        data: names.map((name, index) => ({ name: String(name ?? ''), value: toNumber(values[index]) })),
      }],
    }
  } else if (type === 'gauge') {
    const values = schema.useCustomDataCode ? readCustomArray(customResult, ['value', 'values', 'valueData', 'yAxis', 'yData']) : readArray(globalData, schema.valueField)
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
    const indicators = readCustomArray(customResult, ['indicator', 'indicators'])
    const values = readCustomArray(customResult, ['value', 'values', 'yAxis', 'yData'])
    const max = Math.max(...values.map(toNumber), 100)
    const names = indicators.length ? indicators : readCustomArray(customResult, ['xAxis', 'xData', 'name', 'names']).map(name => ({ name: String(name ?? '') }))
    baseOption = {
      title: { text: title, left: 'center', top: 8, textStyle: { fontSize: 16, fontWeight: 600, color: '#303133' } },
      color,
      tooltip: {},
      radar: {
        indicator: names.map(item => typeof item === 'object' ? { max, ...item, name: String(item.name ?? '') } : { name: String(item ?? ''), max }),
        radius: '58%',
      },
      series: [{ name: title, type: 'radar', data: [{ value: values.map(toNumber), name: title }] }],
    }
  } else {
    const xData = schema.useCustomDataCode ? readCustomArray(customResult, ['xAxis', 'xData']) : readArray(globalData, schema.xAxisField)
    const yData = schema.useCustomDataCode ? readCustomArray(customResult, ['yAxis', 'yData']) : readArray(globalData, schema.yAxisField)
    const isScatter = type === 'scatter'
    const seriesName = schema.yAxisField || title
    baseOption = {
      title: { text: title, left: 'center', top: 8, textStyle: { fontSize: 16, fontWeight: 600, color: '#303133' } },
      color,
      tooltip: { trigger: isScatter ? 'item' : 'axis' },
      legend: { data: [seriesName], bottom: 8 },
      grid: { left: '5%', right: '5%', top: 48, bottom: 48, containLabel: true },
      xAxis: {
        type: isScatter ? 'value' : 'category',
        data: isScatter ? undefined : xData.map(item => String(item ?? '')),
        axisLabel: { rotate: !isScatter && xData.length > 8 ? 30 : 0, fontSize: 11 },
      },
      yAxis: { type: 'value', name: seriesName },
      series: [{
        name: seriesName,
        type,
        data: isScatter ? xData.map((item, index) => [toNumber(item), toNumber(yData[index])]) : yData.map(toNumber),
        emphasis: { focus: 'series' },
        animationDelay: idx => idx * 50,
      }],
    }
  }

  return mergeCustomOption(baseOption, schema.customOption)
}`
}

export function generateVueCode(schema: DashboardSchema): string {
  const { canvas, components, globalData } = schema
  const sorted = [...components].sort((a, b) => a.zIndex - b.zIndex)
  const chartComponents = sorted.filter(isChartComponent)
  const tableComponents = sorted.filter((comp) => comp.type === 'table')
  const metricComponents = sorted.filter((comp) => comp.type === 'metric-card')

  const templateLines: string[] = [
    `<template>`,
    `  <div class="dashboard-root" style="width: ${canvas.width}px; height: ${canvas.height}px; background: ${canvas.background}; position: relative; overflow: hidden;">`,
  ]

  sorted.forEach((comp) => {
    templateLines.push(`    <!-- ${comp.id} -->`)
    templateLines.push(`    <div style="${buildWrapperStyle(comp)}">`)
    if (isChartComponent(comp)) {
      templateLines.push(...buildChartTemplate(comp))
    } else if (comp.type === 'text') {
      templateLines.push(...buildTextTemplate(comp))
    } else if (comp.type === 'table') {
      templateLines.push(...buildTableTemplate(comp))
    } else if (comp.type === 'metric-card') {
      templateLines.push(...buildMetricCardTemplate(comp))
    } else {
      templateLines.push(`      <div class="lb-empty">${escapeHtml(comp.type)}</div>`)
    }
    templateLines.push(`    </div>`)
  })

  templateLines.push(`  </div>`)
  templateLines.push(`</template>`)
  templateLines.push(``)

  const scriptLines: string[] = [
    `<script setup>`,
    chartComponents.length > 0 ? `import VChart from 'vue-echarts'` : '',
    chartComponents.length > 0 ? `import { use } from 'echarts/core'` : '',
    chartComponents.length > 0 ? `import { CanvasRenderer } from 'echarts/renderers'` : '',
    chartComponents.length > 0 ? `import { BarChart, LineChart, PieChart, ScatterChart, RadarChart, GaugeChart, FunnelChart } from 'echarts/charts'` : '',
    chartComponents.length > 0 ? `import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'` : '',
    chartComponents.length > 0 ? `import { merge } from 'lodash-es'` : '',
    ``,
  ].filter(Boolean)

  if (chartComponents.length > 0) {
    scriptLines.push(`use([CanvasRenderer, BarChart, LineChart, PieChart, ScatterChart, RadarChart, GaugeChart, FunnelChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])`)
    scriptLines.push(``)
  }

  scriptLines.push(`const globalData = ${serializeJson(globalData)}`)
  scriptLines.push(``)

  if (chartComponents.length > 0) {
    scriptLines.push(buildChartOptionHelper())
    scriptLines.push(``)
  }

  chartComponents.forEach((comp) => {
    const chartSchema = comp.props.chartSchema as ChartSchema | undefined
    scriptLines.push(`const chartOption_${safeVarName(comp.id)} = buildChartOption(${serializeJson(chartSchema ?? {})})`)
    scriptLines.push(``)
  })

  tableComponents.forEach((comp) => {
    scriptLines.push(buildTableDataCode(comp))
    scriptLines.push(``)
  })

  metricComponents.forEach((comp) => {
    scriptLines.push(buildMetricCardDataCode(comp))
    scriptLines.push(``)
  })

  scriptLines.push(`</script>`)
  scriptLines.push(``)

  const styleLines = [
    `<style scoped>`,
    `.dashboard-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }`,
    `.lb-text { box-sizing: border-box; }`,
    `.lb-table { width: 100%; height: 100%; display: flex; flex-direction: column; color: #303133; }`,
    `.lb-table__title { padding: 12px 14px 8px; font-size: 15px; font-weight: 700; }`,
    `.lb-table__body { flex: 1; min-height: 0; overflow: auto; padding: 0 12px 12px; }`,
    `.lb-table table { width: 100%; border-collapse: collapse; font-size: 12px; }`,
    `.lb-table th { position: sticky; top: 0; padding: 8px 10px; text-align: left; background: #f5f7fa; border-bottom: 1px solid #ebeef5; color: #606266; white-space: nowrap; }`,
    `.lb-table td { padding: 8px 10px; border-bottom: 1px solid #f0f2f5; white-space: nowrap; }`,
    `.lb-metric-card { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 20px 24px; color: #1f2937; }`,
    `.lb-metric-card__title { margin-bottom: 12px; color: #64748b; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`,
    `.lb-metric-card__value { font-size: 40px; line-height: 1; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`,
    `.lb-metric-card__meta { margin-top: 12px; color: #94a3b8; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`,
    `.lb-table__empty, .lb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #909399; font-size: 13px; }`,
    `</style>`,
    ``,
  ]

  return [...templateLines, ...scriptLines, ...styleLines].join('\n')
}

export function downloadVueFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.vue') ? filename : `${filename}.vue`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
