# 当前双语运营执行入口（2026-10-13）

## 最新收尾：2026-10-13 16:11（北京时间）

当前证据与报告：`2026-10-13-promotion-followup/live-1514/reports/DAILY_REPORT.md`；此前 live-1309 是 14:44 阶段记录。

- 今天累计：四篇中文旧内容修订、一条英文 Reddit 有用评论、新增一组 TikTok 三张图库图。图集 https://www.tiktok.com/@useaistation/photo/7696058822686772488，15:59 提交，16:06 原生工作台已显示“所有人”、无“内容审查中”；永久页回读三图/英文文案/推广内容与 AI 标识。未登录 HTTP 未核到图集正文，不扩大为匿名访问或传播效果已验证。三张新 SHA 已登记，原 42 条历史记录不变。
- Google：中文介绍页申请回执已独立核对，没有重发；英文介绍页今天 15:52:35 已成功抓取但未索引，16:03:46 首次申请获接收回执。两站均未证明收录。本轮无阻挡式验证；旧检测将被动 reCAPTCHA 徽标误判，已修复，不再报告“等待 Google 人机验证”。
- SEO/GEO：本地补三组中英文步骤/提示词/验收标准，公开事实与 llms 各入口统一，新增介绍页内链、正确 WebPage/WebApplication/Organization 联系方式、分享图及真实内容日期。41 项 SEO 测试、1 项发布面分类、两语种 390px DOM 检查通过；工具 64 项测试无跳过，62 个 JS 语法通过。尚未提交、推送或部署，线上不会自动获得本地改动。
- Gmail：`in:anywhere after:1791561600`，10/10 00:00 至今日 16:04:38，17 会话/1 页完整含垃圾箱与回收站；全天另读 9 个重要会话正文。新增 Google 邮件确认 14:58 登录 Clarity 并共享姓名/头像，属于用户本次登录通知。没有发送邮件/私信。Clarity 已登录“张晓辉”，创建项目页与选择器没有项目，未展示账号邮箱，项目归属/历史项目仍待核，sessions=null。
- 审核收尾：CSDN 16:08 未登录 HTTP 200，新标题、新正文标记与五个 H3 已确认公开可读；OSCHINA 当前作者页不再出现“未通过”，匿名请求只返回页面壳，公开审核状态仍未证明，既有复审 unknown 不重发。OS 平台自动摘要还含旧“免费不受限”等不准确表述，需要核可编辑摘要入口。知乎当前通知是绘图提问邀请，未观察到新 AI 警告；没有新增回答或私信。
- 本阶段真实 CLI：Grok、DeepSeek、Kimi COMPLETE；GLM 初审与聚焦复审均 TIMEOUT，未伪称第四份审查通过。Codex逐项核验采纳；原始事件与结果保留。推广付费 0，百度新增推送 0（没有可信变化候选），未开启工坊生产采集窗。

## 今日实页修订（当前约定）

单操作页顺序，页面加载后留正常阅读时间，填写后回读再确认一次；异常保留页面，不绕过验证。Gmail先应用加载再原生搜索，核搜索框/hash/行范围；中文“下一页结果”已支持，旧收件箱partial不能当新邮件。GSC日期读ARIA选择状态，仅可见首10行，不读隐藏行。Reddit作者/正文限定评论自身.entry，不能取父帖作者。

多段富文本用原生Enter逐段插入，并按非空行向量回读，不把空白归一化等价当结构正确。CSDN标题输入本身是.article-bar__title，新成功路径为mp.csdn.net/mp_blog/creation/success/<id>，文章下真实小标题为H3；路由和旧query冲突应拒绝。作者/正文回读与审核/公众可见性分列。结果unknown禁止重发。

当前百度已登录、索引2；Clarity已登录但没有项目，项目归属未核；两站介绍页Google均未证明索引、两站申请均有接收回执，中文不重发。工坊采集窗关闭、线上UTM被覆盖，缺失指标null。feature_events存北京本地时间，工坊UTC/epoch另按权威字段处理。详情见今日报告，不沿用旧暂停/收录1/全部真人等结论。

当前策略：`/home/zxhwolfe/creative_work/2026-10-13-promotion-audit/final/STRATEGY.md`。
用户已恢复真实运营；先查当前证据与规则再执行平台命令。`.env` 只在需要真实平台访问时加载，不打印、不复制入报告。该工具库服务两个站点，不改变业务部署权限。

用户后续明确要求今天真实运营，先看数据；此前暂停已解除。执行状态见 [清单](chrome-activation-plan.md) 与今日 live-1514/reports/DAILY_REPORT.md（live-1309 为此前阶段）。恢复Chrome不授权提交部署。

## 离线准备

