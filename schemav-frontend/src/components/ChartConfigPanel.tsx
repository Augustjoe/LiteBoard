import { defineComponent, computed } from 'vue'
import { useEditorStore } from '../stores/editorStore'
import type { ChartSchema } from '../stores/editorStore'

/**
 * ChartConfigPanel — 图表配置面板
 *
 * Node 4 升级：不再依赖全局单一 chartSchema，而是读取当前选中组件的 props.chartSchema。
 * 若未选中任何组件，显示引导提示。
 */
export default defineComponent({
  name: 'ChartConfigPanel',
  setup() {
    const store = useEditorStore()

    /** 当前选中组件的 chartSchema（快捷访问） */
    const schema = computed<ChartSchema>(() => {
      const comp = store.selectedComponent
      if (!comp) return { chartType: 'bar', xAxisField: '', yAxisField: '' }
      const cs = comp.props.chartSchema as ChartSchema | undefined
      return cs ?? { chartType: 'bar', xAxisField: '', yAxisField: '' }
    })

    const onChartTypeChange = (val: string | number | boolean) => {
      store.updateChartSchema({ chartType: String(val) as ChartSchema['chartType'] })
    }

    const onXFieldChange = (val: string | number | boolean) => {
      store.updateChartSchema({ xAxisField: String(val) })
    }

    const onYFieldChange = (val: string | number | boolean) => {
      store.updateChartSchema({ yAxisField: String(val) })
    }

    return () => (
      <div class="config-panel" style={{ padding: '20px', height: '100%', overflowY: 'auto' }}>
        {/* 面板标题 */}
        <div style={{ marginBottom: '24px', borderBottom: '1px solid #ebeef5', paddingBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#303133' }}>
            📐 图表配置
          </h3>
        </div>

        {/* 未选中组件时显示引导 */}
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
            <div style={{ fontSize: '14px', textAlign: 'center' }}>
              点击画布上的组件进行配置
            </div>
            <div style={{ fontSize: '12px', color: '#c0c4cc' }}>
              或先在左侧探针面板获取数据
            </div>
          </div>
        ) : (
          <>
            {/* 当前选中组件信息 */}
            <div style={{
              marginBottom: '16px',
              padding: '8px 12px',
              background: '#ecf5ff',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#409eff',
            }}>
              正在编辑: <strong>{store.selectedComponent.type}</strong> ({store.selectedComponent.id})
            </div>

            <el-form label-position="top" size="default">
              {/* 图表类型 */}
              <el-form-item label="图表类型">
                <el-radio-group
                  model-value={schema.value.chartType}
                  onUpdate:model-value={onChartTypeChange}
                >
                  <el-radio-button value="bar">📊 柱状图</el-radio-button>
                  <el-radio-button value="line">📈 折线图</el-radio-button>
                </el-radio-group>
              </el-form-item>

              {/* X 轴字段 */}
              <el-form-item label="X 轴 (维度)">
                <el-select
                  model-value={schema.value.xAxisField}
                  onUpdate:model-value={onXFieldChange}
                  placeholder="选择分类 / 维度字段"
                  style={{ width: '100%' }}
                  clearable
                >
                  {store.availableFields.map((field) => (
                    <el-option key={field} label={field} value={field} />
                  ))}
                </el-select>
              </el-form-item>

              {/* Y 轴字段 */}
              <el-form-item label="Y 轴 (指标)">
                <el-select
                  model-value={schema.value.yAxisField}
                  onUpdate:model-value={onYFieldChange}
                  placeholder="选择数据 / 指标字段"
                  style={{ width: '100%' }}
                  clearable
                >
                  {store.availableFields.map((field) => (
                    <el-option key={field} label={field} value={field} />
                  ))}
                </el-select>
              </el-form-item>
            </el-form>

            {/* 位置信息（实时显示） */}
            {store.selectedComponent && (
              <div style={{
                marginTop: '8px',
                padding: '12px',
                background: '#f5f7fa',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#909399',
                lineHeight: '1.8',
              }}>
                <div style={{ fontWeight: 600, marginBottom: '4px', color: '#606266' }}>
                  📋 位置 & 尺寸
                </div>
                <div>X: <strong style={{ color: '#409eff' }}>{store.selectedComponent.position.x}</strong> px</div>
                <div>Y: <strong style={{ color: '#409eff' }}>{store.selectedComponent.position.y}</strong> px</div>
                <div>宽度: <strong style={{ color: '#409eff' }}>{store.selectedComponent.position.w}</strong> px</div>
                <div>高度: <strong style={{ color: '#409eff' }}>{store.selectedComponent.position.h}</strong> px</div>
                <div>层级: <strong style={{ color: '#409eff' }}>{store.selectedComponent.zIndex}</strong></div>
              </div>
            )}

            {/* 当前配置预览 */}
            <div style={{
              marginTop: '8px',
              padding: '12px',
              background: '#f5f7fa',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#909399',
              lineHeight: '1.8',
            }}>
              <div style={{ fontWeight: 600, marginBottom: '4px', color: '#606266' }}>
                📋 当前绑定
              </div>
              <div>类型：<strong style={{ color: '#409eff' }}>{
                schema.value.chartType === 'bar' ? '柱状图' : '折线图'
              }</strong></div>
              <div>X 轴：<strong style={{ color: '#409eff' }}>{
                schema.value.xAxisField || '(未选择)'
              }</strong></div>
              <div>Y 轴：<strong style={{ color: '#409eff' }}>{
                schema.value.yAxisField || '(未选择)'
              }</strong></div>
              <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #dcdfe6' }}>
                可用字段：{store.availableFields.length > 0
                  ? store.availableFields.join(', ')
                  : '(暂无数据)'}
              </div>
            </div>
          </>
        )}

        {/* 无数据提示 */}
        {!store.hasData && (
          <el-alert
            title="暂无数据"
            type="info"
            description="请先在左侧探针面板获取数据"
            show-icon
            closable={false}
            style={{ marginTop: '16px' }}
          />
        )}
      </div>
    )
  },
})
