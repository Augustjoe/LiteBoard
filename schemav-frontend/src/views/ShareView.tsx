import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import ChartRenderer from '../components/ChartRenderer'
import { useEditorStore, type Task } from '../stores/editorStore'
import './ShareView.css'

export default defineComponent({
  name: 'ShareView',
  setup() {
    const route = useRoute()
    const store = useEditorStore()
    const loading = ref(true)
    const errorMessage = ref('')
    const viewport = ref({
      width: window.innerWidth,
      height: window.innerHeight,
    })

    const updateViewport = () => {
      viewport.value = {
        width: window.innerWidth,
        height: window.innerHeight,
      }
    }

    const fitScale = computed(() => {
      const width = store.canvasConfig.width || 1920
      const height = store.canvasConfig.height || 1080
      const maxWidth = Math.max(320, viewport.value.width - 48)
      const maxHeight = Math.max(240, viewport.value.height - 64)
      return Math.max(0.2, Math.min(1, maxWidth / width, maxHeight / height))
    })

    onMounted(async () => {
      window.addEventListener('resize', updateViewport)
      const taskId = route.params.taskId as string | undefined
      if (!taskId) {
        loading.value = false
        errorMessage.value = '该仪表盘未发布或不存在'
        return
      }

      try {
        store.resetAll()
        const res = await fetch(`/api/share/${taskId}`)
        if (!res.ok) {
          throw new Error('该仪表盘未发布或不存在')
        }

        const task: Task = await res.json()
        store.currentTaskId = task.id
        store.applySchema(task.schema)
        store.isPublished = true
        store.publishedAt = task.publishedAt ?? null
        if (!store.isFullscreenPreview) {
          store.toggleFullscreenPreview()
        }
      } catch (err) {
        errorMessage.value = err instanceof Error ? err.message : '该仪表盘未发布或不存在'
      } finally {
        loading.value = false
      }
    })

    onUnmounted(() => {
      window.removeEventListener('resize', updateViewport)
      if (store.isFullscreenPreview) {
        store.toggleFullscreenPreview()
      }
    })

    return () => (
      <div class="share-view" v-loading={loading.value}>
        {!loading.value && errorMessage.value ? (
          <div class="share-view__empty">
            <el-empty description={errorMessage.value}>
              {{
                default: () => (
                  <div class="share-view__empty-copy">
                    请确认该仪表盘已经发布，或联系创建者重新分享链接。
                  </div>
                ),
              }}
            </el-empty>
          </div>
        ) : (
          <main class="share-view__stage">
            <div
              class="share-view__frame"
              style={{
                width: `${store.canvasConfig.width * fitScale.value}px`,
                height: `${store.canvasConfig.height * fitScale.value}px`,
              }}
            >
              <div
                class="canvas-content canvas-content--preview share-view__canvas"
                style={{
                  width: `${store.canvasConfig.width}px`,
                  height: `${store.canvasConfig.height}px`,
                  transform: `scale(${fitScale.value})`,
                  backgroundColor: store.canvasConfig.background || '#ffffff',
                }}
              >
                <ChartRenderer />
              </div>
            </div>
          </main>
        )}
      </div>
    )
  },
})
