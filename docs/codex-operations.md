# 本机Codex推广运营

用户2026-11-13已授权。模型固定沿用gpt-6.1-sol/medium、现有ChatGPT认证，无其他CLI成员或付费API回退。专用会话由只读探针创建，后续按精确UUID续接；主VSCode会话保持原样。事实读主项目推广入口、activeContract及最新同日回执/指标/交接，不把复制的旧历史当现状。

- `node scripts/ops/run-codex.js --config <私有配置> --slot day --probe`真实只读模型接线；先核native turn.completed与最终JSON、nonce/date/slot/thread，保存密封证据后才可启用。probe不访问平台网站或登录浏览器、不发帖；模型请求使用既有OpenAI连接。
- `--dry-run`只规划，不调用模型或浏览器。正常`--slot day|evening`每日每轮持久记录，失败/未知不自动二次执行；晚间不得早于19:45。
- `node scripts/ops/install-codex-schedule.js <私有配置>`只在本机安装10:00/19:45用户级systemd timer。先备份旧配置、确认旧任务未运行，再停旧18:00/18:45 timer；安装失败恢复原启用状态。Persistent=false、不追补旧日。
- 模型负责取数、取舍、编审和复盘，已有原生发布工具负责去重、预留、上传与回查；未验证流程不能盲发。全站功能按入口清单和机会队列承接，不机械逐功能每日发。
- 单轮ops锁与CDP锁协调；模型子进程带本轮所有者标识，其他调用在登录浏览器前停止。陈旧锁/损坏状态保留核对，不自动删后重发。
- 模型正常结束仍不等于推广完成。status=completed必须有本轮更新的同日回执/指标/交接，回执runId和策略三指针匹配；partial/needs_human如实列缺口。对外公开、后台已发、审核和未知分开，未知指标为null。
- 运行元数据、JSONL、最终中文说明及私有配置留WSL ~/.local/share/promotion-ops/codex-orchestrator，权限受限、不入Git；媒体与日运营证据留creative_work。CLI结果在专用会话，当前VSCode窗口的自动刷新/通知未经验证，不承诺主动弹出。
- 电脑/WSL/网络与Chrome登录态须可用。真实登录/验证码保留原页等用户；额度或网络失败记录，不换模型/不转收费路线。中断留核对状态，无自动发布重试。
- 本功能只在本机运行；自动轮禁止Git提交/推送、生产SSH/写库/重启/部署、修改主项目业务源码、改变全局模型/凭据/调度器。

安装验收包含systemd原生语法验证与两个timer实际active状态；单看enabled或enable命令退出码不够。服务通过私有EnvironmentFile继承当前终端已验证的代理变量，不导入其他账号密钥、不修改用户全局代理；后台环境真实续接测试单独留证。`node scripts/ops/codex-status.js <私有配置>`可不调用模型读取最新运行摘要。只读probe不是正式日运营，也不代表全链路效果已经验证。

Chrome使用既有CDP `http://127.0.0.1:9234`。先探测，已通就复用；不通时仅尝试一次用户已授权的Windows Chrome：程序`/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`，参数`--remote-debugging-port=9234`、`--user-data-dir=C:\Users\zxhwo\AppData\Local\AIWorkstationPromotionBrowser`、`--no-first-run`。不新建其他登录资料目录、不关闭常驻浏览器；后台WSL无法启动Windows程序或真实登录过期就明确列人工项。所有带登录态浏览器操作通过`lib/cdp.js`共用锁与账号核验，不绕开ops-owner。此启动说明不承诺电脑休眠/关机时仍可运行。

2026-11-14正式首轮修复：工作区沙箱会阻止Windows程序的AF_VSOCK互操作；这不是主机WSL损坏。正式轮在启动模型前由本机父调度器执行`promotion-browser-preflight`：先检查9234，仅在缺失时用上述固定程序/资料目录启动一次，验证WSL socket有效后等待CDP就绪。模型继续原工作区沙箱权限，只通过Linux/CDP操作浏览器，不在模型内启动Windows程序。probe不执行此预检。

用户明确要求修复后续作时，可用`--continue-run <当日原未完成运行UUID>`创建独立续作日志；原轮记录不覆盖，同一天同一来源只允许一次该续作，不等于自动重试。先读回执/预留，只补未做项，未知稿不重发。CLI对partial返回2、needs_human返回3，避免systemd把需处理事项显示为成功；Restart=no保持不自动重试。

YouTube真实本人验证解除后，先核同一预留和原生页面。仅当日志明确为`blocked_identity_before_upload`、从未选择文件/提交、没有同题原帖，且用户已确认完成验证时，才可使用`node scripts/ops/resume-youtube-preupload.js --job <原作业> --state-root <权威状态目录> --registry <全局媒体台账> --user-verified`接续第一次上传；命令不新增预留、不点击发布。已存在上传框、文件、原帖或提交时间时拒绝执行，只回查原稿。原生检查通过并保存`prepared_native`后，再使用既有发布命令单次提交。历史运行的needs_human不改写，人工解除及最终结果写入当日交接和回执。

2026-11-15运行复核：保留10:00/19:45调度；今日五渠道账号侧发布及昨晚不重复休市旧三图均已独立完成，无新增人工阻塞。`codex-status.js`和后续run.json新增assessment：与同轮原生journal核对身份、内容、媒体SHA和原帖URL，分别列后台已发、匿名待核、晚间未到期与有证据跳过。another-run回执不替旧运行背书，原partial/needs_human退出与未知保持。canContinueRoutineAutomatically只表示本轮日常发布证据齐全，不代表长期稳定或获客有效，更不授予自动重试。
