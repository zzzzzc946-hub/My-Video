# 分享包验证记录

日期：2026-10-22。环境：macOS arm64，Node.js 24.16.0、Python 3.12.13，系统已安装 FFmpeg/ffprobe。

## 已执行

- 安装到独立临时目录：通过；包含规则库、执行脚本和工作台，无源目录符号链接；再次安装拒绝覆盖且保留本地反馈。
- 依赖安装：通过；按捆绑 uv.lock 导出的 requirements.lock.txt 安装 Python 依赖，按 package-lock.json 执行 npm ci，未修改全局 Python/Node 环境。
- 离线 doctor：通过；凭据未配置，未联系转写服务；明确保持听审与口型 NOT VERIFIED。
- 工作台 TypeScript 检查：`tsc -p tsconfig.workbench.json` 通过。
- 相关测试：`exporters.test.ts`、`runtime.test.ts` 共 10 项通过。
- 实际合成媒体导出：使用 FFmpeg 生成 1080×1920/24fps 纯色视频与测试音，通过正常 openProject 导入原片 EDL，再调用捆绑工作台 renderFinalVideoUse 导出 MP4/1080P/30fps。两段保留区间总计 1.4 秒，实际输出 1.450 秒；ffprobe 确认 1080×1920、30/1、音视频流存在。捆绑 Python 路径解析和兼容渲染链实际执行成功。
- 本地服务检查：从独立安装目录启动 scripts/workbench.py，HTTP `/api/health` 返回 ok，前端返回入口文档，检查后关闭测试进程；没有执行浏览器验收。
- Skill 官方 quick_validate：通过。
- 分享文件清单、SHA-256、原作者机器路径与基础凭据扫描：通过。ZIP 以清单白名单生成，解压后再次校验通过。

## 可复现

在解压包目录运行：

```bash
python3 -m unittest discover -s tests -v
python3 scripts/verify_package.py
python3 tests/smoke_runtime.py --skill ~/.codex/skills/max-jianji-skill
```

最后一项要求已完成依赖安装，会生成并删除临时合成媒体，启动再关闭本地测试服务，不上传媒体或调用付费 API。工作台源码测试在已安装 Skill 的 assets/runtime 中使用上述两个 Vitest 测试文件运行。

## 未宣称通过

未执行付费转写请求、Windows/Linux 完整安装、浏览器交互验收或原项目全量测试。合成音视频的技术通过不证明真人语义剪辑、完整听审或口型同步通过；这些仍按每条真实视频实际证据分别记录。

## 分享适配

原项目和 CHEN BRAIN 源文件保持不变。本包显式改为相对路径，工作台解析包内渲染脚本与 Python 环境；MAX 内容规则保持当前 Skill 的判断边界，历史外部治理/长期授权不在接收者环境自动执行。第三方工具仅作为执行接口，不引入其文档中的额外策略确认、预算或代理流程。
