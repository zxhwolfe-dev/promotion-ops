# 视频效果复查

沿用 `daily-execution-plan.js`、当前发布回执与日数据，不建立平行排期或后台时钟。

```bash
node scripts/ops/daily-execution-plan.js \
  --as-of 2026-11-07T20:10:00+08:00 \
  --receipt /home/zxhwolfe/creative_work/2026-11-06-promotion-followup/publication-results.json \
  --snapshot /home/zxhwolfe/creative_work/promotion-reporting/daily/2026-11-06.json
```

`reviews[].status` 保留原义：是否取得该观察窗口的单条内容计数。
短视频额外输出 `performanceReview`，不要把计数已采样当作留存已检查：

- TikTok需要播放、平均观看秒数、原生显示完播百分比、主要退出秒数。
- B站需要播放和收藏；未显示的收藏记未知，不补零。
- YouTube只强制播放，原生可取得的其他指标保留，不能强制套用TikTok字段。
- `evidenceByMetric` 保留各指标的真实采样时间和证据，避免把早采留存与晚采播放拼成同一时点。
- `not_due` 不提前结论；`metrics_incomplete` 需补原生指标或如实记录无法取得；`no_window_sample` 不从其他窗口借数。
- `required_metrics_observed` 仅表示上述指标可取得，不代表内容有效、样本充分或已转化。

观察窗口仍为实际公开后24h、72h、7d，迟采保留真实时龄；匿名标识、播放、收藏与下载不当真人获客或订单。
`viewCountThresholdMet` 仅对照既有实验的200播放探索阈值。低于阈值保留样本不足说明，72h也应复查，不因低曝光无限等待；达到阈值也不自动扩量。
连续早退时先复审开头和具体用途；维持单期试验，不预制新批次，不重发已发内容，不宣称因果A/B。

测试完全离线，不连接有登录态Chrome、不写平台或生产环境。
