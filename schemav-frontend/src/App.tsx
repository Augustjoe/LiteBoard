import { defineComponent, onMounted } from 'vue'
import { useEditorStore } from './stores/editorStore'
import EditorView from './views/EditorView'
import './style.css'

/**
 * App — 应用根组件（Node 5 升级）
 *
 * 初始化时自动从 localStorage 恢复上次保存的 Schema
 */
export default defineComponent({
  name: 'App',
  setup() {
    const store = useEditorStore()

    onMounted(() => {
      // 尝试从 localStorage 加载上一次保存的 Schema
      const loaded = store.loadSchema()
      if (loaded) {
        console.log('[App] 已恢复上次保存的项目')
      } else {
        console.log('[App] 新项目就绪，等待探针数据...')
      }
    })

    return () => <EditorView />
  },
})
