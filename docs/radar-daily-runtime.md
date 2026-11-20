# 雷达日常制作与发布运行合同

## 当前实现

- `lib/operating-contract.js`定义可验证的默认合同；本地策略`activeContract`是实际配置。每日8名额，暂停渠道不计漏做，X图文/视频择一。
- 队列使用明确的发布日期与预约时刻，不把来源日期当发布时间；同日多期允许，重复期号槽/媒体仍阻止。缓存计数必须与逐条状态一致。
- `scripts/ops/check-consistency.js`只读检查，失败停止执行。`daily-execution-plan.js`只派生计划，不发帖。
- `scripts/radar/capture-daily.js`使用独立匿名浏览器读取公开雷达、原生项目卡和Release；没有服务器模型调用。排除已发布项目和金融选股类混入普通AI栏目，双语不足6项就停止；日榜不足可明确改用新项目热榜，不冒充日榜。
- `scripts/radar/build_episode.py`接收日期/期号/6–8原生卡/双语旁白的JSON，生成两版及新片尾；`--synthesize`才联网调用免费微软语音，`--render`自动运行实际视频QA。未通过整包验收不进入发布。
- 固定独立运行环境：`~/.local/share/promotion-ops/video-venv`，直接及传递依赖锁在`python/radar_video/requirements.lock`。不再依赖10/22临时缓存；免费语音失败不换收费服务或旧SAPI。
- 11/17通用制作新增：项目的`readingLayer={headlineLines,projectName,task,condition}`控制完整原卡外的任务阅读层；`captionCues=[[第一句],[第二句第一行,第二行]]`显式定义语义分句，逐字覆盖旁白并沿用微软WordBoundary计时，不改原生卡像素。可传`ttsRate:+0%`及`outroNarration/outroCaptionCues`，不再临时修改生成后的帧/字幕。参考本日`manual-repair/episode-input-ready.json`，不是复制它的项目和日期到新一期。
- `scripts/ops/publish-video.js`提供inspect/prepare/resume-preparation/submit/verify，五个平台适配器位于`lib/publishers/`。新适配器须核实真实账号及列表选择器，通过原生预检后才允许提交。平台结果以实际回执和回查为准。
- `scripts/ops/publish-ak.js`复用原生三图包校验和持久预留，仅微博/头条/淘股吧；保持17:30、版次、真实日期、三图完整、不带产品链接。没有合格当日包不得为了日更自动声明已验收。
- prepare之前预留；上传后任何中断均需回查，禁止重复prepare。submit只对已知prepared状态单次执行。verify不发送新稿，身份/正文/媒体不齐不能标成功。
- 核到雷达视频的原生发布后，用 `lib/radar-project-history.js` 的 `recordPublishedProjects` 更新项目历史。传入该稿的作业、原生证据和制作包。同一期的渠道合并记录，供下一期查近30天重复项目。

## 本地命令

```bash
node scripts/ops/check-consistency.js --policy "$HOME/creative_work/promotion-current-policy.json" --as-of "$(date -Iseconds)"
node scripts/ops/daily-run.js --config "$HOME/.local/share/promotion-ops/automation/config.json" --mode plan
node scripts/ops/daily-run.js --config "$HOME/.local/share/promotion-ops/automation/config.json" --mode build
```

收到用户指令后运行。plan只读取数据与生成计划。build用匿名浏览器取材、免费配音、制作和QA，生成的作业进入本地队列。随后按单稿使用发布工具。账号配置、状态与素材放仓库外。

`publish-ak.js --job /path/to/ak-job.json --phase inspect --registry /path/to/media-registry.json --state-root /path/to/state`为本地预检；prepare/submit/verify才连接专用Chrome。雪球不在新发布白名单。

## 上传中断与预约回查

保留已预约条目及平台回执，按计划时刻回查。上传阶段从未提交的原稿，可通过resume-preparation核实既有媒体身份后完善元数据。已提交或身份未知的条目只核原稿。状态目录和 `~/.promotion-ops` 锁目录沿用原位置。

## 报告与效果

机器交接在输出日期目录`run.json`、`report.txt`，`latest-run.json`只作索引。没有自动邮件、私信或聊天主动推送。向用户汇报直接列渠道/状态/真实采样时间与数值/未完成原因；不把平台曝光当真人或转化。

旧完整交接、指标和待办均已保留归档，本地策略有历史路径。生产代码、模型档位、访客统计排除项及其他未提交功能不因本次本地工程优化而改变。

抖音封面只用可见原生编辑器上传区，保存后核绑定变化，主页面短accept输入框不可复用；封面源码单独位于cover_layout.py，原生输入与绑定回归见douyin-cover-browser.test.js。TikTok核原生账号菜单，B站配置nativeUid并只读核对已登录UID及昵称，不再以旧稿仍在首屏作为身份依据。
