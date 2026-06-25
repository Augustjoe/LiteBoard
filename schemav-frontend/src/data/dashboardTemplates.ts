import type { ComponentInstance, DashboardSchema, DataPool, TableColumnSchema } from '../stores/editorStore'

export interface DashboardTemplate {
  id: string
  name: string
  description: string
  tags: string[]
  preview: {
    background: string
    accent: string
    label: string
  }
  componentCount: number
  createSchema: (title: string) => DashboardSchema
}

function tableColumns(keys: string[]): TableColumnSchema[] {
  return keys.map((key) => ({
    key,
    label: key,
    visible: true,
  }))
}

function createSchema(title: string, components: ComponentInstance[], globalData: DataPool): DashboardSchema {
  const now = new Date().toISOString()
  return {
    version: '1.0.0',
    title,
    canvas: {
      width: 1440,
      height: 900,
      background: '#f4f7fb',
    },
    components,
    globalData,
    createdAt: now,
    updatedAt: now,
  }
}

const salesData: DataPool = {
  month: ['1月', '2月', '3月', '4月', '5月', '6月'],
  sales: [150, 230, 180, 299, 320, 280],
  profit: [80, 120, 90, 150, 180, 140],
  target: [200, 200, 200, 250, 250, 250],
  channel: ['线上商城', '线下门店', '代理渠道', '企业客户'],
  revenue: [420, 360, 260, 310],
  completionRate: [86],
  salesRows: [
    { month: '1月', sales: 150, profit: 80, target: 200 },
    { month: '2月', sales: 230, profit: 120, target: 200 },
    { month: '3月', sales: 180, profit: 90, target: 200 },
    { month: '4月', sales: 299, profit: 150, target: 250 },
    { month: '5月', sales: 320, profit: 180, target: 250 },
    { month: '6月', sales: 280, profit: 140, target: 250 },
  ],
}

const opsData: DataPool = {
  day: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  visitors: [3200, 4100, 3900, 4600, 5200, 6100, 5800],
  conversion: [3.2, 3.8, 3.6, 4.1, 4.5, 4.9, 4.7],
  latency: [180, 165, 172, 155, 149, 151, 158],
  onlineRate: [92],
  stage: ['访问', '注册', '试用', '付费'],
  users: [5800, 2200, 980, 360],
  opsRows: [
    { day: '周一', visitors: 3200, conversion: '3.2%', latency: 180 },
    { day: '周二', visitors: 4100, conversion: '3.8%', latency: 165 },
    { day: '周三', visitors: 3900, conversion: '3.6%', latency: 172 },
    { day: '周四', visitors: 4600, conversion: '4.1%', latency: 155 },
    { day: '周五', visitors: 5200, conversion: '4.5%', latency: 149 },
  ],
}

const financeData: DataPool = {
  month: ['1月', '2月', '3月', '4月', '5月', '6月'],
  income: [520, 610, 590, 720, 760, 810],
  expense: [330, 360, 380, 410, 420, 450],
  cashflow: [120, 180, 150, 210, 240, 260],
  marginRate: [36, 41, 36, 43, 45, 44],
  department: ['研发', '销售', '运营', '行政'],
  cost: [220, 180, 120, 80],
  financeRows: [
    { month: '1月', income: 520, expense: 330, cashflow: 120 },
    { month: '2月', income: 610, expense: 360, cashflow: 180 },
    { month: '3月', income: 590, expense: 380, cashflow: 150 },
    { month: '4月', income: 720, expense: 410, cashflow: 210 },
    { month: '5月', income: 760, expense: 420, cashflow: 240 },
    { month: '6月', income: 810, expense: 450, cashflow: 260 },
  ],
}

