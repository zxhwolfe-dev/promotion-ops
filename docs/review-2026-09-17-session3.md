# 第三轮：独立复审与本机真实只读验收（2026-09-17 晚）

基于 `fix/verification-first-hardening-20260917` 分支 `cf63508544ddd4e099d530ae41a294807b454d51` 继续审查。本会话连接了本机真实专用 Chrome（CDP 9234），完成了**只读**平台验收；未发送任何邮件、评论、文章或百度推送。

## 独立复审结果

`npm ci --ignore-scripts`（锁文件安装成功）、`npm run check`（32 文件语法通过）、`npm run test:unit`、完整 `npm test`（本机 Chromium 144 环境下 71/71 通过、0 跳过）。对 submit 并发/延迟/未等待、台账损坏、证据污染、Gmail 误配、partial 上抛五个方向逐一构造反例审查：

- **已证实并修复**：`lib/state.js` 的 stale `prepared` 记录永久阻塞。提交动作 `action()` 只在 `submitted` 记录落盘**之后**才执行，因此磁盘上仍是 `prepared` 的记录（在本操作锁内）**可证明零外部副作用**；原实现一律 `RECONCILE_REQUIRED` 造成不必要的永久人工恢复。现改为基于证明的自动恢复，并在 `reviews` 中留下 `auto_recovered_stale_prepared` 审计记录。新增反例测试 `tests/core.test.js: stale prepared record is provably side-effect-free and reruns without manual reconcile`。仍阻塞的状态不变：`submitted` / `unknown` / `needs_human`。
- **复审后维持原设计**：四个发文脚本把 `submit()` 包在**第一个**"发布"点击上（而非最终确认）。看似过早，实际是刻意的——部分平台（如阿里云）首个发布点击在某些页面状态下会直接提交，无法证明其无副作用。提前包入只会造成过多的人工恢复（安全方向），不会漏保护。
- **未发现新问题**的方向：submit 双调用/LATE_SUBMIT/锁早释（`reserved` 在首个 await 前设置；成功与错误路径都 `await pending`）；证据污染（`articleDOMProof` 要求唯一可见 h1 + 同一唯一容器内首尾针，排除 nav/aside/comments/隐藏节点，歧义即失败）；Gmail 误配（收件人/正文/主题绑定同一 `.adn` 节点，基线 thread-id 差分）；partial 上抛（`run()` 对 `partial`/`unavailable` 一律退出码 2）。

## 真实平台只读验收（本机 Chrome）

新增 `scripts/ops/probe-article.js`：只读 DOM 契约探针（SPA 渲染等待、针文本自适应偏移窗口、祖先链发现、指标候选扫描）。修复了探针自身的两个缺陷：数字开头元素 id（OSCHINA `div#19759257`）拼出非法 CSS 选择器导致 evaluate 崩溃（改用 `CSS.escape` + 容错）；"RAG" 等单词被内联标记切成独立文本节点导致锚点匹配失败（多窗口×多偏移）。

在真实已发布文章上验证并配置（`PROMO_ARTICLE_BODY_SELECTORS` 与 `config/targets.local.json`，均只在本机/不入库敏感信息）：

| 平台 | 正文容器（唯一可见+含首尾针） | h1 | 指标 |
|---|---|---|---|
| 腾讯云 | `.mod-content__markdown`（939 字符样本） | 唯一 | 阅读数为无标签裸数字，无稳定文本元素——**未配置**，留 null |
| 阿里云 | `.article-content` | 唯一 | 指标客户端加载且无文本形态——**未配置** |
| CSDN | `#content_views` / `article`（默认即可用） | 唯一 | `reads: span.read-count:has-text("阅读")`（该类被"公开"标签复用，需 :has-text 消歧）；`likes: #blog-digg-num` |
| OSCHINA | `.editor` | 唯一 | `comments: .comments-title` |

`daily-snapshot` 快照实测（真实数据）：CSDN 会议纪要文 523 读/14 赞、新文 36 读/0 赞；OSCHINA 两文评论 2/0；腾讯/阿里 `unavailable`（原因如实记录，不估算）。为 SPA 渲染增加了 `networkidle`+缓冲等待与 10s 指标等待（`lib/metrics.js` 超时参数化）。

顺带观察（不入库，报给操作者）：腾讯昵称在文章页头部再次显示"用户12765352"（此前两次提交"辉哥AI工作站"曾显示审核通过）。

## 明确未完成（移交下一会话）

- **提交→响应业务 ID→回读同一 ID 的因果关联**：需要监听发布 POST（腾讯 `action=CreateArticle` 返回 `data.articleId`）并在 `verifyArticle` 强制 URL ID 匹配。本会话把时间花在只读验收（其前置条件）上。
- Gmail 分页（ Older 按钮翻页）与同主题会话合并的自动判定。
- GSC / 百度结构化指标（日期窗口、字段来源、缺失原因）。
- 以上均不阻塞当前只读使用；真实写入验收仍需单次明确授权。
