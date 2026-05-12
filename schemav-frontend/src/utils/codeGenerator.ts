/**
 * generateVueCode — 自动化出码引擎（Node 5 核心）
 *
 * 将 DashboardSchema 转换为可独立运行的 Vue SFC 代码字符串。
 *
 * 输出特点：
 * - <template>：绝对定位容器 + 按 zIndex 排序的图表组件
 * - <script setup>：自动 import vue-echarts、echarts 核心 + 每个组件的 merge 后的 Option
 * - <style>：scoped 基础样式
 *
 * merge 逻辑与 ComponentWrapper 保持一致：
 * baseOption + JSON.parse(customOption) → lodash merge
 */
import type { DashboardSchema, ComponentInstance, ChartSchema } from '../stores/editorStore'

/**
 * 将 Schema 中的 rawData 序列化为内联 JSON（用于出码时嵌入数据）
 * 注意：实际场景中 rawData 可能在独立的数据层，这里简化处理
 */
function serializeData(rawData: unknown[]): string {
  try {
    return JSON.stringify(rawData, null, 2)
  } catch {
    return '[]'
  }
}

/**
 * 为单个图表组件构建 merge 后的 ECharts Option 代码字符串
 * 注意：这里不引入 lodash merge，而是手动生成 merge 后的 option 对象
 */
function buildChartOptionCode(
  comp: ComponentInstance,
  rawData: unknown[],
): string {
  const schema = comp.props.chartSchema as ChartSchema | undefined
  if (!schema || !schema.xAxisField || !schema.yAxisField) {
    return '{}'
  }

  const { xAxisField, yAxisField, chartType } = schema

  // 基础配置 — 与 ComponentWrapper 中的 baseOption 保持一致
  const baseOptionLines: string[] = [
    `  title: {`,
    `    text: '${chartType === 'bar' ? '柱状图' : '折线图'} — ${yAxisField}',`,
    `    left: 'center',`,
    `    top: 8,`,
    `    textStyle: { fontSize: 16, fontWeight: 600, color: '#303133' },`,
    `  },`,
    `  tooltip: { trigger: 'axis' },`,
    `  legend: { data: ['${yAxisField}'], bottom: 8 },`,
    `  grid: { left: '5%', right: '5%', top: 48, bottom: 48, containLabel: true },`,
    `  xAxis: {`,
    `    type: 'category',`,
    `    data: data.map(item => String(item['${xAxisField}'] ?? '')),`,
    `    axisLabel: { rotate: data.length > 8 ? 30 : 0, fontSize: 11 },`,
    `  },`,
    `  yAxis: { type: 'value', name: '${yAxisField}' },`,
    `  series: [{`,
    `    name: '${yAxisField}',`,
    `    type: '${chartType}',`,
    `    data: data.map(item => {`,
    `      const val = Number(item['${yAxisField}'])`,
    `      return Number.isNaN(val) ? 0 : val`,
    `    }),`,
    `    emphasis: { focus: 'series' },`,
    `    animationDelay: (idx) => idx * 50,`,
    `  }],`,
  ]

  // 如果有 customOption，尝试生成 merge 后的代码
  // 由于无法在代码生成阶段运行 lodash merge（那是运行时逻辑），
  // 我们采用策略：将 baseOption 和 customOption 分别声明，
  // 在生成的代码中使用 lodash merge 运行时合并
  const customStr = schema.customOption
  if (customStr && customStr !== '{}') {
    try {
      const parsed = JSON.parse(customStr)
      const customLines = JSON.stringify(parsed, null, 2)
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')
      // 返回运行时 merge 调用（最精确）
      return `  merge({}, {\n${baseOptionLines.join('\n')}\n  }, ${customLines.replace(/^\s{2}/, '')})`
    } catch {
      // customOption 解析失败，仅使用基础配置
      return `{\n${baseOptionLines.join('\n')}\n}`
    }
  }

  return `{\n${baseOptionLines.join('\n')}\n}`
}

/**
 * 生成完整的 .vue 单文件组件代码
 */
