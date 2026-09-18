# 第四轮：对 prepared 自动恢复的反例审查，以及探针/快照修复

审查基线：`48afac43aa72bf5dabbe881e2647721104f85a82`，分支 `fix/verification-first-hardening-20260917`。本轮没有使用用户 CDP、运营登录态或真实发布接口。保留第三轮的真实只读验收成果；本报告修正其中“prepared 证明零外部副作用”的无条件表述，不撤销第三轮观察到的平台选择器。

## 1. P1：历史 prepared 不能作为无条件自动重跑的证明

**问题 → 原 `lib/state.js:99–107`；修复 `lib/state.js:99–106`。**

先给 Codex 的论证划定边界：在同一正常运行的系统、可靠且不回退的本地存储、同一把未被绕过的锁、所有发布动作均经 submit 的模型内，`action()` 确实只在 `await writeJSON(submitted)` 成功后执行。没有找到在这个模型内由半写、rename 后 fsync 抛错、正常 Promise 并发或 record 的内部突变造成的反例。**不能把 rename 成功但 fsync 抛错本身说成“已经执行了 action”。**

故障注入的实际结果：

| 注入位置 | 受保护动作次数 | 最终记录 |
|---|---:|---|
| submitted 临时文件只写一部分然后抛错 | 0 | failed_before_submit |
| submitted 文件 sync 抛错 | 0 | failed_before_submit |
| rename 前抛错 | 0 | failed_before_submit |
| rename 已成功、随后返回错误 | 0 | failed_before_submit |
| rename 后父目录 sync 抛错（POSIX） | 0 | failed_before_submit |
| action 已完成，随后 verified 写入失败 | 1 | unknown，不再重跑 |

**缺失的前提是跨系统崩溃后的持久性与记录来源。**`writeJSON` 在 Windows 上只同步临时文件，然后 rename，没有目录同步步骤。正常读取已经能看到新文件，不等于已有证据保证所有受支持的文件系统/存储环境在断电后仍保留这个命名空间更新。旧快照恢复也能产生相同的 prepared JSON。本地记录没有携带可证明这些情况没有发生的来源信息。

反例模型：先存在 prepared → submitted 写入对当前进程可见 → 远端副作用完成 → 存储命名空间回退/恢复旧快照 → 下一次获得操作锁后读到 prepared → 原版自动恢复并重复执行。对原代码进行旧快照回放，fixture 动作累计 2 次且返回 verified；修复后第二次返回 RECONCILE_REQUIRED，动作保持 1 次。

**这是明确假定存储回退的反例模型，不是真实断电测试，也不证明某一版本 NTFS 一定会回退。**不能从这个测试推导出“Windows 已经发生重复发布”。结论是原代码缺少无条件恢复所需的保证，不是发现了正常执行顺序中的重复调用。

另一个范围问题：`operation()` 在 submit 前执行的编辑器填充可能产生自动保存。公共函数也不禁止回调自己写网络。因此 prepared 至多约束受保护的 action，不证明“所有外部副作用为零”。测试单独展示了这个 API 范围，不把绕过 submit 的发布当成 submit 内部并发漏洞。

最小修复是撤销历史 prepared 的自动放行，保留现有人工核验路径：

```js
if (previous && !['failed_before_submit', 'retry_authorized'].includes(previous.status)) {
  throw new OpsError('RECONCILE_REQUIRED',
    '已有未核验操作，禁止自动重发；请先独立检查远端结果', 2,
    { operationId, state: previous.status });
}
```

测试还真实终止了两个隔离 Node 子进程：prepared 时终止、进入 action 时终止。记录分别保持 prepared/submitted，遗留锁导致 BUSY，不会自动抢锁；仅在测试目录中确认子进程已退出并清理 fixture 锁后，记录仍要求核验。也就是说，**自动放行 prepared 本身并不能解决通常 SIGKILL 留锁的问题**。

