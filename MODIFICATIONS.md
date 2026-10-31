# 智枢 AI 工作台 — 修改说明 / Modifications

本应用基于开源项目 [AionUi](https://github.com/iOfficeAI/AionUi)（Apache-2.0）修改，修改后的源码在
[zhishuhub/AionUi](https://github.com/zhishuhub/AionUi) 的 `zhishu` 分支。原项目的版权与许可证（[LICENSE](LICENSE)）保持不变。

This app is a modified version of [AionUi](https://github.com/iOfficeAI/AionUi) (Apache-2.0). The modified source
lives on the `zhishu` branch of [zhishuhub/AionUi](https://github.com/zhishuhub/AionUi). The original copyright and
[LICENSE](LICENSE) are kept.

## 主要修改 / What changed

| 范围           | 修改                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI 接入        | 去掉填写接口地址、密钥、服务商的界面；改为在智枢网站点「一键接入」，应用用接入码换取调用地址和密钥（`packages/desktop/src/process/zhishu/`）。对话、生图分别使用 `chat`、`image` 两个模型别名 |
| 生图           | 内置生图工具对智枢的 `image` 模型改走 OpenAI Images 接口（`/images/generations`、`/images/edits`）                                                                                            |
| 设置           | 「模型」「智能体」设置页换成「智枢 AI」页：接入状态、重新接入、公司服务器页面地址；隐藏需要第三方密钥的语音输入设置                                                                           |
| 公司服务器页面 | 可选填写消息页、知识库地址，填写后侧栏出现「消息」「知识库」，在应用内打开                                                                                                                    |
| 更新           | 关闭原项目的自动更新；「关于」里的检查更新改为对比智枢网站上本应用的版本                                                                                                                      |
| 遥测           | 不初始化 Sentry，不上报崩溃、启动日志和 Windows 安装失败；问题反馈改为打开网站上的应用页                                                                                                      |
| 品牌           | 程序名 ZhishuWorkbench，界面名「智枢 AI 工作台」，应用 ID、数据目录、深链协议改名，避免与原版 AionUi 冲突；Windows 安装器的提示和文件检查跟随新程序名；更换图标                               |
| 发布           | 新增 `.github/workflows/zhishu-release.yml`，推 `v*-zs.*` 标签时打 Windows、macOS 安装程序；Windows 安装包在构建机上静默安装通过后才发布                                                      |

| Area                 | Change                                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI access            | Removed the UI for API addresses, keys and providers. The app connects with a one-time code from the Zhishu website (`packages/desktop/src/process/zhishu/`) and uses the model aliases `chat` and `image`.                         |
| Image generation     | The built-in image tool calls the OpenAI Images API (`/images/generations`, `/images/edits`) for the Zhishu `image` model.                                                                                                          |
| Settings             | The Model and Agents pages are replaced by a "Zhishu AI" page (connection, reconnect, company-server page addresses). Speech-to-text settings that need a third-party key are hidden.                                               |
| Company-server pages | Optional message-inbox and knowledge-base addresses add "Messages" and "Knowledge base" to the sidebar, opened inside the app.                                                                                                      |
| Updates              | The upstream auto-updater is disabled; About checks the version listed on the Zhishu website.                                                                                                                                       |
| Telemetry            | Sentry is never initialized; no crash, startup-log or Windows installer-failure reports are sent. Feedback opens the app page on the website.                                                                                       |
| Branding             | Program name ZhishuWorkbench, UI name "智枢 AI 工作台"; app id, data directory and deep-link scheme renamed so it never collides with AionUi; the Windows installer messages and file checks follow the new program name; new icon. |
| Release              | `.github/workflows/zhishu-release.yml` builds Windows and macOS installers for `v*-zs.*` tags; the Windows installer must pass a silent install on the build machine before release.                                                |