```bash
# 生成具备语言/来源/活动/内容编号的链接，保留路径里的原有参数。
node scripts/campaign/link.js en reddit /aitu-studio/intro/ aitu-background answer-01
# 草稿检查（不连接Chrome、不发送）：有媒体时必须读历史表，必须提供跨轮SHA256登记。
node scripts/campaign/preflight.js /path/draft.json /home/zxhwolfe/creative_work/promotion-metrics.md /home/zxhwolfe/creative_work/promotion-media-registry.json
# 百度候选，仅生成计划，不访问百度。
node scripts/baidu-ziyuan/plan-urls.js /path/push-plan-input.json
# 本地流量统计，不读取服务器、不产生网络请求。
node scripts/stats/traffic-report.js /path/traffic.jsonl 2026-10-12T00:00:00+08:00 2026-10-19T00:00:00+08:00
```

草稿格式：

```json
{
  "channel": "tiktok",
  "language": "en",
  "title": "Change the background. Check the label.",
  "text": "A product-photo editing walkthrough. Check the label and edges before exporting.",
  "tags": ["#PhotoEditing"],
  "assets": [{"id":"aitu-background-20261013-01","title":"原始素材标题","path":"./product-background-demo.mp4"}]
}
```

预检检查标题/描述/标签里的非拉丁文字、英文媒体文件名、域名语言与UTM、历史标题与已登记SHA256。Latin检测不是完整英语识别；清晰度、英文自然程度、实际操作结果与许可仍需检查。含素材时历史表与SHA登记均必填，首次可明确创建内容为[]的登记文件；空登记不证明旧图均有哈希。TikTok无实际媒体时大纲返回partial。10/13历史表中41张图片已找到对应文件并补SHA，登记另含旧视频；39张图片实际为WEBP但扩展名.jpg且短边低于720px。不能宣称能识别所有裁切/压缩变体，也不能把旧图当新高质量素材。预检结果 `ok` 只表示本地静态条件满足，不等于平台允许、已经登录或发布成功。

本站外链统一 `utm_source`=channel，另带 `utm_medium/utm_campaign/utm_content`；允许真正有帮助的无链接回复。现有四平台文章和Reddit/OSCHINA评论入口已在连接Chrome之前执行链接预检。默认中文文章用 zh，Reddit用 en；特殊稿件显式 `PROMO_CONTENT_LANGUAGE=en|zh`。渠道 key：tencent、aliyun、csdn、oschina、reddit、v2ex、zhihu、tiktok、youtube、pinterest、x、bilibili、devto（登记不代表允许本AI自动发文）。小红书不允许。

发完并独立确认平台结果后登记素材：

```bash
node scripts/campaign/record-media.js /path/draft.json /home/zxhwolfe/creative_work/promotion-media-registry.json published https://www.tiktok.com/@account/video/123456
```

不明结果用 `unknown` 同样占用素材，先核对再使用；命令只存“操作者提供的证据”，不会声称替你核验平台。`media-registry.json`放创作目录或忽略的artifacts；不要提交私有结果链接和原文件。已发布同一图的简单改名不能绕过SHA检查。合法跨渠道改编要明确登记新用途，不能偷偷删历史记录。

## 本轮离线交付

报告：`/home/zxhwolfe/creative_work/2026-10-13-promotion-offline-preparation/final/REPORT.md`；三组双语内容包在同目录`content/`，埋点映射和归因缺口在`analytics/`。现有共用登记已有42条历史unknown记录，禁止以“首次创建”为由清空。预检6份文字通过、3份无媒体视频partial，均未发布。

## Gmail

真实阶段：`node --env-file=.env scripts/gmail/sweep.js`。要求 GMAIL_EXPECTED_EMAIL，默认 in:anywhere，包含垃圾箱与回收站；可设置只含时间条件的 GMAIL_SWEEP_QUERY，禁止关键词/未读过滤冒充全量。最多500会话/50页；超出、缺ID、页重叠、查询改变都报partial。partial须按日期拆段补查，不自动推进已检查水位。线程摘要不是每封邮件正文；账单、安全、审核和客户来信要实际打开核实，再在STATUS记时间范围/重要事项/缺口。

日期窗口须覆盖上次真实检查截止时间，留一天重叠防延迟邮件。首次不明水位不能默认“最近7天就够”。发送后若Gmail把新邮件合并进旧会话，旧正文匹配不证明本次发出；当前缺消息级基线时保留未核验，不重发。

## 编辑器与快照

阿里云改版尚未进行当日实页验收。真实阶段先运行 `node --env-file=.env scripts/ops/probe-editor.js aliyun`，它只列可编辑候选和长度，不读取正文、不填内容。核验唯一候选确实是正文后配置 `PROMO_EDITOR_SELECTORS='{"aliyun":["经当前DOM核验的局部选择器"]}'`。默认旧 `.mditor textarea.textarea` 保留历史兼容；未配置且新DOM不匹配会明确失败，不能报修好了。

