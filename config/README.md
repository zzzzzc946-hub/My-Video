# 本机路径与角色配置

将 `nas-paths.example.json` 复制为被忽略的 `nas-paths.json`，填入本机 `CHEN BRAIN`、媒体和交付工作目录；不得填入密码、Token 或 API Key。

`knowledgeBaseRoot` 是 CHEN-BRAIN 的本机 Git 工作副本，日常读取只来自 `main` 与 `current-release.yaml`。NAS 挂载路径只在用户明确要求同步 active release 时使用，不是日常规则工作路径。

两台电脑分别保有本机媒体、代理、缓存和 VideoUse 授权；这些内容不得进入 Git 或 NAS 规则镜像。启动视频前必须校验 active release、冻结 SHA 与最多 3 条候选；审片输出固定为 **1080P、30 fps**。
