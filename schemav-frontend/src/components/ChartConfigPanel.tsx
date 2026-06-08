import { computed, defineComponent, ref, watch } from 'vue'
import { debounce } from 'lodash-es'
import { Codemirror } from 'vue-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  useEditorStore,
  type ChartSchema,
  type ChartType,
  type TableSchema,
  type TextSchema,
} from '../stores/editorStore'
import { CHART_META, CORE_CHART_TYPES } from '../utils/chartOptions'

const chartTypesUsingXY = new Set<ChartType>(['bar', 'line', 'scatter'])
const chartTypesUsingNameValue = new Set<ChartType>(['pie', 'funnel'])

export default defineComponent({
  name: 'ChartConfigPanel',
  setup() {
    const store = useEditorStore()
    const jsExtension = javascript()
    const themeExtension = oneDark

    const selectedType = computed(() => store.selectedComponent?.type ?? '')
    const isChart = computed(() => selectedType.value.startsWith('chart-'))
    const isText = computed(() => selectedType.value === 'text')
    const isTable = computed(() => selectedType.value === 'table')

    const chartSchema = computed<ChartSchema>(() => {
      const cs = store.selectedComponent?.props?.chartSchema as ChartSchema | undefined
      return cs ?? { chartType: 'bar', xAxisField: '', yAxisField: '' }
    })

    const textSchema = computed<TextSchema>(() => {
      const schema = store.selectedComponent?.props?.textSchema as TextSchema | undefined
      return schema ?? {
        content: '仪表盘标题',
        fontSize: 32,
        fontWeight: '600',
        color: '#303133',
        textAlign: 'center',
        background: 'transparent',
        padding: 16,
      }
    })

    const tableSchema = computed<TableSchema>(() => {
      const schema = store.selectedComponent?.props?.tableSchema as TableSchema | undefined
      return schema ?? {
        title: '数据表格',
        dataKey: '',
        columns: [],
        maxRows: 8,
        showHeader: true,
      }
    })

    const localJsonText = ref('{}')
    const jsonError = ref<string | null>(null)
    let isProgrammaticUpdate = false

    watch(
      () => {
        const cs = store.selectedComponent?.props?.chartSchema as ChartSchema | undefined
        return cs?.customOption ?? '{}'
      },
      (newVal) => {
        isProgrammaticUpdate = true
        localJsonText.value = tryFormatJson(newVal)
        jsonError.value = null
        requestAnimationFrame(() => {
          isProgrammaticUpdate = false
        })
      },
      { immediate: true },
    )

    function tryFormatJson(raw: string): string {
      if (!raw || raw.trim() === '') return '{}'
      try {
        return JSON.stringify(JSON.parse(raw), null, 2)
      } catch {
        return raw
      }
    }

    const debouncedValidateAndCommit = debounce((text: string) => {
      if (isProgrammaticUpdate) return
      if (!text || text.trim() === '') {
        jsonError.value = null
        store.updateCustomOption('{}')
        return
      }
      try {
        jsonError.value = null
        store.updateCustomOption(JSON.stringify(JSON.parse(text)))
      } catch (err: unknown) {
        const message = err instanceof SyntaxError ? err.message : String(err)
        jsonError.value = `JSON 解析错误：${message}`
      }
    }, 500)

    const onJsonInput = (val: string) => {
      localJsonText.value = val
      debouncedValidateAndCommit(val)
    }

    const updateChart = (partial: Partial<ChartSchema>) => store.updateChartSchema(partial)
    const updateText = (partial: Partial<TextSchema>) => store.updateTextSchema(partial)
    const updateTable = (partial: Partial<TableSchema>) => store.updateTableSchema(partial)

    const onChartTypeChange = (val: string | number | boolean) => {
      const chartType = String(val) as ChartType
      const next: Partial<ChartSchema> = { chartType }
      if (chartTypesUsingNameValue.has(chartType)) {
        next.nameField = chartSchema.value.nameField || store.getDefaultNameField()
        next.valueField = chartSchema.value.valueField || store.getDefaultValueField()
      }
      if (chartType === 'gauge') {
        next.valueField = chartSchema.value.valueField || store.getDefaultValueField()
      }
      if (chartType === 'radar') {
        next.useCustomDataCode = true
      }
      updateChart(next)
    }

    const componentLabel = computed(() => {
      if (isText.value) return '文本组件'
      if (isTable.value) return '表格组件'
      if (isChart.value) return `${CHART_META[chartSchema.value.chartType]?.label ?? '图表'}组件`
      return '组件'
    })

    const tableDataKeys = computed(() => store.getTableDataKeys())

    const kindLabel = (kind: string) => {
      if (kind === 'field-array') return '字段数组'
      if (kind === 'table-array') return '数组对象'
      if (kind === 'mixed') return '混合数组'
      return '空数组'
    }

    const kindType = (kind: string) => {
      if (kind === 'field-array') return 'success'
      if (kind === 'table-array') return 'warning'
      if (kind === 'mixed') return 'danger'
      return 'info'
    }

    const renderOperations = () => (
      <div style={{
        marginBottom: '16px',
        padding: '12px',
        background: '#f5f7fa',
        borderRadius: '6px',
        border: '1px solid #ebeef5',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#303133' }}>
              组件操作
            </div>
            <div style={{ fontSize: '11px', color: '#909399', marginTop: '2px' }}>
              当前: {componentLabel.value} ({store.selectedComponent?.id})
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <el-button icon="CopyDocument" onClick={store.duplicateSelectedComponent}>复制</el-button>
            <el-button icon="Top" onClick={store.bringSelectedToFront}>置顶</el-button>
            <el-button icon="Bottom" onClick={store.sendSelectedToBack}>置底</el-button>
            <el-button
              type="danger"
              icon="Delete"
              plain
              onClick={() => store.selectedComponent && store.removeComponent(store.selectedComponent.id)}
            >
              删除
            </el-button>
          </div>
        </div>
      </div>
    )

    const renderDataSummary = () => (
      <div style={{
        marginBottom: '16px',
        padding: '12px',
        background: '#ecf5ff',
        borderRadius: '6px',
        border: '1px solid #d9ecff',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#409eff', marginBottom: '8px' }}>
          当前数据集
        </div>
        {store.globalData === null ? (
          <el-alert
            title="尚未创建当前数据集"
            type="warning"
            description="图表和表格需要先在左侧创建或更新数据集"
            show-icon
            closable={false}
          />
        ) : (
          <div style={{ fontSize: '12px', color: '#606266', lineHeight: '1.6' }}>
            <span style={{ color: '#67c23a', fontWeight: 600 }}>当前数据集已就绪</span>
            <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {store.dataPoolEntries.map((entry) => (
                <el-tag key={entry.name} type={kindType(entry.kind)} size="small">
                  {entry.name} · {kindLabel(entry.kind)} · {entry.length}
                </el-tag>
              ))}
            </div>
          </div>
        )}
      </div>
    )

    const renderTextConfig = () => (
      <div style={{ padding: '12px', background: '#f5f7fa', borderRadius: '6px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#303133', marginBottom: '12px' }}>
          文本配置
        </div>
        <el-form label-position="top" size="default">
          <el-form-item label="内容">
            <el-input
              type="textarea"
              rows={4}
              model-value={textSchema.value.content}
              onUpdate:model-value={(val: string) => updateText({ content: val })}
            />
          </el-form-item>
          <el-form-item label="字号">
            <el-input-number
              model-value={textSchema.value.fontSize}
              onUpdate:model-value={(val: number) => updateText({ fontSize: val || 16 })}
              min={10}
              max={120}
              style={{ width: '100%' }}
            />
          </el-form-item>
          <el-form-item label="字重">
            <el-select
              model-value={textSchema.value.fontWeight}
              onUpdate:model-value={(val: string) => updateText({ fontWeight: val })}
              style={{ width: '100%' }}
            >
              <el-option label="常规" value="400" />
              <el-option label="中等" value="500" />
              <el-option label="加粗" value="700" />
            </el-select>
          </el-form-item>
          <el-form-item label="颜色">
            <el-color-picker
              model-value={textSchema.value.color}
              onUpdate:model-value={(val: string) => updateText({ color: val || '#303133' })}
            />
          </el-form-item>
          <el-form-item label="对齐">
            <el-radio-group
              model-value={textSchema.value.textAlign}
              onUpdate:model-value={(val: 'left' | 'center' | 'right') => updateText({ textAlign: val })}
            >
              <el-radio-button label="left">左</el-radio-button>
              <el-radio-button label="center">中</el-radio-button>
              <el-radio-button label="right">右</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="背景">
            <el-select
              model-value={textSchema.value.background}
              onUpdate:model-value={(val: string) => updateText({ background: val })}
              style={{ width: '100%' }}
            >
              <el-option label="透明" value="transparent" />
              <el-option label="白底" value="#ffffff" />
              <el-option label="浅灰" value="#f5f7fa" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
    )

    const renderTableConfig = () => (
      <div style={{ padding: '12px', background: '#f5f7fa', borderRadius: '6px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#303133', marginBottom: '12px' }}>
          表格配置
        </div>
        <el-form label-position="top" size="default">
          <el-form-item label="标题">
            <el-input
              model-value={tableSchema.value.title}
              onUpdate:model-value={(val: string) => updateTable({ title: val })}
            />
          </el-form-item>
          <el-form-item label="数据源">
            <el-select
              model-value={tableSchema.value.dataKey}
              onUpdate:model-value={(val: string) => updateTable({ dataKey: val })}
              placeholder={tableDataKeys.value.length ? '选择数组对象数据集' : '暂无数组对象数据集'}
              disabled={tableDataKeys.value.length === 0}
              style={{ width: '100%' }}
            >
              {tableDataKeys.value.map((key) => (
                <el-option key={key} label={key} value={key} />
              ))}
            </el-select>
          </el-form-item>
          <el-form-item label="显示表头">
            <el-switch
              model-value={tableSchema.value.showHeader}
              onUpdate:model-value={(val: boolean) => updateTable({ showHeader: val })}
            />
          </el-form-item>
          <el-form-item label="最大行数">
            <el-input-number
              model-value={tableSchema.value.maxRows}
              onUpdate:model-value={(val: number) => updateTable({ maxRows: val || 8 })}
              min={1}
              max={100}
              style={{ width: '100%' }}
            />
          </el-form-item>
          <el-form-item label="显示列">
            {tableSchema.value.columns.length === 0 ? (
              <el-alert title="选择数据源后自动识别列" type="info" closable={false} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {tableSchema.value.columns.map((column) => (
                  <el-checkbox
                    key={column.key}
                    model-value={column.visible}
                    onUpdate:model-value={(val: boolean) => {
                      updateTable({
                        columns: tableSchema.value.columns.map((item) =>
                          item.key === column.key ? { ...item, visible: val } : item
                        ),
                      })
                    }}
                  >
                    {column.label}
                  </el-checkbox>
                ))}
              </div>
            )}
          </el-form-item>
        </el-form>
      </div>
    )

    const renderChartFields = () => {
      const type = chartSchema.value.chartType

      if (chartSchema.value.useCustomDataCode) {
        return (
          <el-form-item label="JS 数据转换代码">
            <div style={{ fontSize: '11px', color: '#909399', marginBottom: '4px' }}>
              变量 <strong>res</strong> 代表当前仪表盘数据集。柱/线/散点返回 <code>{`{ xAxis, yAxis }`}</code>，
              饼/漏斗返回 <code>{`{ name, value }`}</code>，仪表盘返回 <code>{`{ value }`}</code>，雷达返回 <code>{`{ indicator, value }`}</code>。
            </div>
            <div style={{ border: '1px solid #dcdfe6', borderRadius: '4px', overflow: 'hidden', height: '180px', width: '100%' }}>
              <Codemirror
                model-value={chartSchema.value.customDataCode || ''}
                onUpdate:model-value={(val: string) => updateChart({ customDataCode: val })}
                extensions={[jsExtension, themeExtension]}
              />
            </div>
          </el-form-item>
        )
      }

      if (type === 'radar') {
        return (
          <el-alert
            title="雷达图 v1 使用 JS 转换生成指标和值"
            type="info"
            show-icon
            closable={false}
          />
        )
      }

      if (chartTypesUsingNameValue.has(type)) {
        return (
          <>
            <el-form-item label="名称字段">
              <el-select
                model-value={chartSchema.value.nameField || ''}
                onUpdate:model-value={(val: string) => updateChart({ nameField: val })}
                style={{ width: '100%' }}
                clearable
                disabled={store.availableFields.length === 0}
              >
                {store.availableFields.map((field) => <el-option key={field} label={field} value={field} />)}
              </el-select>
            </el-form-item>
            <el-form-item label="数值字段">
              <el-select
                model-value={chartSchema.value.valueField || ''}
                onUpdate:model-value={(val: string) => updateChart({ valueField: val })}
                style={{ width: '100%' }}
                clearable
                disabled={store.availableFields.length === 0}
              >
                {store.availableFields.map((field) => <el-option key={field} label={field} value={field} />)}
              </el-select>
            </el-form-item>
          </>
        )
      }

      if (type === 'gauge') {
        return (
          <el-form-item label="数值字段">
            <el-select
              model-value={chartSchema.value.valueField || ''}
              onUpdate:model-value={(val: string) => updateChart({ valueField: val })}
              style={{ width: '100%' }}
              clearable
              disabled={store.availableFields.length === 0}
            >
              {store.availableFields.map((field) => <el-option key={field} label={field} value={field} />)}
            </el-select>
          </el-form-item>
        )
      }

      return (
        <>
          <el-form-item label="X 轴 / 维度字段">
            <el-select
              model-value={chartSchema.value.xAxisField}
              onUpdate:model-value={(val: string) => updateChart({ xAxisField: val })}
              style={{ width: '100%' }}
              clearable
              disabled={store.availableFields.length === 0}
            >
              {store.availableFields.map((field) => <el-option key={field} label={field} value={field} />)}
            </el-select>
          </el-form-item>
          <el-form-item label="Y 轴 / 指标字段">
            <el-select
              model-value={chartSchema.value.yAxisField}
              onUpdate:model-value={(val: string) => updateChart({ yAxisField: val })}
              style={{ width: '100%' }}
              clearable
              disabled={store.availableFields.length === 0}
            >
              {store.availableFields.map((field) => <el-option key={field} label={field} value={field} />)}
            </el-select>
          </el-form-item>
        </>
      )
    }

    const renderChartConfig = () => (
      <>
        {renderDataSummary()}
        <div style={{ marginBottom: '16px', padding: '12px', background: '#f5f7fa', borderRadius: '6px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#303133', marginBottom: '12px' }}>
            图表配置
          </div>
          <el-form label-position="top" size="default">
            <el-form-item label="图表标题">
              <el-input
                model-value={chartSchema.value.title || ''}
                onUpdate:model-value={(val: string) => updateChart({ title: val })}
                placeholder="图表标题"
              />
            </el-form-item>
            <el-form-item label="图表类型">
              <el-select
                model-value={chartSchema.value.chartType}
                onUpdate:model-value={onChartTypeChange}
                style={{ width: '100%' }}
              >
                {CORE_CHART_TYPES.map((type) => (
                  <el-option
                    key={type}
                    label={`${CHART_META[type].icon} ${CHART_META[type].label}`}
                    value={type}
                  />
                ))}
              </el-select>
            </el-form-item>
            <el-form-item label="主题颜色">
              <el-color-picker
                model-value={chartSchema.value.color || '#409eff'}
                onUpdate:model-value={(val: string) => updateChart({ color: val || '#409eff' })}
              />
            </el-form-item>
            <el-form-item label="数据来源模式">
              <el-radio-group
                model-value={chartSchema.value.useCustomDataCode || false}
                onUpdate:model-value={(val: string | number | boolean) => updateChart({ useCustomDataCode: Boolean(val) })}
              >
                <el-radio value={false} disabled={chartSchema.value.chartType === 'radar'}>数据集字段</el-radio>
                <el-radio value={true}>手写 JS 代码</el-radio>
              </el-radio-group>
            </el-form-item>
            {renderChartFields()}
          </el-form>
        </div>
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          background: '#fafafa',
          borderRadius: '6px',
          border: jsonError.value ? '1px solid #f56c6c' : '1px solid #ebeef5',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#303133' }}>ECharts JSON 配置</span>
            {jsonError.value ? <el-tag type="danger" size="small">格式错误</el-tag> : <el-tag type="success" size="small">有效 JSON</el-tag>}
          </div>
          <el-input
            type="textarea"
            rows={12}
            placeholder={'输入 ECharts JSON 配置...\n\n例如：\n{\n  "tooltip": { "trigger": "item" },\n  "series": [{ "radius": "70%" }]\n}'}
            model-value={localJsonText.value}
            onUpdate:model-value={onJsonInput}
            style={{ width: '100%' }}
          />
          {jsonError.value && (
            <div style={{ marginTop: '8px', color: '#f56c6c', fontSize: '12px', wordBreak: 'break-all' }}>
              {jsonError.value}
            </div>
          )}
        </div>
      </>
    )

    const renderPosition = () => store.selectedComponent && (
      <div style={{
        marginTop: '12px',
        padding: '12px',
        background: '#f5f7fa',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#909399',
        lineHeight: '1.8',
      }}>
        <div style={{ fontWeight: 600, marginBottom: '4px', color: '#606266' }}>位置 & 尺寸</div>
        <div>X: <strong style={{ color: '#409eff' }}>{store.selectedComponent.position.x}</strong> px</div>
        <div>Y: <strong style={{ color: '#409eff' }}>{store.selectedComponent.position.y}</strong> px</div>
        <div>宽度: <strong style={{ color: '#409eff' }}>{store.selectedComponent.position.w}</strong> px</div>
        <div>高度: <strong style={{ color: '#409eff' }}>{store.selectedComponent.position.h}</strong> px</div>
        <div>层级: <strong style={{ color: '#409eff' }}>{store.selectedComponent.zIndex}</strong></div>
      </div>
    )

    return () => (
      <div class="config-panel" style={{ padding: '20px', height: '100%', overflowY: 'auto' }}>
        <div style={{ marginBottom: '20px', borderBottom: '1px solid #ebeef5', paddingBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#303133' }}>
            {store.selectedComponent ? componentLabel.value : '组件配置'}
          </h3>
        </div>

        {!store.selectedComponent ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '40px 20px',
            color: '#909399',
          }}>
            <div style={{ fontSize: '36px', opacity: 0.4 }}>👆</div>
            <div style={{ fontSize: '14px', textAlign: 'center' }}>点击画布上的组件进行配置</div>
          </div>
        ) : (
          <>
            {renderOperations()}
            {isChart.value && renderChartConfig()}
            {isText.value && renderTextConfig()}
            {isTable.value && (
              <>
                {renderDataSummary()}
                {renderTableConfig()}
              </>
            )}
            {!isChart.value && !isText.value && !isTable.value && (
              <el-alert title="暂未支持该组件类型的配置面板" type="info" closable={false} />
            )}
            {renderPosition()}
          </>
        )}
      </div>
    )
  },
})
