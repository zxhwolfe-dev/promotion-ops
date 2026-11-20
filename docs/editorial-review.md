# 独立编辑复审

收到用户推广指令后，执行者可对具体成稿发起独立编辑复审。固定gpt-6.1-sol/medium和现有ChatGPT认证。复审在新会话内以read-only沙箱读取成稿和真实图片，只返回编辑意见。账号操作由当轮运营执行者负责。

制作前，先写具体受众、用户任务、首屏、为什么值得本次发布、来源与近期反馈。制作完成后创建仓库外JSON：

```json
{
  "contentId":"ep21-radar-daily",
  "date":"2026-11-17",
  "brief":{"audience":"具体受众","viewerTask":"具体任务","opening":"首屏原文","whyThisContent":"来源与选择依据"},
  "jobFiles":["/绝对路径/job-douyin.json","/绝对路径/job-youtube.json"],
  "files":["/绝对路径/episode-input.json","/绝对路径/quality-report.json","/绝对路径/captions.srt"],
  "previewImages":["/绝对路径/首屏解码图.png","/绝对路径/项目卡审稿图.png","/绝对路径/片尾解码图.png"]
}
```

jobFiles列全本次目标渠道的真实作业；files列中英旁白、字幕、QA及已核上游来源；previewImages为1–6张真实预览，必须覆盖双语与关键画面，不用无关图片。视频、横竖封面、三图等job媒体自动纳入SHA快照；其他图文用含channel、publicationDate、caption、imagePaths的内容作业JSON，全部成稿也必须在files内。

执行 `node scripts/ops/review-content.js --config "$HOME/.local/share/promotion-ops/editorial-review.json" --manifest <仓库外JSON>`。approve后再准备已审稿件。revise先改稿，最多再审一次，仍不合格就记录并处理其他工作。发布已审成稿前可调用 `assertApproved(job, stateRoot)` 核对文案、账号与媒体哈希。回查旧稿沿用原回执。工具故障按实际结果记录。

按真实作业媒体区分雷达视频、大AK三图和普通图文。大AK完整长图可放大阅读。`issues`只放有具体位置、实际影响和最小修法的阻断缺陷，`suggestions`放非阻断优化。核心用途不清、事实矛盾、来源不明、关键文字不可读仍不能通过。第二审附第一审结果，先核已解决项，再核新增或漏检事实。保留旧拒稿、内容ID和日期。

制作前先列“任务→产物→必要条件→原文依据”，检查原卡与上游是否一致；首屏显示场景和收益，六张完整来源卡之外的主要阅读层只突出用途与关键条件。字幕按完整词和短语检查。大AK缺少新闻证据可先补原文；若核心问题只能修改源站解决，具体登记为来源端问题，不裁图、不改生产或靠免责声明放行。当天短版未发布时，留存实验状态为未开始，不能用旧长版指标冒充短版结果。

用户明确要求继续补稿时，主会话可在实质修复后为同一内容追加一次独立验收，调用时记录 `manualRepairAuthorization` 原指令。保留原两审和相同内容ID。发布按当轮授权和单次提交/回查规则执行。

已通过的视频可做一次独立的封面修正验收。沿用同一内容ID，保留全部审查记录。上一审须为approve且共三次审查。只提交一个平台作业，工具核实旧作业哈希，允许变更横竖封面路径。原上传只更新封面。抖音的封面流量建议按用户11/18的要求处理。

进程在上传期间中断留下reserved_before_upload时，显式resume-preparation仅通过平台适配器核对原页面、文件名及原生时长后恢复元数据；不重新上传、不推断已发布。已提交记录只能verify。

24h与72h数据按真实时龄记录。评估看逐平台播放、平均观看/总时长、完播、2秒跳出、收藏与有效问题。暂无证据或未到期的指标记未知。样本少时保留不确定结论。