export function generateVueCode(
  schema: DashboardSchema,
  rawData: unknown[] = [],
): string {
  const { title, canvas, components } = schema

  // 按 zIndex 排序，确保渲染顺序正确
  const sorted = [...components].sort((a, b) => a.zIndex - b.zIndex)

  // 数据序列化
  const dataJson = serializeData(rawData)

  // 判断是否需要 lodash merge
  const hasCustomOption = sorted.some((c) => {
    const cs = c.props.chartSchema as ChartSchema | undefined
    const co = cs?.customOption
    return co && co !== '{}'
  })

  // ==================== 构建 template ====================
  const templateLines: string[] = [
    `<template>`,
    `  <div class="dashboard-root" style="`,
    `    width: ${canvas.width}px;`,
    `    height: ${canvas.height}px;`,
    `    background: ${canvas.background};`,
    `    position: relative;`,
    `    overflow: hidden;`,
    `  ">`,
  ]

  sorted.forEach((comp) => {
    const { id, position } = comp
    templateLines.push(`    <!-- ${id} -->`)
    templateLines.push(`    <div`)
    templateLines.push(`      style="`)
    templateLines.push(`        position: absolute;`)
    templateLines.push(`        left: ${position.x}px;`)
    templateLines.push(`        top: ${position.y}px;`)
    templateLines.push(`        width: ${position.w}px;`)
    templateLines.push(`        height: ${position.h}px;`)
    templateLines.push(`        background: #fff;`)
    templateLines.push(`        border-radius: 8px;`)
    templateLines.push(`        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);`)
    templateLines.push(`        overflow: hidden;`)
    templateLines.push(`      "`)
    templateLines.push(`    >`)
    templateLines.push(`      <v-chart`)
    templateLines.push(`        :option="chartOption_${id.replace(/-/g, '_')}"`)
    templateLines.push(`        style="width: 100%; height: 100%"`)
    templateLines.push(`        autoresize`)
    templateLines.push(`      />`)
    templateLines.push(`    </div>`)
  })

  templateLines.push(`  </div>`)
  templateLines.push(`</template>`)
  templateLines.push(``)

  // ==================== 构建 script ====================
  const scriptLines: string[] = [
    `<script setup>`,
    `import VChart from 'vue-echarts'`,
    `import { use } from 'echarts/core'`,
    `import { CanvasRenderer } from 'echarts/renderers'`,
    `import { BarChart, LineChart } from 'echarts/charts'`,
    `import {`,
    `  TitleComponent,`,
    `  TooltipComponent,`,
    `  LegendComponent,`,
    `  GridComponent,`,
    `} from 'echarts/components'`,
    ``,
    `// 注册 ECharts 必需组件`,
    `use([`,
    `  CanvasRenderer,`,
    `  BarChart,`,
    `  LineChart,`,
    `  TitleComponent,`,
    `  TooltipComponent,`,
    `  LegendComponent,`,
    `  GridComponent,`,
    `])`,
    ``,
  ]

  if (hasCustomOption) {
    scriptLines.push(`import { merge as _merge } from 'lodash-es'`)
    scriptLines.push(`const merge = _merge`)
    scriptLines.push(``)
  }

  // 数据常量
  scriptLines.push(`// 内联数据（由编辑器探针抓取）`)
  scriptLines.push(`const data = ${dataJson}`)
  scriptLines.push(``)

  // 每个组件的 Option
  sorted.forEach((comp) => {
    const varName = `chartOption_${comp.id.replace(/-/g, '_')}`
    scriptLines.push(`const ${varName} = ${buildChartOptionCode(comp, rawData)}`)
    scriptLines.push(``)
  })

  scriptLines.push(`</script>`)
  scriptLines.push(``)

  // ==================== 构建 style ====================
  const styleLines: string[] = [
    `<style scoped>`,
    `.dashboard-root {`,
    `  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`,
    `}`,
    `</style>`,
    ``,
  ]

  // ==================== 拼接 ====================
  return [
    ...templateLines,
    ...scriptLines,
    ...styleLines,
  ].join('\n')
}

/**
 * 触发浏览器下载 .vue 文件
 */
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
