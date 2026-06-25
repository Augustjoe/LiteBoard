import { defineComponent, ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CirclePlus,
  Document,
  FolderOpened,
  MoreFilled,
  Plus,
} from '@element-plus/icons-vue'
import './TaskHubView.css'

/**
 * TaskHubView — 任务大厅
 *
 * UI baseline upgrade:
 * - 顶部工作台导航
 * - 左侧可信筛选栏
 * - 中央项目卡片网格
 * - 右侧最近更新与快捷操作
 *
 * 仍使用现有 /api/tasks，不新增后端字段。
 */

interface TaskSummary {
  id: string
  name: string
  description: string
  cover: string
  createdAt: string
  updatedAt: string
}

type TimeFilter = 'all' | 'today' | 'last7' | 'last30'

const API_BASE = '/api/tasks'

export default defineComponent({
  name: 'TaskHubView',
  setup() {
    const router = useRouter()

    // ==================== State ====================
    const tasks = ref<TaskSummary[]>([])
    const searchQuery = ref('')
    const loading = ref(false)
    const activeTime = ref<TimeFilter>('all')

    // 新建仪表盘弹窗
    const createDialogVisible = ref(false)
    const createForm = ref({ name: '', description: '' })
    const createLoading = ref(false)

    // ==================== Derived display data ====================
    const sortedTasks = computed(() =>
      [...tasks.value].sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    )

    const recentTasks = computed(() => sortedTasks.value.slice(0, 5))

    const filteredTasks = computed(() => {
      const q = searchQuery.value.trim().toLowerCase()
      return sortedTasks.value.filter((task) => {
        const matchesSearch = !q ||
          task.name.toLowerCase().includes(q) ||
          task.description.toLowerCase().includes(q)

        const matchesTime = matchesTimeFilter(task.updatedAt, activeTime.value)

        return matchesSearch && matchesTime
      })
    })

    const timeFilters = [
      { id: 'all' as const, label: '全部时间' },
      { id: 'today' as const, label: '今天' },
      { id: 'last7' as const, label: '近7天' },
      { id: 'last30' as const, label: '近30天' },
    ]

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
        ElMessage.warning('请输入仪表盘名称')
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

        ElMessage.success('仪表盘已创建')
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
        ElMessage.success('仪表盘已复制')
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
          '删除仪表盘',
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
        ElMessage.success('仪表盘已删除')
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

    function clearFilters() {
      activeTime.value = 'all'
      searchQuery.value = ''
    }

    // ==================== 格式化 / 派生展示 ====================

    function formatTime(iso: string): string {
      if (!iso) return ''
      const d = new Date(iso)
      const pad = (n: number) => String(n).padStart(2, '0')
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      return `${date} ${time}`
    }

    function matchesTimeFilter(iso: string, filter: TimeFilter): boolean {
      if (filter === 'all') return true
      const time = new Date(iso).getTime()
      if (Number.isNaN(time)) return true

      const now = Date.now()
      const day = 24 * 60 * 60 * 1000
      if (filter === 'today') return new Date(iso).toDateString() === new Date().toDateString()
      if (filter === 'last7') return now - time <= 7 * day
      if (filter === 'last30') return now - time <= 30 * day
      return true
    }

    function renderProjectThumb(task: TaskSummary) {
      return (
        <div class="task-thumb" style={{ background: task.cover }}>
          <div class="task-thumb__chrome">
            <span />
            <span />
            <span />
          </div>
          <div class="task-thumb__content">
            <div class="task-thumb__metric">
              <strong>8.6k</strong>
              <span>views</span>
            </div>
            <div class="task-thumb__chart" aria-hidden="true">
              {[48, 72, 56, 88, 64, 78].map((height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div class="task-thumb__spark">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      )
    }

    function renderProjectCard(task: TaskSummary, highlighted = false) {
      return (
        <article class={['task-card', highlighted && 'task-card--active']} key={task.id}>
          <div class="task-card__cover">
            {renderProjectThumb(task)}
          </div>

          <div class="task-card__body">
            <div class="task-card__title-row">
              <h3 class="task-card__name" title={task.name}>{task.name}</h3>
              <el-dropdown
                trigger="click"
                onCommand={(cmd: string) => {
                  if (cmd === 'copy') handleCopy(task.id)
                  else if (cmd === 'delete') handleDelete(task.id, task.name)
                }}
              >
                {{
                  default: () => (
                    <button class="task-card__more-btn" aria-label="更多操作">
                      <el-icon><MoreFilled /></el-icon>
                    </button>
                  ),
                  dropdown: () => (
                    <el-dropdown-menu>
                      <el-dropdown-item command="copy">复制仪表盘</el-dropdown-item>
                      <el-dropdown-item command="delete" divided style="color: #ef4444">
                        删除仪表盘
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  ),
                }}
              </el-dropdown>
            </div>

            <p class="task-card__time">更新于 {formatTime(task.updatedAt)}</p>

            <div class="task-card__meta-row">
              <span class="status-chip status-chip--saved">
                <i /> 已保存
              </span>
            </div>

            <div class="task-card__actions">
              <el-button
                size="small"
                icon="Edit"
                onClick={() => goEditor(task.id)}
              >
                编辑
              </el-button>
              <el-button
                size="small"
                icon="View"
                onClick={() => openPreview(task.id)}
              >
                预览
              </el-button>
            </div>
          </div>
        </article>
      )
    }

    // ==================== Lifecycle ====================
    onMounted(() => {
      fetchTasks()
    })

    // ==================== Render ====================
    return () => (
      <div class="task-hub">
        <header class="task-hub__topbar">
          <div class="task-hub__brand">
            <span class="task-hub__logo">
              <i />
              <i />
              <i />
            </span>
            <strong>LiteBoard</strong>
            <span class="task-hub__divider" />
            <span class="task-hub__section">任务大厅</span>
          </div>

          <div class="task-hub__search">
            <el-input
              v-model={searchQuery.value}
              placeholder="搜索仪表盘"
              prefix-icon="Search"
              clearable
            />
          </div>

          <div class="task-hub__actions">
            <el-button
              type="primary"
              icon="Plus"
              onClick={() => {
                createDialogVisible.value = true
              }}
            >
              新建仪表盘
            </el-button>
          </div>
        </header>

        <div class="task-hub__workspace">
          <aside class="task-hub__rail">
            <nav class="filter-section filter-section--primary">
              <button
                class={['filter-item', 'is-active']}
                onClick={clearFilters}
              >
                <span><el-icon><FolderOpened /></el-icon> 全部仪表盘</span>
                <em>{tasks.value.length}</em>
              </button>
            </nav>

            <section class="filter-section">
              <div class="filter-section__header">
                <span>更新时间</span>
              </div>
              {timeFilters.map((item) => (
                <button
                  key={item.id}
                  class={['filter-item', activeTime.value === item.id && 'is-active']}
                  onClick={() => { activeTime.value = item.id }}
                >
                  <span><i class="filter-radio" /> {item.label}</span>
                </button>
              ))}
            </section>
          </aside>

          <main class="task-hub__main" v-loading={loading.value}>
            <div class="task-hub__main-head">
              <div>
                <h1>全部仪表盘 ({filteredTasks.value.length})</h1>
                <p>管理、预览并继续编辑你的可视化仪表盘。</p>
              </div>
              {(searchQuery.value || activeTime.value !== 'all') && (
                <el-button text icon="RefreshLeft" onClick={clearFilters}>
                  清除筛选
                </el-button>
              )}
            </div>

            {filteredTasks.value.length === 0 && !loading.value ? (
              <div class="task-hub__empty">
                <div class="task-hub__empty-icon">
                  <el-icon><Document /></el-icon>
                </div>
                <h2>{searchQuery.value.trim() ? '没有匹配的仪表盘' : '暂无仪表盘'}</h2>
                <p>
                  {searchQuery.value.trim()
                    ? '请调整搜索或筛选条件。'
                    : '从空白画布开始，创建第一个 LiteBoard 仪表盘。'}
                </p>
                <el-button
                  type="primary"
                  icon="Plus"
                  onClick={() => {
                    createDialogVisible.value = true
                  }}
                >
                  新建仪表盘
                </el-button>
              </div>
            ) : (
              <div class="task-hub__grid">
                {filteredTasks.value.map((task, index) => renderProjectCard(task, index === 0))}
                {!searchQuery.value && activeTime.value === 'all' && (
                  <button
                    class="task-card task-card--create"
                    onClick={() => {
                      createDialogVisible.value = true
                    }}
                  >
                    <span><el-icon><Plus /></el-icon></span>
                    <strong>新建仪表盘</strong>
                  </button>
                )}
              </div>
            )}
          </main>

          <aside class="task-hub__side">
            <section class="side-panel">
              <h2>最近更新</h2>
              <div class="recent-list">
                {recentTasks.value.length === 0 ? (
                  <p class="side-empty">暂无最近仪表盘</p>
                ) : (
                  recentTasks.value.map((task) => (
                    <button
                      class="recent-item"
                      key={task.id}
                      onClick={() => goEditor(task.id)}
                    >
                      <div class="recent-item__thumb" style={{ background: task.cover }}>
                        <span />
                      </div>
                      <div>
                        <strong>{task.name}</strong>
                        <span>更新于 {formatTime(task.updatedAt)}</span>
                        <em>我</em>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section class="side-panel">
              <h2>快捷操作</h2>
              <div class="quick-actions">
                <button onClick={() => { createDialogVisible.value = true }}>
                  <el-icon><CirclePlus /></el-icon>
                  从空白创建
                </button>
              </div>
            </section>
          </aside>
        </div>

        <el-dialog
          v-model={createDialogVisible.value}
          title="新建仪表盘"
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
                <el-form-item label="仪表盘名称" required>
                  <el-input
                    v-model={createForm.value.name}
                    placeholder="例如：销售数据仪表盘"
                    maxlength={50}
                    show-word-limit
                    onKeydown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter') handleCreate()
                    }}
                  />
                </el-form-item>
                <el-form-item label="仪表盘描述（可选）">
                  <el-input
                    v-model={createForm.value.description}
                    type="textarea"
                    rows={3}
                    placeholder="简要描述仪表盘的用途..."
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
