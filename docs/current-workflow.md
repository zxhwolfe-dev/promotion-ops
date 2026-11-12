## 雷达大字幕版源码

已验证源码模板见 `templates/radar-daily-video-review/README.md`，仅本地制作/验收，不含素材或平台发布器，不启用每日无人值守任务。

## 22:53最终状态补充

11/11 22:53最终补核：TikTok第16期7706923565706267925已从审查中转为“所有人”，原生发布时间22:39，0播放/0赞/0评；匿名原帖仍Site Maintenance，外部播放未知。最终为4平台原生发布，其中抖音/B站/YouTube3平台匿名原帖已核，X编辑器状态未解、未重传。无需用户重复登录或审批样片。此条替代下方较早的“TT审核中”描述。

## 2026-11-11 22:50 发布续作（优先于旧状态）

新版雷达第16期已获用户授权并通过QA；抖音/B站/YouTube原帖公开，TT审核/X编辑器状态未解，详见当前policy指向的交接和revision-02/publishing/results.json。抖音本雷达栏目加入日常，公众号/视频号仍手动；当日已发不重发，审核/未知只解账。尚未安装无人值守每日触发器，无新增提交推送部署，其他工作不动。

# 当前入口：2026-11-11

11/11用户最新调整：Product Hunt暂缓，移出当前人工待办；保留既有产品记录与本地素材，不再催安全验证、不自动重开。仅用户明确恢复后再处理。优先现有渠道内容质量与反馈，其他日任务不受影响。

先读主仓库入口和当前策略指针，现为11/11交接/回执/日数据/执行计划。下午3公开＋3原生预约，17:30后大AK仍未执行；预约非公开、不重传，无后台自动唤醒。腾讯代码块text须在原稿改txt，新增预检先于Chrome；B站AI选中态须等待原生DOM稳定。API详情被robots屏蔽不扩大开放，对外链接用HTML/README。Reddit/Product Hunt渠道补漏见11/11最新交接：旧unknown按具体投稿保留；PH现行两个月窗口仍需重大更新，已保留人工安全验证页。日计划按策略channelRegistry自动列出复核过期与失败；数字齐备与内容可读分开。Product Hunt已按用户要求暂缓，不再列为当前人工待办。必应后台登录单独保留；PH标签关闭未确认，不自动重连。源码仅精确提交推送，不部署、不发布内容。

下方11/6及更早结果均为历史时点。

渠道维护由日计划读取当前策略的 `channelRegistry` 路径；本地JSON台账和素材不纳入源码提交。内容子集核验、数字采样、访问失败和用户暂缓分别保留，提醒不授权自动发布。

# 当前运营执行流程（2026-10-22）

先读主仓库 `docs/ai/promotion_operations.md` 和 `/home/zxhwolfe/creative_work/promotion-current-policy.json`。本文件取代旧guide中的过期日状态和排期，历史材料继续保留。

1. 读取最新publication-results、当日daily观察、素材登记，运行每日计划，核今日已有回执与昨日漏项。
2. 主渠道原生计数/通知/Gmail（含垃圾回收）先查，未知保留null。目录只在通知/变更/周维护时深查；每日仍报最后状态和采样时间。
3. AI工作站日视频优先开源雷达每期6–8个精选项目，真实项目卡逐个介绍、微软免费女声、固定画面/固定字幕/直接切换，禁止整幅缩放位移和无关配图；合格英文包发TikTok/YouTube；大AK17:30后1个完整原生三图包发微博/头条/雪球/淘股吧，正文无产品链接。具体实验见统一experiments.json，不另排平行计划。
4. 原生下载CLI：`node scripts/campaign/download-ak-native.js --date YYYY-MM-DD --base-dir /absolute/daily-folder`。非交易日明确历史素材才加`--allow-historical`。CLI点击前保存状态，未知不重点击。下载成功仍需人工逐图视觉核验；不得把metadata检查当视觉验收。
5. 三图预检：`node scripts/campaign/check-ak-package.js /absolute/package-check.json`。需要真实卡日期/时间精度/来源/SHA、视觉验收、历史使用和无链接正文。
6. 平台提交必须预留单次回执，随后独立核公开/审核/不可见；unknown不重投。不要把网页壳、上传或待审记成完成。
7. 日计划：`node scripts/ops/daily-execution-plan.js --as-of <明确时区ISO> --receipt <当日publication-results.json> --receipt <前日publication-results.json> --snapshot <当日daily.json> --snapshot <前日daily.json>`。输出仅为离线计划，不安装调度、不额外授权操作。`--strict`在今日7项未全部核公开（10/23起含X雷达图文）时退出2。
8. 当日回执更新功能覆盖和媒体使用；复查依据真实样本关闭，晚采样记录实际间隔。最后检查账号/草稿/审核，清理临时标签，并直接会话报告。

禁止四模型路线；三手动平台/暂停渠道/宣传页与访客统计排除；本地代码不自动提交推送部署。测试使用临时无账号环境，不能连接9234。

