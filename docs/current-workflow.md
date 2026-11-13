# 当前推广操作入口

先读主仓库 `docs/ai/promotion_operations.md`，再读策略 `activeContract` 及其当前回执/日数据/交接指针。

- 当前有效日计划为8个名额：四平台雷达视频、X图文或视频择一、大AK微博/头条/淘股吧三图；雪球暂停不计漏做。
- `scripts/ops/check-consistency.js` 离线核规则/队列/日期；`daily-execution-plan.js` 派生任务与回查，不直接发布。
- `scripts/radar/build_episode.py` 通用制作6–8项目中英视频，免费晓晓/Aria，整包QA通过才交付。
- `scripts/ops/publish-video.js` 与 `publish-ak.js` 统一inspect/prepare/submit/verify；inspect绝不连浏览器，未知不重新prepare/submit。
- `scripts/ops/daily-run.js` 默认plan；build只取公开资料/制作，publish须本地启用且各适配器已原生验证。
- 新适配器的离线通过不代表平台发布通过。制作18:00；18:45只发布已通过原生验证的白名单渠道，原生证据及账号/实现校验不符即停；生产timer保持退役。
- 账号验证失败保留原页面，不反复重试。公众号/视频号手动，小红书/Capafy暂停，Product Hunt暂缓。
- 旧工作流完整保存在 `/home/zxhwolfe/creative_work/2026-11-13-promotion-automation-upgrade/before/ops/docs/current-workflow.md`。

最新工程交接：`/home/zxhwolfe/creative_work/2026-11-13-promotion-automation-followup/STATUS.md`。原版第16期源码快照仍在 `templates/radar-daily-video-review/`，不再作为每日运行入口。
