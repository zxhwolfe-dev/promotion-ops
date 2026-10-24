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