这次修复不是跨崩溃 exactly-once：整个目录丢失、回放更早的 failed_before_submit/retry_authorized、外部绕过锁等仍可能破坏本地去重。发生状态恢复或存储故障后应暂停调度、独立核验，不应逐条按旧状态自动发送。没有引入自动删锁、自动覆盖台账或自动重试发布。

## 2. P1：快照等待后可能把文章 B 的数据记入文章 A

**问题 → 原 `scripts/stats/daily-snapshot.js:24–29`；修复 `scripts/stats/daily-snapshot.js:27–64`、`lib/metrics.js:24–61`。**

原版只在 navigate 后校验一次 URL，之后 networkidle、3 秒缓冲和指标等待期间没有再检查目标。用模拟 SPA 跳转的 Page 复现：初始 URL 是文章 123，等待时转为 456，最终却以文章 123 的 URL 和 `status: ok` 保存了 456 的 999/8/7。

已改为：采样前后核对文章；监听并锁存主 frame 的目标变化（包括 A→B→A）；每个指标在同一次 DOM 求值里读取唯一性、文本、加载状态和所属文档 URL；任一目标变化使整行计数作废为 null。监听器在 finally 移除。collectTarget 返回采集开始与完成时间。核心判断：

```js
const checkTarget = () => {
  if (changed || articleURL(target.kind, page.url()) !== url) {
    throw new OpsError('TARGET_CHANGED', '采样期间文章目标发生变化，整行数据作废', 2);
  }
};
```

单元测试覆盖 A→B、A→B→A、单个指标来自 B，以及一个指标失败不抹掉其余可靠指标。隔离浏览器测试另有本地 route.fulfill + History API 用例；它不是对真实腾讯页面的发请求验收。

## 3. P2：探针与发布验证的规则不一致，会给出错误正文契约

**问题 → 原 `scripts/ops/probe-article.js:9–24、56–71`；修复 `scripts/ops/probe-article.js:8–25、81–114`、`lib/articles.js:87–116`。**

真实隔离 DOM 复现了两种误判：不传 lastNeedle 时被归一化成空串，`includes('')` 总成立；文章首段位于正文、尾段仅位于 `.comments` 时，探针仍返回 isBody=true/status=ok，而发布用的 articleDOMProof 返回 false。标题缺失也不影响旧探针的顶层 ok。

现在在连接前要求首尾各至少 12 个非空白字符，限制参数大小；probe 的 isBody 直接复用生产 articleDOMProof，不能从原始 innerText 自行拼证据。生产 proof 同时拒绝空针，并可校验求值时的文档 URL。没有可信 h1/正文则 partial；存在重定向、验证码、HTTP 错误则明确失败。网页头部 bodyHead 摘录已移除。

```js
entry.bodySamplesMatched = !entry.error && entry.visibleCount === 1 && !entry.isDocumentRoot &&
  data.h1.count === 1 && await page.evaluate(articleDOMProof, {
    title: data.h1.text,
    needles: [config.firstNeedle, config.lastNeedle],
    bodySelectors: [entry.selector],
    expectedUrl: config.url,
  });
entry.isBody = !entry.candidateOnly && entry.bodySamplesMatched;
```

探针只能证明当前文档标题与首尾样本存在，不是文章全文/业务 ID/审核通过/公众可见证明。已有的发布→业务 ID→独立回读任务没有借此宣称完成。

## 4. P2：数字 ID 只在计数时转义，返回给人的 selector 仍然非法

**问题 → 原 `scripts/ops/probe-article.js:46–52、84–90`；修复 `scripts/ops/probe-article.js:32–42`。**

原版可能返回 `selector: div#19759257` 与 `uniqueInPage: 1`：只有计算唯一性时用了 CSS.escape，返回的字符串没有转义。无 ID 的元素还按 tag 而非所返回的 class selector 计数。

现在构造一次 selector，返回和计数使用完全相同的字符串；ID 和每个 class token 都经 CSS.escape。可见数量、总数量分开返回。选择器参数支持一个完整 CSS 表达式或 JSON 数组，不再盲目 split(',') 破坏 :is(.a,.b) 等合法语法。测试验证数字 ID、带冒号 class、唯一性及返回选择器都可回读。

