# MAX 剪辑 Skill 完整分享包

这是一份 **2026-10-22 当前电脑实际使用流程的快照**，用于在 Codex 中完成 MAX 真人口播的内容粗剪和表达精修。安装包带上 MAX 人物规则、账号与受众、案例、校准、复盘、任务模板、VideoUse 源码以及本地工作台，不需要访问原作者电脑、NAS 或完整 CHEN BRAIN。

它保留了默认顺剪、语义保真、重说择优、词级切点、30ms 音频淡入淡出、1080P/30fps 和可回退 EDL。它不是“机械删静音”的脚本；内容判断由支持 Skill 的 Agent 完成。

## 第一次安装

先安装 Codex、Python **3.10+**、Node.js **22.12+**（24 亦可）、FFmpeg（包含 ffprobe），确保命令行能找到它们。Python 依赖按随包的 requirements.lock.txt 安装，Node 依赖按 package-lock.json 安装。依赖不随 ZIP 携带，安装依赖需要网络与磁盘空间。开发验证环境为 macOS、Node 24、Python 3.12；Windows/Linux 尚未做完整安装验收，硬件快速编码仅适用支持 VideoToolbox 的 macOS，其他情况使用兼容导出。

解压 ZIP，在 `max-editing-kit` 目录执行：

```bash
python3 install.py
```

安装到 `~/.codex/skills/max-jianji-skill`。若已有同名 Skill，安装器会停止并保留旧目录；先手动备份、改名，或用 `--skills-dir` 指定另一个 Skill 根目录。不会覆盖已有规则、反馈或密钥。

随后使用 Python 3.10+ 安装运行依赖，例如：

```bash
python3.12 ~/.codex/skills/max-jianji-skill/scripts/setup.py
```

上面的 `python3.12` 替换为你的 Python 3.10+ 命令。如果默认 `python3` 已满足版本，也可以直接执行 `python3 install.py --setup`，一次完成复制与依赖安装。

若依赖安装中断，重新运行已安装目录中的 `scripts/setup.py`，无需再次复制 Skill。

## 配置自己的转写 Key

新转写使用 ElevenLabs Scribe，会向服务上传音频并可能产生服务费用。按接收者自己的服务账号与授权使用；安装和离线检查不会调用该服务。已有符合格式的词级转写可直接复用，不重复上传。

将安装目录 `assets/video-use/.env.example` 复制为同目录 `.env`，仅在自己的电脑填写：

```dotenv
ELEVENLABS_API_KEY=你的密钥
```

也可以通过本机环境变量 `ELEVENLABS_API_KEY` 配置。不要提交或转发 `.env`；分享包没有原作者的 Key。

离线检查：

```bash
python3 ~/.codex/skills/max-jianji-skill/scripts/doctor.py
```

检查通过表示依赖可用，不表示付费转写、完整听审或口型同步已验收。

## 开始剪辑

安装后重新打开一个 Codex 会话，让它发现 Skill。在你自己的视频任务文件夹打开 Codex，提供原视频并说：

> 用 $max-jianji-skill 给这条 MAX 口播做粗剪，按包内当前规则完成分析、剪切、自审与交付。素材是……，所有任务记录和输出放到……。

如果素材不在当前工作目录，应给出可读取的实际路径。过程记录和 EDL 写入任务目录，原片不覆盖。

查看本地时间线和导出界面：

```bash
python3 ~/.codex/skills/max-jianji-skill/scripts/workbench.py
```

终端会给出当前本机地址。在工作台打开包含 `edl*.json` 的任务目录。MAX 审片固定选择 **MP4、1080P、30fps**；硬件快速导出条件不满足时使用兼容导出，不选择“跟随源帧率”来代替 30fps。

### 给其他人物使用

本包的画像、受众和具体偏好属于 MAX，不是所有人物的通用风格。让 Agent 以这套工具和保真方法为基础，新建另一个人物的 Skill，并提供其人物、受众、禁区和交付目标；不要直接把 MAX 的价值观和账号定位套给对方。

## 包里有什么

- `skills/max-jianji-skill/SKILL.md`：当前流程入口及分享版适配说明。
- `references/max-system/`：MAX 剪辑系统完整文本快照；位于上述 Skill 目录内，下同。
- `references/0059-*`、`0112-*`、`0114-*`：三个本机迭代案例，保留成功/反例及未核验状态。
- `references/project/`：SOP、上层理解文档、包装档案、校准、技术记录与模板。
- `assets/video-use/`：执行工具源码、锁文件和原 MIT 许可证。
- `assets/runtime/`：当前本机工作台和 Remotion 项目源码、测试与 Node 锁文件；打包不自动扩大粗剪范围到字幕/包装。
- `install.py` 与 `scripts/`：安装、依赖检查、校验、ZIP 打包。
- `SOURCE-SNAPSHOT.json`：源文件映射与原始指纹，记录本机含未提交修改的工作文件来源。
- `MANIFEST.json`：最终分享文件的 SHA-256，离线可校验。

原片、成片、私人任务全文日志、账号凭据、依赖目录与渲染缓存未包含。历史日志路径已转为归档标识；它们不是可在接收者电脑打开的证据，也不影响新任务执行。规则与摘要保留，但不能声称附带了真实媒体证据。

## 质量验收边界

完整听审和连续动态口型同步是原流程的交付门禁。只有实际听到最终导出的完整音频、连续观看口型并留存覆盖记录，才能写 PASS。当前 Agent 若只有截图、ASR、波形或播放控制，必须写 NOT VERIFIED 并说明缺少的感知能力，不能交付为“已通过感知终审”。安装包不会自动提供缺失的感知能力。

## 更新与分享

这是独立快照，不自动拉取或写入原作者的知识库、NAS、正式规则、发布记录或 GitHub。接收者在自己的任务目录保留反馈；修改长期人物规则前由该人物的负责人确认。历史文件中的原作者身份、双机治理与长期授权不授予接收者写入原系统的权限。

校验和重新打包：

```bash
python3 scripts/verify_package.py
python3 scripts/build_zip.py ../max-editing-kit.zip
```

构建仅打包清单中的文件，输出 ZIP 必须位于本目录外。修改源码后，维护者需先更新清单并重新验证，不能沿用旧校验结果。

版权及第三方依赖见 [NOTICE.md](NOTICE.md)。制作和验证记录见 [VALIDATION.md](VALIDATION.md)。
