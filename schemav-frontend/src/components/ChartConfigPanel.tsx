import { defineComponent, ref, computed, watch } from 'vue'
import { useEditorStore, type ChartSchema } from '../stores/editorStore'
import { debounce } from 'lodash-es'

/**
 * ChartConfigPanel — 图表配置面板（Node 5 专业级重构）
 *
 * 三段式布局：
 * 1. 危险操作区 — 删除选中的图表组件
 * 2. 基础配置区 — 图表类型、X/Y 轴字段选择
 * 3. 深度配置区 — ECharts JSON 编辑器，支持实时校验与双向同步
 *
 * Node 5 升级：
 * - 实时回显：选中组件时自动格式化展示 customOption
 * - 防抖校验：500ms debounce 后执行 JSON.parse，错误红字提示
 * - 安全写入：仅校验通过才更新 Pinia 状态，防止递归更新死循环
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

    // ==================== JSON 编辑器双向绑定（本地状态驱动，避免焦点丢失） ====================

    /** 本地编辑器文本 — 源在 store.customOption，但输入时先更新本地状态 */
    const localJsonText = ref('')

    /** JSON 校验错误信息，null 表示无错误 */
    const jsonError = ref<string | null>(null)

    /** 标记当前是否正在「程序化更新」（从 store → 本地），避免在 watch 中触发 debounce */
    let isProgrammaticUpdate = false

    /**
     * 监听 store 中 customOption 变化 → 同步回本地编辑器
     * 仅在「外部」变更时同步（如切换选中组件）
     */
    watch(
      () => {
        const cs = store.selectedComponent?.props?.chartSchema as ChartSchema | undefined
        return cs?.customOption ?? '{}'
      },
      (newVal) => {
        isProgrammaticUpdate = true
        localJsonText.value = tryFormatJson(newVal)
        jsonError.value = null
        // 下一个 tick 后恢复标记
        requestAnimationFrame(() => {
          isProgrammaticUpdate = false
        })
      },
      { immediate: true },
    )

    /**
     * 格式化 JSON 字符串：如果已是合法 JSON，则美化输出；否则原样返回
     */
    function tryFormatJson(raw: string): string {
      if (!raw || raw.trim() === '') return '{}'
      try {
        const parsed = JSON.parse(raw)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return raw
      }
    }

    /**
     * 防抖校验 + 安全写入
     * 仅在 JSON 解析成功时调用 store.updateCustomOption
     * 解析失败则显示红色错误信息
     */
    const debouncedValidateAndCommit = debounce((text: string) => {
      // 如果当前是程序化更新（从 store 同步过来的），跳过
      if (isProgrammaticUpdate) return

      if (!text || text.trim() === '') {
        jsonError.value = null
        // 空文本视为清空 customOption
        store.updateCustomOption('{}')
        return
      }

      try {
        const parsed = JSON.parse(text)
        // 校验通过：清除错误，写入 store（格式化后的 JSON）
        jsonError.value = null
        const formatted = JSON.stringify(parsed)
        store.updateCustomOption(formatted)
      } catch (err: unknown) {
        // 校验失败：显示错误，不更新 store
        const message = err instanceof SyntaxError ? err.message : String(err)
        jsonError.value = `JSON 解析错误：${message}`
      }
    }, 500)

    /**
     * 编辑器输入事件处理
     * 1. 立即更新本地文本（保证输入流畅不丢焦点）
     * 2. 触发防抖校验
     */
    const onJsonInput = (val: string) => {
      localJsonText.value = val
      debouncedValidateAndCommit(val)
    }

    // ==================== 基础配置处理 ====================

    const onChartTypeChange = (val: string | number | boolean) => {
      store.updateChartSchema({ chartType: String(val) as ChartSchema['chartType'] })
    }

    const onXFieldChange = (val: string | number | boolean) => {
      store.updateChartSchema({ xAxisField: String(val) })
    }

    const onYFieldChange = (val: string | number | boolean) => {
      store.updateChartSchema({ yAxisField: String(val) })
    }

    /** 删除当前选中组件 */
    const onDeleteComponent = () => {
      if (store.selectedComponent) {
        store.removeComponent(store.selectedComponent.id)
      }
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
            {/* ==================== 危险操作区 ==================== */}
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              background: '#fef0f0',
              borderRadius: '6px',
              border: '1px solid #fde2e2',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f56c6c' }}>
                    ⚠️ 危险操作区
                  </div>
                  <div style={{ fontSize: '11px', color: '#e6a23c', marginTop: '2px' }}>
                    当前: {store.selectedComponent.type} ({store.selectedComponent.id})
                  </div>
                </div>
                <el-button
                  type="danger"
                  icon="Delete"
                  plain
                  onClick={onDeleteComponent}
                >
                  删除选中图表
                </el-button>
              </div>
            </div>

            {/* ==================== 基础配置区 ==================== */}
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              background: '#f5f7fa',
              borderRadius: '6px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#303133', marginBottom: '12px' }}>
                ⚙️ 基础配置
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
            </div>

            {/* ==================== 深度配置区（Node 5 升级：实时校验+双向同步） ==================== */}
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              background: '#fafafa',
              borderRadius: '6px',
              border: jsonError.value
                ? '1px solid #f56c6c'
                : '1px solid #ebeef5',
              transition: 'border-color 0.2s',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#303133' }}>
                  🧠 深度配置 (JSON Editor)
                </span>
                {jsonError.value ? (
                  <el-tag type="danger" size="small">❌ 格式错误</el-tag>
                ) : (
                  <el-tag type="success" size="small">✅ 有效 JSON</el-tag>
                )}
              </div>

              <el-alert
                title="填写的 JSON 将与基础图表深度合并"
                type="info"
                closable={false}
                show-icon
                style={{ marginBottom: '8px' }}
              />

              <el-input
                type="textarea"
                rows={12}
                placeholder={'输入 ECharts JSON 配置...\n\n例如：\n{\n  "title": { "text": "自定义标题" },\n  "tooltip": { "trigger": "item" },\n  "series": [{\n    "itemStyle": { "color": "#ff6b6b" }\n  }]\n}'}
                model-value={localJsonText.value}
                onUpdate:model-value={onJsonInput}
                style={{ width: '100%' }}
                class={jsonError.value ? 'json-editor--error' : ''}
              />

              {/* 错误反馈 */}
              {jsonError.value && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  background: '#fef0f0',
                  borderRadius: '4px',
                  border: '1px solid #fde2e2',
                  fontSize: '12px',
                  color: '#f56c6c',
                  lineHeight: '1.6',
                  wordBreak: 'break-all',
                }}>
                  <strong>⚠ {jsonError.value}</strong>
                </div>
              )}

              <div style={{ fontSize: '11px', color: '#909399', marginTop: '6px' }}>
                提示：输入内容将实时校验，仅合法 JSON 才会生效。
              </div>
            </div>

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
