# 第五轮：第四轮修复的本机验收 + 三项遗留功能落地（2026-09-18）

基于 `fix/verification-first-hardening-20260917` 分支 `cdf6475c9850bb8b7eafbacc0d04fb18c2fbf1db`。本会话连接本机真实专用 Chrome；全部动作为只读，未发送邮件/评论/文章，未推送百度 URL。

## 第四轮修复的本机只读验收

`npm ci`/`check`/`test:unit`（74/74）/完整 `npm test`（100/100）与 CI 一致后，用第四轮更严格的探针与快照在真实文章上复验：

- **四平台正文契约全部通过生产 proof**：腾讯 `.mod-content__markdown`、阿里 `.article-content`、CSDN `.article_content`（与默认 `article` 并存）、OSCHINA `.editor`，均唯一可见且首尾针匹配，`status: ok`。
- 过程中发现并记录一个操作性教训：**针文本不能跨过平台渲染引入的标点边界**（CSDN 把 "RAG" 渲染为带引号形式，跨边界的首针永远匹配失败）。这不是代码缺陷；探针如实返回 partial，换纯文本针后通过。
- **快照实测**（含第四轮的目标绑定与标签校验）：CSDN 523→524 读/14 赞、新文 36→40 读；OSCHINA 评论 2/0；腾讯/阿里无已验证指标选择器，如实 `unavailable`。

## 遗留三项的落地

### 1. 文章"提交→响应业务 ID→回读同一 ID"关联 ✅

`lib/articles.js`：新增 `captureResponseArticleId(page, kind)`（监听必须在点击前建立）与 `articleIdFromURL`；`verifyArticle` 接受 `expectedArticleId`，关联三态：

- `matched`：响应业务 ID 与独立回读 URL 的 ID 一致（写入 evidence）；
- `absent`：该平台接口形态**未经真实写入核实**（阿里/CSDN/OSCHINA）或本次未捕获——如实标注，不猜字段；HTTP 200 本身不当作业务成功；
- `mismatch`：`ARTICLE_ID_MISMATCH`（退出码 2），禁止放行。

唯一接入的 `ARTICLE_ID_RESPONSES.tencent`（`action=CreateArticle` → `code===0` → `data.articleId` 整数）来自此前真实发布会话的实测响应；`code!==0`、非整数、字段缺失都拒绝。腾讯发文脚本已接线（监听先于任何提交点击）。测试：`tests/session5.test.js`（4 项单测）+ `tests/session5-browser.test.js`（含 mismatch 反例、业务失败反例、absent 不冒充）。

### 2. Gmail 有界分页 + 同主题会话合并 ✅

`lib/gmail.js`：

- `searchMailbox` 支持翻页（默认上限 10 页、50 行/页）：每页校验 hash 与搜索框一致、必须出现新会话 ID 才算翻页成功，Older 禁用即到头；`coverage` 升级为 `paged_to_end` / `first_page_only`，翻页停滞返回 `paginationError` 且整体 `partial`。
- `verifySent` 新增合并路径：无新线程时，在**基线线程**（有界 3 个、主题匹配）中逐个开信核验；正文+收件人仍绑定同一 `.adn` 消息节点才算数，产出 `merged_thread_readback` 证据（含基线 threadId 与 `mergedIntoBaselineThread: true`）。不能核验时保持原行为（null → 上层 UNVERIFIED，禁止重发）。

测试覆盖：翻页到头 ok/永不到头 partial/合并线程证据（含仅 hash 变化不重载导致的 DOM 残留陷阱——用例间强制 `about:blank` 重置）。

### 3. GSC/百度结构化指标 ✅（百度数据待登录）

- **GSC**（真实页面实测）：总点击 14 / 总曝光 722 / CTR 1.9% / 平均排名 30.5 + 热门查询 25 条（query/clicks/impressions）+ 行范围元信息（"第 1-10 行，共 74 行"）。按真实 DOM 重写解析（普通 table 无 role、汇总为"标签\n数值"文本对）；日期窗口按下态判不出时如实 `unknown_active_window`，不改窗口、不翻页（coverage `first_page_only`）。
- **百度**：先在裸 dashboard 验登录态（未登录时带 site 参数会 400——已定位），未登录 → `LOGIN_REQUIRED` 退出码 3 并保留标签；登录后从侧栏进索引量/关键词页解析表格，结构不识别 → 对应块 `unavailable` + 原因。**真实数据采集待用户登录百度后执行**（本轮浏览器百度会话已失效，未请求登录以保持无人值守完成度）。

## 验证

本机完整 `npm test`：**114/114 通过、0 跳过**（新增 session5 单测 4 + 浏览器 2 组 8 子测）。CI 以本提交 Actions 为准。

## 仍未完成 / 边界

- 阿里/CSDN/OSCHINA 的响应 ID 形态：需要一次**获单次授权的真实发布**才能捕获接口响应，不会臆造。
- GSC 日期窗口的主动设置、查询表翻页：未实现（当前只读首屏并如实标注）。
- 百度结构化数据未在登录态下实测（等登录）。
- 未合并 main、未部署、未开调度；无任何真实写入。
