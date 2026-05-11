<template>
  <div class="data-probe-panel">
    <h3>数据探针面板</h3>
    <div class="input-group">
      <input v-model="targetUrl" placeholder="输入目标 URL (e.g., https://api.example.com/data)" />
      <select v-model="method">
        <option value="GET">GET</option>
        <option value="POST">POST</option>
      </select>
      <button @click="sendProbe">发送探针</button>
    </div>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-if="error" class="error">错误: {{ error }}</div>
    <div v-if="probeResult" class="result-panel">
      <h4>探针结果:</h4>
      <pre>{{ JSON.stringify(probeResult, null, 2) }}</pre>
      <h4>可用数据字段 (Keys):</h4>
      <ul>
        <li v-for="key in extractedKeys" :key="key">{{ key }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const targetUrl = ref("");
const method = ref("GET");
const probeResult = ref(null);
const extractedKeys = ref([]);
const loading = ref(false);
const error = ref(null);

const extractKeys = (data, prefix = "") => {
  let keys = [];
  if (typeof data === "object" && data !== null) {
    if (Array.isArray(data)) {
      // For arrays, we might want to explore the first element if it's an object
      // Or just indicate it's an array and its length
      if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
        keys = keys.concat(extractKeys(data[0], `${prefix}[*].`));
      } else {
        keys.push(`${prefix}[*]`);
      }
    } else {
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const currentPath = prefix ? `${prefix}.${key}` : key;
          keys.push(currentPath);
          if (typeof data[key] === "object" && data[key] !== null) {
            keys = keys.concat(extractKeys(data[key], currentPath));
          }
        }
      }
    }
  }
  return keys;
};

const sendProbe = async () => {
  loading.value = true;
  error.value = null;
  probeResult.value = null;
  extractedKeys.value = [];

  try {
    const response = await fetch("http://localhost:3000/api/probe", {
      method: "POST", // Data probe request always uses POST to our BFF
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetUrl: targetUrl.value,
        method: method.value,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    probeResult.value = data;
    extractedKeys.value = [...new Set(extractKeys(data))]; // Remove duplicates
  } catch (err) {
    error.value = err.message;
    console.error("Error sending probe:", err);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.data-probe-panel {
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 8px;
  max-width: 800px;
  margin: 20px auto;
  font-family: Arial, sans-serif;
}

.input-group {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.input-group input {
  flex-grow: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.input-group select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.input-group button {
  padding: 8px 15px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.input-group button:hover {
  background-color: #0056b3;
}

.loading, .error {
  margin-top: 10px;
  padding: 10px;
  border-radius: 4px;
}

.loading {
  background-color: #e0f7fa;
  color: #007bff;
}

.error {
  background-color: #ffe0e0;
  color: #d32f2f;
}

.result-panel {
  margin-top: 20px;
  border-top: 1px solid #eee;
  padding-top: 20px;
}

.result-panel h4 {
  margin-bottom: 10px;
  color: #333;
}

.result-panel pre {
  background-color: #f4f4f4;
  padding: 15px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

.result-panel ul {
  list-style-type: none;
  padding: 0;
}

.result-panel li {
  background-color: #e9ecef;
  margin-bottom: 5px;
  padding: 8px;
  border-radius: 4px;
}
</style>