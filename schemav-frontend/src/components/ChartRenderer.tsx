import { defineComponent } from 'vue'
import { useEditorStore } from '../stores/editorStore'
import ComponentWrapper from './ComponentWrapper'

/**
 * ChartRenderer — 渲染分发器
 *
 * Node 4 升级：不再负责单一图表渲染，而是遍历 store.components 数组，
 * 为每个 ComponentInstance 生成一个 ComponentWrapper（绝对定位包装层）。
 */
export default defineComponent({
  name: 'ChartRenderer',
  setup() {
    const store = useEditorStore()

    return () => (
      <div
        class="chart-renderer"
        style={{
          position: 'absolute',
          inset: 0,
        }}
        onClick={() => {
          // 点击画布空白区域取消选中
          store.selectComponent(null)
        }}
      >
        {store.components.map((comp) => (
          <ComponentWrapper key={comp.id} component={comp} />
        ))}

        {/* 空画布引导提示 */}
        {store.components.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: '12px',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: '48px', opacity: 0.3 }}>📐</div>
            <div style={{ fontSize: '16px', color: '#909399' }}>
              画布为空 — 请在左侧探针面板获取数据并发送到画布
            </div>
            <div style={{ fontSize: '12px', color: '#c0c4cc' }}>
              提示：点击「发送探针」后，数据将自动创建图表组件
            </div>
          </div>
        )}
      </div>
    )
  },
})
