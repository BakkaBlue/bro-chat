# BroChat 实施计划

> 本文件是实施期间的权威计划文档，每完成一个 Stage 更新 Status。
> 完整设计见 C:\Users\BakkaBlue\.claude\plans\wild-mapping-micali.md

## 技术栈总览

Tauri 2.11 / React 19 / TypeScript / Vite 7 / Tailwind CSS v4 / Zustand 5 / rusqlite(bundled, WAL) / reqwest SSE 流式

## Stage 1 — 脚手架与数据层

**Goal**: `tauri dev` 打开三栏空窗；SQLite 数据层完整且有测试。
**Success Criteria**: `cargo test` 全绿；`tauri dev` 渲染三栏；`%APPDATA%\com.bakkablue.brochat\brochat.db` 生成。
**Tests**: 迁移幂等且 user_version=1；角色 CRUD 往返（含 base64 头像 data URL）；FK 级联删对话+消息；快速插入 seq 严格递增；设置默认值合并 + upsert；创建对话自动插入开场白。
**Status**: Complete

## Stage 2 — 角色与角色卡

**Goal**: 侧边栏角色管理 + SillyTavern PNG/JSON 卡导入导出。
**Success Criteria**: 从磁盘导入真实卡（头像+全部字段正确）；导出再导入数据一致；UI 手动 CRUD 可用。
**Tests**: v2 JSON→Character→v2 JSON 无损往返（含 extensions 透传）；v1 导入；first_mes+alternate_greetings 双向映射；PNG 嵌→提→比对；data URL base64 前缀容忍；avatar BLOB 字节精确；tempfile 临时文件。
**Status**: Complete

## Stage 3 — 对话与流式聊天

**Goal**: 完整流式对话循环端到端。
**Success Criteria**: DeepSeek + 本地 Ollama 流式对话；中途停止保留部分；重启恢复完整历史；DOMPurify 惰性渲染脚本字符串；设置改动下次发送生效。
**Tests**: sse.rs（跨 chunk 断行/CRLF/注释/多行 data/[DONE]/垃圾字节/空 delta）；context.rs（CJK vs ASCII 估算、trim 保留 system+最新 user、整对丢弃、超预算）；令牌替换；stream.rs mock 服务器端到端（正常流式/401/断流保留部分/取消保留部分/Authorization 头）。
**Status**: Complete

## Stage 4 — 上下文管理与打磨

**Goal**: 长对话保持正确；UI 精致且全中文。
**Success Criteria**: 300 条消息对话流式正常且 prompt 有界；所有错误路径 UI 一致；无残留英文。
**Tests**: 300 条消息集成测试；孤立 user 消息裁剪；预算=0 边界。
**Status**: 未开始

## Stage 5 — 打包与文档

**Goal**: 可分发的 Windows 应用。
**Success Criteria**: `npm run tauri build` 出安装包；另一台 Win11 安装可用且数据持久。
**Tests**: 备份恢复流程手验一次。
**Status**: 未开始

## Windows 风险与备忘

- 路径含空格：脚本里引号包裹；无 node-gyp 依赖
- rusqlite bundled 需 MSVC：已满足
- `tauri build` 需下载 NSIS/WebView2 引导器，CN 网络可能慢 → 重试；日常用 `tauri dev`
- 文件对话框 CJK 路径：`PathBuf::from`，禁止字符串拼接
- 数据位置：`app.path().app_data_dir()`；备份需同时拷 `brochat.db` 和 `brochat.db-wal`
- API key 明文存本地 SQLite（个人工具可接受）；keyring 记入 v2
- reqwest 0.13 用 native-tls(Schannel)，Windows 无需 OpenSSL

## 变更记录

- Stage 1 完成: 2026-08-10, 脚手架 + 数据层 + 测试全绿