腾讯云Monaco只在唯一模型确实为空（或纯空白/零宽占位）时填入，并精确回读；有真实草稿则保留。切换新的编辑器内核需实际核验，不自动猜测。

daily-snapshot 必须显式配置 PROMO_TARGETS_FILE，不再悄悄使用示例目标。未配置指标=null并保留reason，真实0仍为0；不靠全页第一个数字填空。目标至少记录内容URL、平台、加载标记与已核验局部选择器；本轮未宣称腾讯/阿里计数选择器已修复。

## 百度计划输入

```json
{
  "site": "https://aiworkstation.cn",
  "limit": 10,
  "inventory": [{"url":"https://aiworkstation.cn/aitu-studio/intro/","indexable":true,"canonicalVerified":true,"modifiedAt":"2026-10-13T00:00:00+08:00"}],
  "history": [{"url":"https://aiworkstation.cn/aitu-studio/intro/","status":"accepted","at":"2026-10-11T10:00:00+08:00"}]
}
```

上述日期仅为格式示例，不是该页面实际更新时间。计划跳过未证实可索引、工作区私有路径、已接收未更新和结果未知URL；默认上限10可为0。未出现在给定历史中的URL只列为待核查候选，整体返回partial；清单可索引/canonical未核验或存在历史unknown时也返回partial并给出对应数量。不能自动等同从未推过。旧累计190条不能重建URL历史。真实推送仍走 push-urls.js 和既有 writeOnce；只在计划核对后把 selected URL 写入列表。prepareURLs会移除UTM、fbclid、gclid及片段；API success/remain继续存现有操作结果，新结果补记录URL/站点便于后续去重。结果不明不以新批次重试。

## 流量文件格式与口径

输入是明确规范化的本地JSONL，每行：

```json
{"at":"2026-10-13T01:00:00Z","host":"useaistation.com","path":"/aitu-studio/intro/","method":"GET","status":200,"userAgent":"Mozilla/5.0","source":"reddit","campaign":"aitu-background"}
```

不支持猜测任意nginx日志格式。下一轮只读导出真实日志时，先核对字段再转换；无需写出IP、cookie、token或正文。统计含时区 `[start,end)`，按站点/渠道/活动分组；排除已知监控、curl、明显bot、静态资源、API和非200GET。缺归因单列，坏行报partial；其结果仅为页面请求数。humanVisitors/uniqueVisitors/activations始终null，不能拿UA过滤充当真人识别。intro点击、首次出图、导出与回访应另取各自权威事件，未接通时留空。

## 验证

`npm run check` 与 `PROMO_TEST_BROWSER=/home/zxhwolfe/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome npm test`。
测试启动临时无登录态Chromium，用本地DOM/路由夹具，不连接9234。原有测试中的隔离CDP使用临时随机端口，不接用户profile。离线通过与真实平台验收分别汇报。

## 本轮沉淀：Google 与照片发布

被动徽标仅在可信 Google/recaptcha.net 的 anchor、reCAPTCHA 标题、grecaptcha-badge 祖先及小尺寸同时成立时排除；真实 bframe、独立 checkbox、大尺寸 iframe、其他平台遮罩仍停止，不能把任意 captcha 都忽略。Google URL 检查先绑定准确 URL 与未索引原因；已抓取未索引也是可首次申请状态，等待单次回执不重复点击。接收不代表收录。

TikTok 原生照片流程会从 /tiktokstudio/upload 跳到 /tiktokstudio/upload/post/photo，复用前先读实际 URL，未找到目标时不能在新建空白标签上继续。JPG/JPEG/PNG/WebP 均由原生照片 input 接受，本次用原始 WebP、英文文件名，保留内容哈希。三图在编辑器填写英文标题/描述，展开“显示更多”，启用 AI 生成和自己的品牌披露；品牌 input 覆盖在图标下，应点击可见 label 后回读 checked，不使用 force。只提交一次；工作台标题可能仅显示描述，独立结果应绑定新 ID、作者、正文和三张实际图片，而非只匹配标题。结果 URL 的 /video/<id> 会跳为 /photo/<id>，登记时用无查询 canonical。

发布按钮后的“仅自己/内容审查中”是处理中观察，不能立刻断言用户设置错误或重复发布。待原生作品行显示“所有人”并消除审查提示后更新快照。已点击且回读不足先记 unknown，占用媒体；独立回读后按可信结果 URL reconcile，保留原状态与审计记录。图库候选必须排除英文帖子中的内嵌中文。SHA/标题之外的近似图检查只能作为补充，不承诺识别所有裁切变体。
