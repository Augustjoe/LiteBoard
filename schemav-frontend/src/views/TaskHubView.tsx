import { defineComponent, ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import './TaskHubView.css'

/**
 * TaskHubView — 任务大厅（全栈重构 阶段 3）
 *
 * 功能：
 * - 顶部导航：品牌 Logo + 搜索框 + 新建按钮
 * - 响应式网格卡片列表
 * - 每张卡片：封面、名称、时间、操作按钮、更多菜单
 * - 新建任务弹窗表单
 */

interface TaskSummary {
  id: string
  name: string
  description: string
  cover: string
  createdAt: string
  updatedAt: string
}

const API_BASE = '/api/tasks'

export default defineComponent({
  name: 'TaskHubView',
  setup() {
    const router = useRouter()

    // ==================== State ====================
    const tasks = ref<TaskSummary[]>([])
    const searchQuery = ref('')
    const loading = ref(false)

    // 新建任务弹窗
    const createDialogVisible = ref(false)
    const createForm = ref({ name: '', description: '' })
    const createLoading = ref(false)

    // ==================== Computed ====================
    const filteredTasks = computed(() => {
      const q = searchQuery.value.trim().toLowerCase()
      if (!q) return tasks.value
      return tasks.value.filter((t) =>
        t.name.toLowerCase().includes(q)
      )
    })

    // ==================== API 方法 ====================

    async function fetchTasks() {
      loading.value = true
      try {
        const res = await fetch(API_BASE)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        tasks.value = await res.json()
      } catch (err) {
        console.error('[TaskHub] 获取任务列表失败:', err)
        ElMessage.error('无法加载任务列表')
      } finally {
        loading.value = false
      }
    }

    async function handleCreate() {
      const name = createForm.value.name.trim()
      if (!name) {
        ElMessage.warning('请输入任务名称')
        return
      }

      createLoading.value = true
      try {
        const res = await fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: createForm.value.description.trim(),
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        ElMessage.success('大屏任务已创建')
        createDialogVisible.value = false
        createForm.value = { name: '', description: '' }
        await fetchTasks()
      } catch (err) {
        console.error('[TaskHub] 创建任务失败:', err)
        ElMessage.error('创建任务失败')
      } finally {
        createLoading.value = false
      }
    }

    async function handleCopy(taskId: string) {
      try {
        const res = await fetch(`${API_BASE}/${taskId}/copy`, {
          method: 'POST',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        ElMessage.success('任务已复制')
        await fetchTasks()
      } catch (err) {
        console.error('[TaskHub] 复制任务失败:', err)
        ElMessage.error('复制任务失败')
      }
    }

    async function handleDelete(taskId: string, taskName: string) {
      try {
        await ElMessageBox.confirm(
          `确定要删除「${taskName}」吗？此操作不可撤销。`,
          '删除任务',
          {
            confirmButtonText: '确定删除',
            cancelButtonText: '取消',
            type: 'warning',
          },
        )
        const res = await fetch(`${API_BASE}/${taskId}`, {
          method: 'DELETE',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        ElMessage.success('任务已删除')
        await fetchTasks()
      } catch (err) {
        if (err === 'cancel' || err === 'close') return
        console.error('[TaskHub] 删除任务失败:', err)
        ElMessage.error('删除任务失败')
      }
    }

    function goEditor(taskId: string) {
      router.push(`/editor/${taskId}`)
    }

    function openPreview(taskId: string) {
      window.open(`/editor/${taskId}?preview=1`, '_blank')
    }

    // ==================== 格式化 ====================

    function formatTime(iso: string): string {
      if (!iso) return ''
      const d = new Date(iso)
      const pad = (n: number) => String(n).padStart(2, '0')
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      return `${date} ${time}`
    }

    // ==================== Lifecycle ====================
    onMounted(() => {
      fetchTasks()
    })

    // ==================== Render ====================
    return () => (
      <div class="task-hub">
        {/* ========== 顶部导航 ========== */}
        <header class="task-hub__header">
          <div class="task-hub__brand">
            <span class="task-hub__brand-icon">📊</span>
            <span>LiteBoard 任务大厅</span>
          </div>

          <div class="task-hub__actions">
            <el-input
              v-model={searchQuery.value}
              placeholder="按名称搜索任务..."
              prefix-icon="Search"
              clearable
              style={{ width: '260px' }}
            />

            <el-button
              type="primary"
              icon="Plus"
              onClick={() => {
                createDialogVisible.value = true
              }}
            >
              新建大屏任务
            </el-button>
          </div>
        </header>

        {/* ========== 任务网格 ========== */}
        <div
          class="task-hub__grid"
          v-loading={loading.value}
        >
          {filteredTasks.value.length === 0 && !loading.value ? (
            <div class="task-hub__empty">
              <div class="task-hub__empty-icon">📋</div>
              <p class="task-hub__empty-text">
                {searchQuery.value.trim()
                  ? '没有匹配的任务，请调整搜索条件'
                  : '暂无大屏任务，点击上方按钮创建第一个'}
              </p>
              {!searchQuery.value.trim() && (
                <el-button
                  type="primary"
                  icon="Plus"
                  onClick={() => {
                    createDialogVisible.value = true
                  }}
                >
                  新建大屏任务
                </el-button>
              )}
            </div>
          ) : (
            filteredTasks.value.map((task) => (
              <div class="task-card" key={task.id}>
                {/* ===== 右上角更多菜单 ===== */}
                <div class="task-card__more">
                  <el-dropdown
                    trigger="click"
                    onCommand={(cmd: string) => {
                      if (cmd === 'copy') handleCopy(task.id)
                      else if (cmd === 'delete') handleDelete(task.id, task.name)
                    }}
                  >
                    {{
                      default: () => (
                        <button
                          class="task-card__more-btn"
                          onClick={(e: MouseEvent) => e.stopPropagation()}
                        >
                          ···
                        </button>
                      ),
                      dropdown: () => (
                        <el-dropdown-menu>
                          <el-dropdown-item command="copy">
                              📋 复制大屏
                            </el-dropdown-item>
                            <el-dropdown-item
                              command="delete"
                              divided
                              style="color: #f56c6c"
                            >
                              🗑️ 删除任务
                            </el-dropdown-item>
                        </el-dropdown-menu>
                      ),
                    }}
                  </el-dropdown>
                </div>

                {/* ===== 封面区域 (16:9) ===== */}
                <div class="task-card__cover">
                  <div
                    class="task-card__cover-bg"
                    style={{ background: task.cover }}
                  >
                    <span class="task-card__cover-icon">📊</span>
                  </div>
                </div>

                {/* ===== 信息区 ===== */}
                <div class="task-card__info">
                  <p class="task-card__name" title={task.name}>
                    {task.name}
                  </p>
                  <p class="task-card__time">
                    最后修改：{formatTime(task.updatedAt)}
                  </p>
                </div>

                {/* ===== 操作按钮 ===== */}
                <div class="task-card__actions">
                  <el-button
                    size="small"
                    icon="View"
                    onClick={() => openPreview(task.id)}
                  >
                    全屏预览
                  </el-button>
                  <el-button
                    type="primary"
                    size="small"
                    icon="Edit"
                    onClick={() => goEditor(task.id)}
                  >
                    编辑大屏
                  </el-button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ========== 新建任务弹窗 ========== */}
        <el-dialog
          v-model={createDialogVisible.value}
          title="🆕 新建大屏任务"
          width="480px"
          close-on-click-modal={false}
          onClose={() => {
            createDialogVisible.value = false
            createForm.value = { name: '', description: '' }
          }}
        >
          {{
            default: () => (
              <el-form
                model={createForm.value}
                label-position="top"
                style="padding: 8px 0"
              >
                <el-form-item label="任务名称" required>
                  <el-input
                    v-model={createForm.value.name}
                    placeholder="例如：销售数据大屏"
                    maxlength={50}
                    show-word-limit
                    onKeydown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter') handleCreate()
                    }}
                  />
                </el-form-item>
                <el-form-item label="任务描述（可选）">
                  <el-input
                    v-model={createForm.value.description}
                    type="textarea"
                    rows={3}
                    placeholder="简要描述大屏的用途..."
                    maxlength={200}
                    show-word-limit
                  />
                </el-form-item>
              </el-form>
            ),
            footer: () => (
              <div style="display: flex; justify-content: flex-end; gap: 8px">
                <el-button
                  onClick={() => {
                    createDialogVisible.value = false
                  }}
                >
                  取消
                </el-button>
                <el-button
                  type="primary"
                  loading={createLoading.value}
                  onClick={handleCreate}
                >
                  确认创建
                </el-button>
              </div>
            ),
          }}
        </el-dialog>
      </div>
    )
  },
})