function salesComponents(): ComponentInstance[] {
  return [
    {
      id: 'comp-1001',
      type: 'text',
      position: { x: 40, y: 32, w: 560, h: 86 },
      zIndex: 1,
      props: {
        textSchema: {
          content: '销售经营仪表盘',
          fontSize: 34,
          fontWeight: '800',
          color: '#172033',
          textAlign: 'left',
          background: 'transparent',
          padding: 12,
        },
      },
    },
    {
      id: 'comp-1002',
      type: 'metric-card',
      position: { x: 40, y: 140, w: 260, h: 150 },
      zIndex: 2,
      props: {
        metricCardSchema: {
          title: '销售额合计',
          valueField: 'sales',
          aggregate: 'sum',
          prefix: '',
          suffix: ' 万',
          decimals: 0,
          color: '#2563eb',
          background: '#ffffff',
        },
      },
    },
    {
      id: 'comp-1003',
      type: 'metric-card',
      position: { x: 320, y: 140, w: 260, h: 150 },
      zIndex: 3,
      props: {
        metricCardSchema: {
          title: '平均利润',
          valueField: 'profit',
          aggregate: 'avg',
          prefix: '',
          suffix: ' 万',
          decimals: 0,
          color: '#13b8b1',
          background: '#ffffff',
        },
      },
    },
    {
      id: 'comp-1004',
      type: 'chart-gauge',
      position: { x: 600, y: 140, w: 300, h: 260 },
      zIndex: 4,
      props: {
        chartSchema: {
          chartType: 'gauge',
          xAxisField: '',
          yAxisField: '',
          valueField: 'completionRate',
          title: '目标完成率',
          color: '#2f7df6',
          customOption: '{}',
        },
      },
    },
    {
      id: 'comp-1005',
      type: 'chart-bar',
      position: { x: 40, y: 320, w: 540, h: 340 },
      zIndex: 5,
      props: {
        chartSchema: {
          chartType: 'bar',
          xAxisField: 'month',
          yAxisField: 'sales',
          title: '月度销售额',
          color: '#2f7df6',
          customOption: '{}',
        },
      },
    },
    {
      id: 'comp-1006',
      type: 'chart-line',
      position: { x: 600, y: 430, w: 420, h: 230 },
      zIndex: 6,
      props: {
        chartSchema: {
          chartType: 'line',
          xAxisField: 'month',
          yAxisField: 'profit',
          title: '利润趋势',
          color: '#13b8b1',
          customOption: '{}',
        },
      },
    },
    {
      id: 'comp-1007',
      type: 'chart-pie',
      position: { x: 1040, y: 140, w: 340, h: 260 },
      zIndex: 7,
      props: {
        chartSchema: {
          chartType: 'pie',
          xAxisField: '',
          yAxisField: '',
          nameField: 'channel',
          valueField: 'revenue',
          title: '渠道收入',
          color: '#f59e0b',
          customOption: '{}',
        },
      },
    },
    {
      id: 'comp-1008',
      type: 'table',
      position: { x: 1040, y: 430, w: 340, h: 230 },
      zIndex: 8,
      props: {
        tableSchema: {
          title: '销售明细',
          dataKey: 'salesRows',
          columns: tableColumns(['month', 'sales', 'profit', 'target']),
          maxRows: 6,
          showHeader: true,
        },
      },
    },
  ]
}

function opsComponents(): ComponentInstance[] {
  return [
    {
      id: 'comp-1101',
      type: 'text',
      position: { x: 40, y: 32, w: 560, h: 86 },
      zIndex: 1,
      props: {
        textSchema: {
          content: '运营监控仪表盘',
          fontSize: 34,
          fontWeight: '800',
          color: '#172033',
          textAlign: 'left',
          background: 'transparent',
          padding: 12,
        },
      },
    },
    {
      id: 'comp-1102',
      type: 'metric-card',
      position: { x: 40, y: 140, w: 260, h: 150 },
      zIndex: 2,
      props: {
        metricCardSchema: {
          title: '周访问量',
          valueField: 'visitors',
          aggregate: 'sum',
          prefix: '',
          suffix: '',
          decimals: 0,
          color: '#7c3aed',
          background: '#ffffff',
        },
      },
    },
    {
      id: 'comp-1103',
      type: 'metric-card',
      position: { x: 320, y: 140, w: 260, h: 150 },
      zIndex: 3,
      props: {
        metricCardSchema: {
          title: '平均转化率',
          valueField: 'conversion',
          aggregate: 'avg',
          prefix: '',
          suffix: '%',
          decimals: 1,
          color: '#0ea5e9',
          background: '#ffffff',
        },
      },
    },
    {
      id: 'comp-1104',
      type: 'chart-line',
      position: { x: 40, y: 320, w: 540, h: 340 },
      zIndex: 4,
      props: {
        chartSchema: {
          chartType: 'line',
          xAxisField: 'day',
          yAxisField: 'visitors',
          title: '访问趋势',
          color: '#7c3aed',
          customOption: '{}',
        },
      },
    },
    {
      id: 'comp-1105',
      type: 'chart-funnel',
      position: { x: 600, y: 140, w: 420, h: 260 },
      zIndex: 5,
      props: {
        chartSchema: {
          chartType: 'funnel',
          xAxisField: '',
          yAxisField: '',
          nameField: 'stage',
          valueField: 'users',
          title: '转化漏斗',
          color: '#0ea5e9',
          customOption: '{}',
        },
      },
    },
    {
      id: 'comp-1106',
      type: 'chart-bar',
      position: { x: 1040, y: 140, w: 340, h: 260 },
      zIndex: 6,
      props: {
        chartSchema: {
          chartType: 'bar',
          xAxisField: 'day',
          yAxisField: 'latency',
          title: '接口延迟',
          color: '#f97316',
          customOption: '{}',
        },
      },
    },
    {
      id: 'comp-1107',
      type: 'table',
      position: { x: 600, y: 430, w: 780, h: 230 },
      zIndex: 7,
      props: {
        tableSchema: {
          title: '运营明细',
          dataKey: 'opsRows',
          columns: tableColumns(['day', 'visitors', 'conversion', 'latency']),
          maxRows: 5,
          showHeader: true,
        },
      },
    },
  ]
}

