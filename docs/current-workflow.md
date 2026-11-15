# 当前推广操作入口

先读主仓库 `docs/ai/promotion_operations.md`，再读策略 `activeContract` 及当前回执/日数据/交接指针。

- 当前日计划8个名额：四平台雷达视频，X图文/视频择一，大AK微博/头条/淘股吧三图；雪球暂停不计漏做。
- 新本机调度：Codex专用会话10:00做效果/选题/编审及当日内容，19:45做合格大AK晚报三图及收尾。旧18:00制作/18:45发布timer已停，不双跑。
- `scripts/ops/run-codex.js --config <私有配置> --slot day|evening`按固定UUID续接既有gpt-6.1-sol/medium，不调用其他模型CLI/新付费API。`--dry-run`不调用模型；`--probe`真实只读验收，不能算日运营完成。
- 真实turn.completed、最终结果、同日回执/指标/交接和策略指针都要核对。队列成功或进程退出0不代表发布/运营成功；partial、needs_human和外部待核分别记录。
- 日轮持久预留与ops-owner/CDP锁共用；既有上传/提交未知只回查，不重试重发。登录/验证真正阻塞保留页面，不绕过、不反复尝试；继续能独立完成的其他工作。
- `daily-run.js`及`publish-video.js`、`publish-ak.js`保留原生工具职责；新适配未完成原生核验前不盲发。制作通用6–8原生项目卡，微软免费晓晓/Aria，无无关配图/配乐，先看任务价值与内容质量。
- 全站目录/机会队列持续，爱图图库真图+完整词优先，社区按实用内容周节奏；公众号/视频号手动，小红书/Capafy暂停，Product Hunt暂缓，知乎旧警告停新增。WorkBuddy后台用户看。
- `check-consistency.js`离线核规则/队列/日期；`codex-status.js <私有配置>`不调模型读取最新摘要。2026-11-15白天正式轮已独立完成第19期五平台账号侧发布；抖音/B站匿名通过，其他外部未知。状态查询新增原生journal核对，执行完成、公开核验与推广效果分开；原partial及非零退出不改写。

详细本机边界见`docs/codex-operations.md`。私有运行指针在策略automationEngineering；主会话与专用会话共用同一份策略/台账。专用CLI结果不保证在当前VSCode聊天窗口主动弹出，查询时直接在会话列出。

2026-11-14补充：正式轮由父调度器先预检固定Chrome资料目录，模型保留workspace-write只用Linux/CDP；既有发布状态目录automation已明确加入可写范围。用户明确续作以原当日运行UUID留独立记录，不覆盖/自动重跑。partial/needs_human非零退出。近30天项目跨平台、跨语言不再用于新一期；同一期同步分发允许，新包用radar-project-cooldown核验。

2026-11-15复核保留定时任务。抖音封面以原生完成按钮/保存缩略图为准，不等待整页networkidle；TikTok先等音乐版权及内容检查均通过才点发布。全站各功能按当前周节奏分别记录最近动作、到期机会、本轮执行/不执行原因与下次核对条件，不以“目录保留”代替覆盖。低频平台不因此新增机械发布配额或操作权限。
