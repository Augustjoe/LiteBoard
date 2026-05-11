import { defineComponent } from 'vue'
import DataProbe from '../components/DataProbe'
import ChartRenderer from '../components/ChartRenderer'
import ChartConfigPanel from '../components/ChartConfigPanel'
import './EditorView.css'

export default defineComponent({
  name: 'EditorView',
  setup() {
    return () => (
      <div class="editor-shell">
        {/* 左侧探针区 */}
        <aside class="editor-panel editor-panel--left">
          <DataProbe />
        </aside>

        {/* 中间主工作区 — 点阵网格画布 */}
        <main class="editor-main">
          <div class="editor-canvas">
            <ChartRenderer />
          </div>
        </main>

        {/* 右侧配置区 */}
        <aside class="editor-panel editor-panel--right">
          <ChartConfigPanel />
        </aside>
      </div>
    )
  },
})
