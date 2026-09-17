# promotion-ops — 中文/英文免费推广运营自动化

AI 产品（aiworkstation.cn / useaistation.com，全球热点选题雷达 + AI 开源项目雷达）的推广运营工具集。
**零付费约束**：所有渠道均为免费方式，不投广告、不买榜、不刷量。

## 架构

```
常驻 Chrome（Windows，--remote-debugging-port=9234，独立资料目录保存登录态）
        │  Playwright connectOverCDP（只连接不重启，登录态不丢）
        ▼
   lib/cdp.js（withPage：复用已有标签/新建，结束只断开）
        │
   scripts/<平台>/<能力>.js（每个脚本独立可跑：node scripts/...）
```

核心原则：
1. **复用登录态**：所有自动化都通过常驻浏览器的会话完成，绝不把凭据写进代码；`browser.close()` 只断开连接不关浏览器。
2. **验证驱动**：每个写操作都要独立验证（Reddit 评论要查个人主页、OSCHINA 回复要数评论数、邮件要用 search 再查）——这些站点的提交经常**静默失败**。
3. **验证码/扫码交人工**：阿里滑块、CSDN 微信扫码确认出现时脚本退出码 3 并提示，人工完成后发布会自动继续，不硬闯。
4. **数据不造假**：统计脚本取不到的指标记 null（SPA 改版频繁），绝不估数。

## 目录

| 路径 | 用途 | 关键经验（踩过的坑） |
|---|---|---|
| `lib/cdp.js` | CDP 连接公共层 | |
| `scripts/gmail/sweep.js` | 收件箱全量检查 | 搜索框/标签 hash 常被 SPA 吞掉，用 `search.js` 的兜底 |
| `scripts/gmail/search.js` | 可靠搜索 | 编码 hash + 搜索按钮双保险 |
| `scripts/gmail/compose-send.js` | 写信发送 | Ctrl+Enter 后必须 search 验证 |
| `scripts/reddit/post-comment.js` | 发评论（old.reddit 表单） | 新版编辑器难触发；连发静默限流（隔 2h）；验证查个人主页 |
| `scripts/reddit/demand-search.js` | 需求帖搜索 | |
| `scripts/tencent-cloud/publish-article.js` | 腾讯云开发者社区发文 | 三个静默失败根因：文章来源单选未选/无官方标签/按钮点击无效（见文件头注释） |
| `scripts/tencent-cloud/update-profile.js` | 资料（昵称等） | 简介超 50 字被接口拒 |
| `scripts/aliyun/publish-article.js` | 阿里云开发者社区发文 | mditor 双 textarea（隐藏的是镜像）；连发触发滑块 |
| `scripts/csdn/publish-article.js` | CSDN 发文 | 标题 div 需真实点击激活；按钮可能在视口外；发布触发微信扫码 |
| `scripts/oschina/publish-article.js` | OSCHINA 发文（tiptap） | insertHTML；裸 URL 要手工包 a 标签；**多标签匹配必须精确完整路径**（曾因前缀匹配差点覆盖旧文） |
| `scripts/oschina/reply-comment.js` | 评论回复 | fill 不触发绑定，必须 keyboard.type；发布按钮在 785px 外 |
| `scripts/baidu-ziyuan/push-urls.js` | 百度收录 API 推送 | **token 走环境变量**；正确域名 ziyuan.baidu.com（ziyan 已下线） |
| `scripts/baidu-ziyuan/read-stats.js` | 索引量/关键词 | 工具页直链报 site is wrong，须从 dashboard 侧栏进 |
| `scripts/search-console/read-performance.js` | GSC 效果 | 深链二刷 400，从属性首页侧栏进 |
| `scripts/stats/daily-snapshot.js` | 全平台数据快照 | 取不到记 null |
| `docs/workflow.md` | 每日例行清单 | |
| `docs/lessons.md` | 攻坚经验汇总 | |

## 使用

```bash
npm i playwright   # 或指向已有 node_modules
export PROMO_CDP=http://127.0.0.1:9234
export BAIDU_PUSH_TOKEN=...   # 仅百度推送需要
node scripts/stats/daily-snapshot.js
```

Windows 侧启动常驻浏览器（一次）：
```
chrome.exe --remote-debugging-port=9234 ^
  --user-data-dir="C:\Users\<you>\AppData\Local\AIWorkstationPromotionBrowser" ^
  --no-first-run
```

## 明确不做

- 付费投放/买榜/刷量
- 绕过验证码（交人工）
- 凭据入库（token 环境变量，账号密码只在本机不入仓）
- 同一渠道重复投稿（各平台发文前查当日 STATUS 台账）
