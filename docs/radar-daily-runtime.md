# 雷达日常制作与发布运行合同

## 当前实现

- `lib/operating-contract.js`定义可验证的默认合同；本地策略`activeContract`是实际配置。每日8名额，暂停渠道不计漏做，X图文/视频择一。
- 队列使用明确的发布日期与预约时刻，不把来源日期当发布时间；同日多期允许，重复期号槽/媒体仍阻止。缓存计数必须与逐条状态一致。
- `scripts/ops/check-consistency.js`只读检查，失败停止执行。`daily-execution-plan.js`只派生计划，不发帖。
- `scripts/radar/capture-daily.js`使用独立匿名浏览器读取公开雷达、原生项目卡和Release；没有服务器模型调用。排除已发布项目和金融选股类混入普通AI栏目，双语不足6项就停止；日榜不足可明确改用新项目热榜，不冒充日榜。
- `scripts/radar/build_episode.py`接收日期/期号/6–8原生卡/双语旁白的JSON，生成两版及新片尾；`--synthesize`才联网调用免费微软语音，`--render`自动运行实际视频QA。未通过整包验收不进入发布。
- 固定独立运行环境：`~/.local/share/promotion-ops/video-venv`，直接及传递依赖锁在`python/radar_video/requirements.lock`。不再依赖10/22临时缓存；免费语音失败不换收费服务或旧SAPI。
- `scripts/ops/publish-video.js`提供inspect/prepare/submit/verify，五个平台适配器位于`lib/publishers/`。新适配器必须核实真实账号及列表选择器，通过原生预检后才允许提交；离线测试不证明平台成功。
- `scripts/ops/publish-ak.js`复用原生三图包校验和持久预留，仅微博/头条/淘股吧；保持17:30、版次、真实日期、三图完整、不带产品链接。没有合格当日包不得为了日更自动声明已验收。
- prepare之前预留；上传后任何中断均需回查，禁止重复prepare。submit只对已知prepared状态单次执行。verify不发送新稿，身份/正文/媒体不齐不能标成功。

## 本地命令

```bash
node scripts/ops/check-consistency.js --policy /path/to/promotion-current-policy.json --as-of 2026-11-13T12:00:00+08:00
node scripts/ops/daily-run.js --config /path/to/private-config.json --mode plan
node scripts/ops/daily-run.js --config /path/to/private-config.json --mode build
```

plan绝不连账号浏览器。build只匿名取材、免费配音、制作和QA，不上传。publish只有配置`activation.publishEnabled`与各`liveValidatedAdapters`都成立才调用原生发布；账号配置、状态、素材均放仓库外，不提交.env或Chrome登录态。

`publish-ak.js --job /path/to/ak-job.json --phase inspect --registry /path/to/media-registry.json --state-root /path/to/state`为本地预检；prepare/submit/verify才连接专用Chrome。雪球不在新发布白名单。

## 定时与恢复

`install-local-timer.js --config /path/to/config.json`生成用户级18:00 Asia/Shanghai的plan/build单元；加`--activate`才启用。`--publish`生成独立18:45发布单元，必须已有启用配置及至少一个密封的原生成功证据；当前已验证的渠道读取私有配置，不在源码硬编码。账号/选择器或适配代码变化会使验证失效。`Persistent=false`避免开机后补发旧内容；定时和会话统一使用`~/.promotion-ops`锁目录。没有电脑/WSL运行、网络、免费语音或当日合格来源时记录失败，不伪称完成。

发布开关不随制作时钟启用。2026-11-13按原生验证逐个启用适配器；外部公开待核仍单独记录，不算公开完成。未验证渠道不自动发送。旧生产早晚timer不恢复。未知的第16期X视频不可作为“首次新上传”测试。上传阶段从未提交的原稿，可通过resume-preparation核实既有媒体身份后只完善元数据；已经提交或无法确认身份时不允许此恢复路径。

## 报告与效果

机器交接在输出日期目录`run.json`、`report.txt`，`latest-run.json`只作索引。没有自动邮件、私信或聊天主动推送。向用户汇报直接列渠道/状态/真实采样时间与数值/未完成原因；不把平台曝光当真人或转化。

旧完整交接、指标和待办均已保留归档，本地策略有历史路径。生产代码、模型档位、访客统计排除项及其他未提交功能不因本次本地工程优化而改变。

抖音封面只用可见原生编辑器上传区，保存后核绑定变化，主页面短accept输入框不可复用；封面源码单独位于cover_layout.py，原生输入与绑定回归见douyin-cover-browser.test.js。TikTok核原生账号菜单，B站配置nativeUid并只读核对已登录UID及昵称，不再以旧稿仍在首屏作为身份依据。
