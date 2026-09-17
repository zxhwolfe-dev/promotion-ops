# 攻坚经验（按代价排序）

## 1. OSCHINA 险些覆盖旧文
两个标签 URL 都含 `ai-write`，`find` 前缀匹配命中了旧文的编辑器，在旧文上打开了发布面板（未点确认，无损失）。
**规则：多标签匹配必须精确完整路径。**

## 2. 腾讯云发布三连静默失败
按钮可点、无报错、无请求发出。三个独立根因：
- "文章来源"单选默认未选（不选=静默不发）
- 至少一个官方标签（建议项精确文本匹配点击；仅自定义关键词不够）
- locator 点击面板按钮偶发无效 → evaluate 点击 + 等网络请求确认

## 3. CSDN 发布按钮"点不动"
按钮 y≈1027 超出视口，evaluate 坐标点击落在视口外。用 Playwright locator（自动滚动）解决。
另：标题是显示 div，JS focus() 无效，必须真实点击激活。

## 4. Gmail 搜索被 SPA 吞
搜索框 fill+Enter、#search/hash 直链均不稳。可靠路径：编码 hash URL → 等 12s 检查 hash → 不行则实键输入+点搜索按钮。

## 5. Reddit 静默限流
连续发评论无任何报错，但个人主页不出现=未持久化。隔约 2 小时重试成功。验证必须查个人主页。

## 6. 阿里 mditor 双 textarea
`.mditor-hidden` 是镜像，程序化改它无效；改可见的 `.mditor textarea.textarea` 才生效（或 keyboard.insertText）。

## 7. Bash 管道 head 杀 node
`node x.js | head` 的 SIGPIPE 会让 node 提前死、JSON 不落盘。先重定向到文件再看。

## 8. 百度站长平台域名
正确域名 ziyuan.baidu.com；ziyan.baidu.com 已下线（NXDOMAIN）。曾因错域名连续 5 天误判"站点打不开"。

## 9. 会话耐久度差异（同一浏览器）
腾讯云/Gmail/Reddit/GSC 能扛过浏览器重启；OSCHINA/阿里云/CSDN/百度经常掉。OSCHINA 有时访问即自动恢复——**让用户登录前先自查**。
