# 渠道复查清单（只读本地工具）

运行：

```bash
node scripts/stats/channel-review-plan.js /absolute/path/channel-ledger.json
```

只读取一个不超过2 MiB的JSON文件并向stdout输出JSON，不联网、不打开Chrome、不发布、不修改输入水位。错误返回非零退出码。生成计划不等于已执行复查，更不启动定时任务。

输入示例（日期仅为格式示例，不是实际复查记录）：

```json
{
  "asOf": "2026-10-15T14:00:00+08:00",
  "channels": [
    {
      "id": "oschina",
      "platform": "oschina",
      "mode": "active",
      "reviewEveryDays": 1,
      "lastCheckStatus": "partial",
      "lastCheckedAt": "2026-10-15T13:00:00+08:00",
      "lastCompleteCheckAt": "2026-10-13T13:00:00+08:00",
      "publicationStatus": "unknown"
    },
    {
      "id": "wechat-official",
      "platform": "wechat_official_account",
      "mode": "manualOnly",
      "reviewEveryDays": 1,
      "lastCheckStatus": "not_checked",
      "lastCheckedAt": null,
      "publicationStatus": null
    }
  ]
}
```

- `asOf` 必填，使用带时区的完整ISO日期时间。没有隐藏的“当前时间”默认值。
- `id` 必须唯一、小写英文数字下划线或短横线，`platform` 显式填写平台标识。
- `mode` 为 `active`、`paused`、`disabled`、`manualOnly`。公众号、视频号、抖音的明确平台标识即使误填active，也强制列入manualOnly。
- `reviewEveryDays` 为1至3650的整数，一天按24小时计算。
- `lastCheckStatus` 为 `complete`、`partial`、`not_checked`。`lastCheckedAt` 必须显式填写日期或null。complete要求非null；partial/not_checked的时间不推进完整检查水位，只使用可选的 `lastCompleteCheckAt`。没有完整水位时列为待首次核实。
- `publicationStatus` 可为空或 `none`、`published`、`submitted`、`pending`、`unknown`。unknown生成“核验远端结果”事项，不生成重新发布任务。
- `blockedReason` 可选，填真实阻碍，例如 `login_required`。工具不会清除阻碍或恢复暂停渠道。

输出把 `overdue`、`due`、`blocked`、`manualOnly`、`notDue` 分开。计算 `dueAt = lastVerifiedCheckAt + reviewEveryDays`；早于asOf是overdue，等于asOf是due，晚于asOf是notDue；没有完整检查水位为due。暂停/禁用优先保留；结果未知单列核验；手动渠道完全排除自动操作。所有记录的automaticPublish始终false，本工具只安排复查，不是发布器。

业务方执行完完整复查后，凭证据更新原台账并重新生成清单。partial或未检查必须保留原完整水位，不能为了消除“逾期”改成已完成。