10/23起：当前策略videoReleaseQueue指向10期预制视频队列。日计划默认读取当前策略中的队列，`--video-queue <路径>`只作显式覆盖，`--policy <路径>`可选择独立策略。原生预约项到期只回查公开结果，不重传；未预约ready_for_daily_session项按北京时间的当天会话发布，无需等到一个未安装的18点时钟；过期槽只审查，不自动多条补发。预约不是已公开，不抵扣当天完成；unknown/reserved/submitted/uploaded只核结果。今天已发视频和大AK不因本轮优化重发。

10/23预约执行结果：20版成片完成；YouTube/TikTok各10，B站前4已原生预约。B站当前非正式会员当日5稿额度（1公开+4预约）已满，第5期已保存原生草稿，第6–10本地就绪。下一授权每日会话按当前策略videoBatchNativeConstraints优先续约余6期；先续第5期草稿，重核其部分字段，不重新上传；不绕限额。预约到期核原帖并写当天真实公开回执，不能仅把队列状态改成published而不留公开证明。普通日任务nextAction已纳入队列保护，预约不改变完成数；新门禁21项定向测试通过。

晚间续作：普通日计划已自动接入当前策略队列；videoQueue.schedulingContinuations列出当前被原生额度阻止/下次会话应续约的内容，保留草稿与新上传的区别。每日样本必须使用scope=single_content、windowType=cumulative、真实observedAt/原帖URL/原始证据；未知不补零，账户汇总和目录状态不套用此单内容口径。31项定向测试通过。

10/23用户进一步明确“x以后也发啊”：X从一次图文试验纳入每日必做，英文雷达精选一条，3–4张原生项目卡、用途/边界、真实日期与UTM；每天采曝光/互动，24h/72h/7d按真实时龄复查。同榜不重复同组旧图，可换不同项目或实用主题，不拿预制图冒充当日榜。每日核验从6项增至7项（TT/YT视频+大AK四渠道+X雷达图文），B站仍独立回执；未知先回查，不重发、不补零。已更新本地计划器并用34项定向测试验证，未连接Chrome、未重发今日帖子、无提交推送部署，无无人值守时钟。
原生X编辑器使用本次已核的键盘逐行输入/原生快捷提交流程；提交后留在原编辑器等明确sent/错误，随后独立核作者、正文、三图、ALT和原帖。

10/25追加：未提交媒体的editorialReview.status=required时，日计划与续约清单明确先内容复审；原有预约/未知结果保持等待或回查，不能变成新上传。当前B站仅第8期未预约并待复审，新增5预约真实读回；原生上传助手在withBrowser前阻断第8期。26定向测试与82JS语法通过。原生B站分区用.video-human-type字段校验，不用整页人工智能字样；跨月用实际月箭头及年月标签。第6期已误分vlog且原生编辑禁用，仍未改成，不虚报修复。

10/25爱图图片+提示词恢复：同一policy的`aituImagePromptProgramme`和实验A是唯一安排，图库原图/完整原提示词、原生自创、真实模板输入与前后结果三类择优，初始每周3条合格图文，不新增每日视频硬额或改变26条原生预约。实际已公开英文YouTube社区台灯帖；中文商品场景双图在B站原生动态单次提交后结果unknown，原稿保留，不计公开、不重发，下一次先独立回查。两次生成共60000既有额度/新增支付0，项目见`promotion-reporting/operator-activity-2026-10-25.json`，不能计客户转化。

图库原图来源、SHA、完整提示词和实测身份必须一致。YouTube原生单图流程：`node scripts/youtube/publish-image-prompt.js prepare|submit|verify /absolute/draft.json`；prepare保留已有非空草稿，submit持久预留后单次原生点击，verify仅原帖回查。图片附件懒加载必须等待实际可见的image renderer及解码；隐藏占位img不当附件。unknown先verify后local reconcile并更新原预留，禁止重跑submit。社区图文不抵扣每日Shorts。

大AK正式提交前改用持久预留CLI：`node scripts/campaign/reserve-ak-package.js /absolute/package.json /home/zxhwolfe/creative_work/promotion-media-registry.json`；它读取权威登记，不接受调用方空历史覆盖，同一登记锁下核验并先写三图reserved，本身不联网/不发布。旧check CLI仍可只读预检，但不能替代预留。原有writeOnce负责单次原生提交及独立原帖证明，再将对应operationId预留解为published/明确失败；unknown持续占用。除PNG SHA外，同渠道同报告日期/版次或规范正文重复均阻止；新下载/改编码不是新内容。45条旧登记已由15张实际来源补身份，9条无法核实仍unknown，不用文件名补日期。不同渠道合理同日分发仍允许。

## 非交易日日更与跨日去重

报告日期与发布日期分别记录。休市日沿用最近交易日原图，需要显式设置 `tradingDay:false` 和 `nonTradingDayReuse:{mode:"latest_trading_day",latestTradingDate:"YYYY-MM-DD"}`，正文注明非交易日和真实报告日期；作战卡与涨停复盘必须来自所声明的最近交易日。

该模式只允许复用已确认在更早发布日期公开的同卡。同平台同发布日期已经预留或使用的报告仍阻止再次发布，结果或发布日期未知的历史操作仍阻止复用。新预留保存 `publicationDate`；下载日期、文件改名或重新编码不能充当新报告。普通交易日与没有显式启用该模式的流程保持原有校验。