自动发现改为一次有界文本遍历，片段仅用于发现候选，不作为验证证据。未显式选择的祖先容器只标 bodySamplesMatched/candidateOnly，不据此设置 isBody 或让顶层变绿；须人工选定局部选择器重跑。metrics 始终标 candidateOnly，仍需操作者确认统计含义，不会自动写进本机配置。

## 5. P2：增加等待时长没有解决“元素出现了但值还没好”

**问题 → 原 `lib/metrics.js:12–19`；修复 `lib/metrics.js:8–61`、`scripts/stats/daily-snapshot.js:43–57`。**

旧版只等待元素 visible，元素原本已显示“加载中”时，会立即读一次而不是等待 10 秒；networkidle 加固定等待也无法证明指标数据就绪。

现在只读轮询唯一、非 aria-busy、可解析的数字；保留真实 0；校验文本标签与 requested metric 一致，不能把“评论 2”录为阅读 2；一个指标失败只影响自身。新增可选 target.readySelector，支持平台经实际确认的加载完成标记；不编造各站的标记。

默认 readiness=parseable_dom_only，不声称已经收到本次统计 API 响应。**页面先呈现数值 0、又没有任何 loading/ready 标记时，通用 DOM 层仍无法证明这个 0 是最终值。**需要 Codex 在真实只读页面上配置可靠 readySelector，或将接口响应与 DOM 对应。截图/DOM 计数也不是去重后的访问统计。

## 验证范围与交接

新增 `tests/session4.test.js` 与 `tests/session4-browser.test.js`；修改 stale prepared 测试为保守核验断言；Windows test:unit 也包含本轮故障/状态/数据来源回归，不只在 Linux 上执行。

本地只运行了本轮受影响模块、当前 core 和新增测试：66 项（含父测试），63 通过、0 失败、3 个本地 URL 导航用例因 ERR_BLOCKED_BY_ADMINISTRATOR 跳过。不是完整仓库测试，未将旧上传包中的未更新测试冒充最新全量结果。使用环境 Node22.16.0 / 内置 playwright-core1.57.0-beta / Chromium144；涉及修改的基线文件逐个校验过 Git blob SHA。固定依赖 1.63.0 和完整当前仓库由本提交 Actions 验证，结果以 PR 评论中的实际日志为准。CI 禁止把缺少浏览器/被策略阻止的导航测试跳过后当成通过。

Codex 下一步：

1. 拉取本分支最新提交，先独立复审本轮差异与反例，不重复套用旧 48afac4 补丁。检查 npm ci、npm run check、npm run test:unit、完整 npm test 与 CI。
2. 复用第三轮本机已发布文章，只读重跑 probe 和快照。保留已确认的各平台正文/指标选择器，确认更严格的针文本、CSS 表达式、指标标签与 readySelector 是否兼容。遇到 partial 查原因，不取消校验换取全绿。
3. prepared 记录先 inspect-state/reconcile；不删 operations，不因锁龄、mtime、PID 或“只看到 prepared”自动重新发布。恢复旧目录/系统崩溃后暂停发送并整体核验。
4. 继续未完成的文章提交响应 ID 关联、Gmail 分页/线程合并、GSC/百度结构化采集。未取得具体单次发送授权，不做真实发布测试。main、生产调度和部署保持不变。

参考语义：
- Node fs.sync：https://nodejs.org/api/fs.html#filehandlesync
- Linux fsync： https://man7.org/linux/man-pages/man2/fsync.2.html （文件同步与目录条目持久化不同）
- SQLite 原子提交的存储假设：https://www.sqlite.org/atomiccommit.html#hardware_assumptions
- Windows MoveFileExW：https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw
- Playwright networkidle 不作为就绪证明：https://playwright.dev/docs/api/class-frame#frame-wait-for-load-state
