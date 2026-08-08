# NAS 本机路径配置

将 `nas-paths.example.json` 复制为 `nas-paths.json`，再把三个路径改为本机**本地工作目录**。NAS 挂载路径只用于阶段同步，不是日常工作路径。

`nas-paths.json` 已被 Git 忽略：它只描述当前电脑如何挂载 NAS，不能包含用户名、密码、Token 或 API Key。

- `knowledgeBaseRoot`：本机 `CHEN BRAIN` 工作副本。
- `mediaRoot`：本机原片与项目素材工作根目录。
- `deliveryRoot`：本机最终交付工作根目录。

两台电脑都有各自的本地工作副本。切换前先同步规则、配置与需要的媒体，再在 VideoUse 工作台中重新选择本机素材；工作台不会信任旧机器序列化的绝对路径。同步时若本地与 NAS 同一文件都变化，标记 `REVIEW`，不得覆盖。

不要把代理、缩略图、渲染缓存或 `node_modules` 写入 NAS。它们应留在每台电脑本地，可以随时重建。
