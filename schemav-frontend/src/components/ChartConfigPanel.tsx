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
import { CHART_META, CORE_CHART_TYPES, getChartBlockReason } from '../utils/chartOptions'

const chartTypesUsingXY = new Set<ChartType>(['bar', 'line', 'scatter'])
const chartTypesUsingNameValue = new Set<ChartType>(['pie', 'funnel'])

export default defineComponent({
  name: 'ChartConfigPanel',
  emits: ['openDataManager'],
  setup(_props, { emit }) {
    const store = useEditorStore()
    const activeTab = ref<'data' | 'style' | 'advanced'>('data')
    const fieldSearch = ref('')
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

    const componentLabel = computed(() => {
      if (isText.value) return '文本'
      if (isTable.value) return '表格'
      if (isChart.value) return CHART_META[chartSchema.value.chartType]?.label ?? '图表'
      return '组件'
    })

    const chartReason = computed(() => {
      if (!isChart.value) return null
      return getChartBlockReason(chartSchema.value, store.globalData)
    })

    const chartReasonText = computed(() => {
      const reason = chartReason.value
      if (!reason) return ''
      if (reason === 'no_global_data') return '当前仪表盘还没有数据集，请先更新数据集。'
      if (reason === 'no_custom_code') return '当前图表需要 JS 转换代码。'
      if (reason === 'no_binding') return '请补齐当前图表需要的数据字段。'
      if (reason === 'field_not_found') return '绑定字段在当前数据集中不存在。'
      if (reason === 'empty') return '绑定字段为空数组。'
      if (reason === 'length_mismatch') return '绑定字段数组长度不一致。'
      if (reason === 'complex_x') return '维度字段包含对象值，请改用 JS 转换。'
      if (reason === 'non_numeric_value') return '数值字段需要是数值数组。'
      return '请检查数据绑定配置。'
    })

    const tableDataKeys = computed(() => store.getTableDataKeys())

    const filterFields = (fields: string[]) => {
      const keyword = fieldSearch.value.trim().toLowerCase()
      if (!keyword) return fields
      return fields.filter((field) => field.toLowerCase().includes(keyword))
    }

    const filteredDimensionFields = computed(() => filterFields(store.dimensionFields))
    const filteredNumericFields = computed(() => filterFields(store.numericFields))
    const filteredTableKeys = computed(() => filterFields(tableDataKeys.value))

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

    watch(
      () => store.selectedComponentId,
      () => {
        activeTab.value = 'data'
      },
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

    const renderFieldSelect = (
      label: string,
      value: string | undefined,
      onChange: (value: string) => void,
      placeholder = '选择字段',
    ) => (
      <el-form-item label={label}>
        <el-select
          model-value={value || ''}
          onUpdate:model-value={onChange}
          placeholder={placeholder}
          style={{ width: '100%' }}
          clearable
          disabled={store.availableFields.length === 0}
        >
          {store.availableFields.map((field) => (
            <el-option key={field} label={field} value={field} />
          ))}
        </el-select>
      </el-form-item>
    )

    const renderChartDataFields = () => {
      const type = chartSchema.value.chartType

      if (chartSchema.value.useCustomDataCode) {
        return (
          <el-form-item label="JS 数据转换">
            <div class="config-help">
              变量 <strong>res</strong> 代表当前数据集。雷达图返回 <code>{`{ indicator, value }`}</code>，其他图表按类型返回字段数组。
            </div>
            <div class="code-editor-panel">
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
            title="雷达图 v1 使用 JS 转换生成 indicator/value"
            type="info"
            show-icon
            closable={false}
          />
        )
      }

      if (chartTypesUsingNameValue.has(type)) {
        return (
          <>
            {renderFieldSelect('名称字段', chartSchema.value.nameField, (val) => updateChart({ nameField: val }))}
            {renderFieldSelect('数值字段', chartSchema.value.valueField, (val) => updateChart({ valueField: val }))}
          </>
        )
      }

      if (type === 'gauge') {
        return renderFieldSelect('数值字段', chartSchema.value.valueField, (val) => updateChart({ valueField: val }))
      }

      return (
        <>
          {renderFieldSelect('维度字段', chartSchema.value.xAxisField, (val) => updateChart({ xAxisField: val }))}
          {renderFieldSelect('指标字段', chartSchema.value.yAxisField, (val) => updateChart({ yAxisField: val }))}
        </>
      )
    }

    const renderDataTab = () => (
      <div class="config-section">
        {isChart.value && (
          <el-form label-position="top" size="default">
            <el-form-item label="图表类型">
              <el-select
                model-value={chartSchema.value.chartType}
                onUpdate:model-value={onChartTypeChange}
                style={{ width: '100%' }}
              >
                {CORE_CHART_TYPES.map((type) => (
                  <el-option key={type} label={`${CHART_META[type].icon} ${CHART_META[type].label}`} value={type} />
                ))}
              </el-select>
            </el-form-item>
            <el-form-item label="数据来源">
              <el-radio-group
                model-value={chartSchema.value.useCustomDataCode || false}
                onUpdate:model-value={(val: string | number | boolean) => updateChart({ useCustomDataCode: Boolean(val) })}
              >
                <el-radio value={false} disabled={chartSchema.value.chartType === 'radar'}>数据集字段</el-radio>
                <el-radio value={true}>JS 转换</el-radio>
              </el-radio-group>
            </el-form-item>
            {renderChartDataFields()}
            {chartReasonText.value && (
              <el-alert title={chartReasonText.value} type="warning" show-icon closable={false} />
            )}
          </el-form>
        )}

        {isTable.value && (
          <el-form label-position="top" size="default">
            <el-form-item label="数据源">
              <el-select
                model-value={tableSchema.value.dataKey}
                onUpdate:model-value={(val: string) => updateTable({ dataKey: val })}
                placeholder={tableDataKeys.value.length ? '选择数组对象数据集' : '暂无数组对象数据集'}
                disabled={tableDataKeys.value.length === 0}
                style={{ width: '100%' }}
              >
                {tableDataKeys.value.map((key) => <el-option key={key} label={key} value={key} />)}
              </el-select>
            </el-form-item>
            <el-form-item label="显示列">
              {tableSchema.value.columns.length === 0 ? (
                <el-alert title="选择数据源后自动识别列" type="info" closable={false} />
              ) : (
                <div class="column-check-list">
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
        )}

        {isText.value && (
          <el-alert title="文本组件不依赖数据集，可在样式中编辑内容和视觉属性。" type="info" closable={false} />
        )}
      </div>
    )

    const renderStyleTab = () => (
      <div class="config-section">
        {isChart.value && (
          <el-form label-position="top" size="default">
            <el-form-item label="图表标题">
              <el-input
                model-value={chartSchema.value.title || ''}
                onUpdate:model-value={(val: string) => updateChart({ title: val })}
                placeholder="图表标题"
              />
            </el-form-item>
            <el-form-item label="主题颜色">
              <el-color-picker
                model-value={chartSchema.value.color || '#409eff'}
                onUpdate:model-value={(val: string) => updateChart({ color: val || '#409eff' })}
              />
            </el-form-item>
          </el-form>
        )}

        {isText.value && (
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
        )}

        {isTable.value && (
          <el-form label-position="top" size="default">
            <el-form-item label="标题">
              <el-input
                model-value={tableSchema.value.title}
                onUpdate:model-value={(val: string) => updateTable({ title: val })}
              />
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
          </el-form>
        )}
      </div>
    )

    const renderAdvancedTab = () => (
      <div class="config-section">
        {isChart.value && (
          <div class="advanced-block">
            <div class="advanced-block__title">ECharts JSON</div>
            <el-input
              type="textarea"
              rows={12}
              placeholder={'输入 ECharts JSON 配置...\n\n例如：\n{\n  "tooltip": { "trigger": "item" },\n  "series": [{ "radius": "70%" }]\n}'}
              model-value={localJsonText.value}
              onUpdate:model-value={(val: string) => {
                localJsonText.value = val
                debouncedValidateAndCommit(val)
              }}
              style={{ width: '100%' }}
            />
            {jsonError.value && <div class="config-error">{jsonError.value}</div>}
          </div>
        )}

        {store.selectedComponent && (
          <div class="advanced-block">
            <div class="advanced-block__title">位置与尺寸</div>
            <div class="position-grid">
              <span>X</span><strong>{store.selectedComponent.position.x}</strong>
              <span>Y</span><strong>{store.selectedComponent.position.y}</strong>
              <span>宽</span><strong>{store.selectedComponent.position.w}</strong>
              <span>高</span><strong>{store.selectedComponent.position.h}</strong>
              <span>层级</span><strong>{store.selectedComponent.zIndex}</strong>
            </div>
          </div>
        )}

        {store.selectedComponent && (
          <div class="advanced-block">
            <div class="advanced-block__title">组件操作</div>
            <div class="advanced-actions">
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
        )}
      </div>
    )

    const renderFieldGroup = (title: string, fields: string[], type: 'dimension' | 'metric' | 'dataset') => (
      <div class="field-group">
        <div class="field-group__title">{title}</div>
        {fields.length === 0 ? (
          <div class="field-group__empty">暂无字段</div>
        ) : (
          fields.map((field) => (
            <div class={['field-row', `field-row--${type}`]} key={`${type}-${field}`}>
              <span>{type === 'metric' ? '#' : type === 'dimension' ? 'T' : '▦'}</span>
              <span>{field}</span>
            </div>
          ))
        )}
      </div>
    )

    const renderFieldsPanel = () => (
      <aside class="fields-panel">
        <div class="fields-panel__header">
          <div>
            <div class="fields-panel__title">数据集</div>
            <div class="fields-panel__subtitle">{store.globalData ? `${store.dataPoolEntries.length} 个条目` : '未创建'}</div>
          </div>
          <el-button link size="small" onClick={() => emit('openDataManager')}>管理</el-button>
        </div>
        <el-input
          model-value={fieldSearch.value}
          onUpdate:model-value={(val: string) => { fieldSearch.value = val }}
          placeholder="搜索字段"
          size="small"
          clearable
        />
        <div class="fields-panel__body">
          {store.globalData === null ? (
            <el-empty description="尚未创建数据集">
              {{
                default: () => (
                  <el-button type="primary" size="small" onClick={() => emit('openDataManager')}>
                    创建数据集
                  </el-button>
                ),
              }}
            </el-empty>
          ) : (
            <>
              {renderFieldGroup('维度', filteredDimensionFields.value, 'dimension')}
              {renderFieldGroup('指标', filteredNumericFields.value, 'metric')}
              {renderFieldGroup('数组对象数据集', filteredTableKeys.value, 'dataset')}
            </>
          )}
        </div>
      </aside>
    )

    return () => (
      <div class="config-panel config-panel--split">
        <section class="properties-panel">
          <div class="properties-panel__header">
            <div>
              <div class="properties-panel__title">
                {store.selectedComponent ? componentLabel.value : '属性配置'}
              </div>
              <div class="properties-panel__subtitle">
                {store.selectedComponent ? store.selectedComponent.type : '选中画布组件后开始配置'}
              </div>
            </div>
          </div>

          {!store.selectedComponent ? (
            <div class="properties-empty">
              <div class="properties-empty__icon">↖</div>
              <div>从顶部工具栏添加组件，或选中画布上的组件。</div>
            </div>
          ) : (
            <el-tabs
              model-value={activeTab.value}
              onUpdate:model-value={(val: 'data' | 'style' | 'advanced') => { activeTab.value = val }}
              class="properties-tabs"
            >
              <el-tab-pane label="数据" name="data">{renderDataTab()}</el-tab-pane>
              <el-tab-pane label="样式" name="style">{renderStyleTab()}</el-tab-pane>
              <el-tab-pane label="高级" name="advanced">{renderAdvancedTab()}</el-tab-pane>
            </el-tabs>
          )}
        </section>
        {renderFieldsPanel()}
      </div>
    )
  },
})
