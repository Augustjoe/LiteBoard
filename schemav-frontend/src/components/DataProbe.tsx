import { defineComponent, ref } from 'vue'
import { useEditorStore } from '../stores/editorStore'
import './DataProbe.css'

export default defineComponent({
  name: 'DataProbe',
  setup() {
    const store = useEditorStore()

    const targetUrl = ref('http://localhost:3000/api/mock-chart-data')
    const method = ref('GET')
    const probeResult = ref<unknown>(null)
    const extractedKeys = ref<string[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    const extractKeys = (data: unknown, prefix = ''): string[] => {
      let keys: string[] = []
      if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data)) {
          if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
            keys = keys.concat(extractKeys(data[0], `${prefix}[*].`))
          } else {
            keys.push(`${prefix}[*]`)
          }
        } else {
          for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
              const currentPath = prefix ? `${prefix}.${key}` : key
              keys.push(currentPath)
              const val = (data as Record<string, unknown>)[key]
              if (typeof val === 'object' && val !== null) {
                keys = keys.concat(extractKeys(val, currentPath))
              }
            }
          }
        }
      }
      return keys
    }

    const sendProbe = async () => {
      loading.value = true
      error.value = null
      probeResult.value = null
      extractedKeys.value = []

      try {
        const response = await fetch('http://localhost:3000/api/probe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetUrl: targetUrl.value,
            method: method.value,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || `HTTP error! Status: ${response.status}`)
        }

        const data = await response.json()
        probeResult.value = data
        extractedKeys.value = [...new Set(extractKeys(data))]

        // 🔗 将探针数据推入 Pinia Store，供图表组件消费
        const arr = Array.isArray(data) ? data : [data]
        store.setRawData(arr)
      } catch (err) {
        error.value = err instanceof Error ? err.message : String(err)
        console.error('Error sending probe:', err)
      } finally {
        loading.value = false
      }
    }

    return () => (
      <div class="data-probe-panel">
        <h3>数据探针面板</h3>
        <div class="input-group">
          <input
            value={targetUrl.value}
            onInput={(e: Event) => { targetUrl.value = (e.target as HTMLInputElement).value }}
            placeholder="输入目标 URL (e.g., https://api.example.com/data)"
          />
          <select
            value={method.value}
            onChange={(e: Event) => { method.value = (e.target as HTMLSelectElement).value }}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <button onClick={sendProbe}>发送探针</button>
        </div>
        {loading.value && <div class="loading">加载中...</div>}
        {error.value && <div class="error">错误: {error.value}</div>}
        {probeResult.value && (
          <div class="result-panel">
            <h4>探针结果:</h4>
            <pre>{JSON.stringify(probeResult.value, null, 2)}</pre>
            <h4>可用数据字段 (Keys):</h4>
            <ul>
              {extractedKeys.value.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  },
})
