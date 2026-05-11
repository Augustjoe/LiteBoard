import { defineComponent } from 'vue'
import EditorView from './views/EditorView'
import './style.css'

export default defineComponent({
  name: 'App',
  setup() {
    return () => (
      <EditorView />
    )
  },
})
