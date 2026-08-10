# BroChat

个人 AI 角色聊天桌面应用，类似 SillyTavern（酒馆），但更简洁、贴合个人使用习惯。

- **角色卡管理**：兼容 SillyTavern 的 PNG / JSON 角色卡，导入导出无损往返
- **多对话管理**：每个角色可开任意多段对话，自动命名、随时重命名
- **简洁界面**：三栏布局（角色库 / 对话列表 / 聊天区），无冗余功能
- **模型自由**：任何 OpenAI 兼容接口（DeepSeek、GLM、Kimi、GPT 中转、本地 Ollama…），流式输出

## 技术栈

Tauri 2.11 · React 19 · TypeScript · Tailwind CSS v4 · Zustand · SQLite (rusqlite, WAL)

数据全部保存在本地：`%APPDATA%\com.bakkablue.brochat\brochat.db`

## 开发

```bash
npm install
npm run tauri dev      # 开发模式（热重载）
```

## 构建安装包

```bash
npm run tauri build    # 产出 NSIS 安装包，位于 src-tauri/target/release/bundle/nsis/
```

> 首次构建需从 GitHub 下载 NSIS 工具链，网络不畅时多试几次。

## 配置模型

启动应用后点击左下角「设置」：

| 场景 | 接口地址 | API Key |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | 平台申请 |
| OpenAI 中转站 | 中转站给的地址（一般以 /v1 结尾） | 中转站 Key |
| 本地 Ollama | `http://localhost:11434/v1` | 留空 |
| 其他（GLM/Kimi 等） | 官方文档里的 OpenAI 兼容地址 | 对应 Key |

## 角色卡

- **导入**：侧边栏「导入」按钮，支持 `.png`（SillyTavern 标准卡，头像与设定一体）与 `.json` 卡
- **导出**：悬停角色选择「⤓」，有 PNG 头像导出 PNG 卡，否则导出 JSON 卡
- 未建模的卡片扩展字段（creator、world info 等）会原样保留，导出去来去往不丢数据
- 卡片中的 `{{user}}` / `{{char}}` 令牌会在发送时自动替换

## 备份

复制 `%APPDATA%\com.bakkablue.brochat\` 下的 **`brochat.db` 与 `brochat.db-wal` 两个文件**（WAL 里可能还有未落盘的最近写入）。恢复时原样放回即可。

## 已知事项

- API Key 明文保存在本地数据库（个人工具，与酒馆存 localStorage 相当）
- 杀毒软件可能对未签名的安装包误报，属正常现象