function financeComponents(): ComponentInstance[] {
  return [
    {
      id: 'comp-1201',
      type: 'text',
      position: { x: 40, y: 32, w: 560, h: 86 },
      zIndex: 1,
      props: {
        textSchema: {
          content: '财务概览仪表盘',
          fontSize: 34,
          fontWeight: '800',
          color: '#172033',
          textAlign: 'left',
          background: 'transparent',
          padding: 12,
        },
      },
    },
    {
      id: 'comp-1202',
      type: 'metric-card',
      position: { x: 40, y: 140, w: 260, h: 150 },
      zIndex: 2,
      props: {
        metricCardSchema: {
          title: '收入合计',
          valueField: 'income',
          aggregate: 'sum',
          prefix: '',
          suffix: ' 万',
          decimals: 0,
          color: '#16a34a',
          background: '#ffffff',
        },
      },
    },
    {
      id: 'comp-1203',
      type: 'metric-card',
      position: { x: 320, y: 140, w: 260, h: 150 },
      zIndex: 3,
      props: {
        metricCardSchema: {
          title: '平均毛利率',
          valueField: 'marginRate',
          aggregate: 'avg',
          prefix: '',
          suffix: '%',
          decimals: 1,
          color: '#2563eb',
          background: '#ffffff',
        },
      },
    },
    {
      id: 'comp-1204',
      type: 'chart-line',
      position: { x: 40, y: 320, w: 540, h: 340 },
      zIndex: 4,
      props: {
        chartSchema: {
          chartType: 'line',
          xAxisField: 'month',
          yAxisField: 'income',
          title: '收入趋势',
          color: '#16a34a',
          customOption: '{}',
        },
      },
    },
    {
      id: 'comp-1205',
      type: 'chart-bar',
      position: { x: 600, y: 140, w: 420, h: 260 },
      zIndex: 5,
      props: {
        chartSchema: {
          chartType: 'bar',
          xAxisField: 'month',
          yAxisField: 'cashflow',
          title: '现金流',
          color: '#2563eb',
          customOption: '{}',
        },
      },
    },
    {
      id: 'comp-1206',
      type: 'chart-pie',
      position: { x: 1040, y: 140, w: 340, h: 260 },
      zIndex: 6,
      props: {
        chartSchema: {
          chartType: 'pie',
          xAxisField: '',
          yAxisField: '',
          nameField: 'department',
          valueField: 'cost',
          title: '成本结构',
          color: '#f59e0b',
          customOption: '{}',
        },
      },
    },
    {
      id: 'comp-1207',
      type: 'table',
      position: { x: 600, y: 430, w: 780, h: 230 },
      zIndex: 7,
      props: {
        tableSchema: {
          title: '财务明细',
          dataKey: 'financeRows',
          columns: tableColumns(['month', 'income', 'expense', 'cashflow']),
          maxRows: 6,
          showHeader: true,
        },
      },
    },
  ]
}

export const dashboardTemplates: DashboardTemplate[] = [
  {
    id: 'sales-operations',
    name: '销售经营',
    description: '适合展示销售额、利润、目标完成率和渠道收入。',
    tags: ['销售', '经营', '指标卡'],
    preview: {
      background: 'linear-gradient(135deg, #dbeafe 0%, #f8fafc 58%, #ccfbf1 100%)',
      accent: '#2563eb',
      label: 'Sales',
    },
    componentCount: salesComponents().length,
    createSchema: (title) => createSchema(title, salesComponents(), salesData),
  },
  {
    id: 'ops-monitoring',
    name: '运营监控',
    description: '适合展示访问趋势、转化漏斗、接口延迟和运营明细。',
    tags: ['运营', '监控', '漏斗'],
    preview: {
      background: 'linear-gradient(135deg, #ede9fe 0%, #f8fafc 55%, #e0f2fe 100%)',
      accent: '#7c3aed',
      label: 'Ops',
    },
    componentCount: opsComponents().length,
    createSchema: (title) => createSchema(title, opsComponents(), opsData),
  },
  {
    id: 'finance-overview',
    name: '财务概览',
    description: '适合展示收入、现金流、毛利率和成本结构。',
    tags: ['财务', '收入', '成本'],
    preview: {
      background: 'linear-gradient(135deg, #dcfce7 0%, #f8fafc 58%, #fef3c7 100%)',
      accent: '#16a34a',
      label: 'Finance',
    },
    componentCount: financeComponents().length,
    createSchema: (title) => createSchema(title, financeComponents(), financeData),
  },
]
