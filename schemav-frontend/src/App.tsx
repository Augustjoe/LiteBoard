import { defineComponent } from 'vue'
import './style.css'

/**
 * App — 应用根组件（全栈重构）
 *
 * 移除旧的初始化逻辑，路由由 vue-router 接管。
 * 所有页面级逻辑下沉到各 View 组件。
 */
export default defineComponent({
  name: 'App',
  setup() {
    return () => <router-view />
  },
})
