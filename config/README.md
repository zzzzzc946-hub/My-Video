# NAS 本机路径配置

将 `nas-paths.example.json` 复制为 `nas-paths.json`，再把三个路径改为本机实际的 NAS 挂载位置。

`nas-paths.json` 已被 Git 忽略：它只描述当前电脑如何挂载 NAS，不能包含用户名、密码、Token 或 API Key。

- `knowledgeBaseRoot`：挂载后的个人知识库根目录。
- `mediaRoot`：原片、项目素材和可长期保留媒体的共享根目录。
- `deliveryRoot`：最终交付与归档文件的共享根目录。

两台电脑的挂载点可以不同，例如一台为 `/Volumes/MAX-NAS`，另一台为 `/Volumes/MAX-Media`。切换电脑后，必须在 VideoUse 工作台中重新选择项目并重新链接已授权源素材；工作台不会信任旧机器序列化的绝对路径。

不要把代理、缩略图、渲染缓存或 `node_modules` 写入 NAS。它们应留在每台电脑本地，可以随时重建。
