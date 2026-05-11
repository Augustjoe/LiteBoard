const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = 3000;

// 中间件配置
app.use(cors());
app.use(express.json());

// 路由挂载
app.use('/api', apiRoutes);

app.listen(PORT, () => {
    console.log(`SchemaV BFF Server is running on http://localhost:${PORT}`);
});
