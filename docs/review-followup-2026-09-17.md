# 第二轮审查与修复（2026-09-17）

基于 PR #1 的 `6586b2f77e5faf559d1955be2ea818a238978863` 继续审查。main 保持不变。此次没有连接用户 CDP、没有读取真实邮箱/登录态，没有向任何平台发送内容或百度 token。真实平台验收仍是独立的上线门槛。

## P1：同一操作内的并发提交漏洞

位置：`lib/state.js:90–143`；`tests/regressions.test.js:18–58`。

上一轮 `submitted = true` 在 `await writeJSON()` 之后，两个同时调用的 `submit()` 都能通过检查。本轮先用隔离本地函数复现：`Promise.all([submit(action), submit(action)])` 导致 side-effect count=2，而且返回 verified。修复在首个 await 之前设置 `reserved = true`，第二次调用立即拒绝。另增加操作结束后的 LATE_SUBMIT 保护，等待已启动提交完成才结束操作/释放锁；即使回调忘记 await、提前抛异常，也不能在副作用还进行时解锁。

这修的是公共层潜在调用漏洞；当前平台脚本没有被证明已实际重复发送。不能把复现次数当成真实账号事故。该 API 也不承诺阻止一个 action 内由调用方编写的两次任意网络请求。

## P1：状态文件损坏可能被当作成功或记录缺失

位置：`lib/state.js:42–85`、`lib/state.js:93–96`、`tests/regressions.test.js`。

`status: verified` 没有有效 evidence 的记录，现在不能返回 already_verified。JSON `null`、数组、非对象不能与“文件不存在”混淆；意图 ID 不符和不认识的状态也必须停止。JSON 序列化/写入失败会清理临时文件并保留旧文件。POSIX 额外同步重命名后的父目录；Windows 不宣称相同的断电持久性。

直接的状态根目录链接、子目录链接、非普通记录文件被拒绝。该检查不抵御拥有同一 OS 账号写权限的恶意程序竞态；部署仍要求专用受限目录。人工恢复不许删除 operations 台账来解除保护。

## P1：文章证据不应来自侧栏、隐藏内容或评论

位置：`lib/articles.js:75–145`、四个发文入口的参数预检、`tests/browser.test.js`。

上一轮虽然排除了表单，但从整个 document.body 查片段，可能用正文开头加推荐区/评论中的结尾凑成“完整证据”。现在要求唯一可见 h1，且所有片段位于同一唯一可见正文容器；移除已知非正文区域并拒绝隐藏片段、歧义容器。局部容器通过 `PROMO_ARTICLE_BODY_SELECTORS` 配置，默认仅使用语义 article / role=article；不猜第三方 CSS，不回退全页。

**兼容性变化**：使用 div 包裹正文的平台需要先在实际已发布文章上只读确认选择器，再配置。配置 JSON/结构错误在编辑前停止；CSS 语法及平台 DOM 仍需真实只读验收。不存在局部容器时返回未核验，不能为了变绿改回全页。仍只证明当前会话中标题和首尾样本存在，不证明全文、公众可见、审核通过，更不等于已与本次提交响应 ID 建立因果绑定。

## P2：Gmail 账号与检查范围

位置：`lib/gmail.js:12–50、61–80`、`scripts/gmail/compose-send.js:27–32`。

账号检查只接受唯一可见身份，隐藏账户切换菜单不再作为当前身份。发送前重新检查，已发送回读也核验同一账号。分页不完整返回 partial 而不是 ok，CLI 退出码 2；依然只读有限当前页，不假称分页已实现。查询和 limit 校验在导航前执行。

同主题线程合并、真实头像 DOM、正文签名/引用格式仍需平台验收；未核验时不重发。账号检查也不能阻止人工在检查与点击之间切换账号，运营时仍需专用浏览器和单一操作者。

## P2：CLI 与文件输入的失败边界

位置：`lib/ops.js:25–70`、`lib/cdp.js`、`tests/core.test.js`、`tests/regressions.test.js`。

未知/遗漏的 status 不能以零退出码报告成功。抛出 null 等非 Error 值仍输出结构化错误；CDP 清理不会因读取 null.preservePage 再次抛错并丢失人工页面。输入按实际读取字节数封顶，拒绝损坏 UTF-8，避免替换字符被无声发布。可用性错误不包装为新的成功状态。

## P2：补齐只读的故障排查入口

位置：`lib/inspection.js`、`scripts/ops/inspect-state.js`、README 和 workflow。

新增 `node --env-file=.env scripts/ops/inspect-state.js [--all] [--limit 100]`。只读列出待核验操作、状态计数、锁的 PID/主机、损坏记录、截断标识。不会连接 Chrome、创建目录、暴露正文/evidence、删除锁、重发或把人工声明当自动验证。没有锁龄自动抢占，也不将 PID 存在与否当作跨主机死亡证明。查看 pendingCount/errors/truncated；status=ok 只代表扫描结果正常，不代表平台操作成功。

## 依赖与 CI

`package-lock.json` 由 Actions bootstrap run `35226866888`、job `105220583379` 的 npm 10.9.8 实际生成，依赖 playwright-core 1.63.0，保留 registry resolved 和 sha512 integrity；不是凭空填写哈希。本地容器 DNS 访问 registry 失败，不能宣称本地 npm ci 安装成功。

最终 workflow 去掉临时锁文件输出步骤，改为 npm ci、锁文件不变检查、Linux 完整隔离浏览器测试、Windows Node 22 公共逻辑测试。仅 main push / PR 触发，同一 PR 取消旧的测试运行；所有任务只读仓库权限，不使用运营凭据。Linux CI 强制运行浏览器测试，缺失浏览器或导航被策略阻止时不允许用 skip 把结果变绿。

本地实际结果：31 个 JS 文件语法通过；70 项测试（含父测试）67 通过、0 失败、3 明确跳过。版本 Node 22.16.0 / Chromium 144.0.7559.96 / 环境内置 playwright-core 1.57.0-beta-1764944708000。跳过的是管理员策略禁止的导航型用例；不修改策略。固定版本 CI 结果以本次提交的 Actions 和 PR 更新为准，不从本地结果推断。

## 下一步

见 `docs/NEXT_SESSION.md`。公共层的已知问题已补测试，不需要再加数据库、多 Agent 或自动解锁。下一会话应完成独立代码复审及真实平台只读适配；确需真实写入的验收必须另有明确的单次授权。PR 继续保持草稿，未合并、未部署。

依据：Node fs API（https://nodejs.org/api/fs.html）；npm ci 固定安装语义（https://docs.npmjs.com/cli/v10/commands/npm-ci/）。
