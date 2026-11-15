'use strict';
const fs=require('node:fs'),path=require('node:path');
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function validateConfig(c){
 for(const k of ['codex','workspace','creativeRoot','stateRoot','policyFile'])if(!path.isAbsolute(c[k]||''))throw Error('Absolute '+k+' required');
 if(!fs.existsSync(c.codex)||!fs.existsSync(c.policyFile))throw Error('CLI or policy missing');
 if(c.model!=='gpt-6.1-sol'||c.effort!=='medium')throw Error('Approved existing Codex model/effort required; no fallback');
 c.publisherStateRoot=c.publisherStateRoot||path.join(path.dirname(c.stateRoot),'automation');
 if(c.publisherStateRoot!==path.join(path.dirname(c.stateRoot),'automation'))throw Error('Use the existing promotion publisher state directory, not a parallel ledger');
 if(c.environmentFile&&(!path.isAbsolute(c.environmentFile)||!c.environmentFile.startsWith(c.stateRoot+path.sep)||!fs.existsSync(c.environmentFile)))throw Error('Private inherited network environment required');
 if(c.threadId&&!UUID.test(c.threadId))throw Error('Invalid dedicated thread ID');
 if(c.parentThreadId&&!UUID.test(c.parentThreadId))throw Error('Invalid source thread ID');
 return c;
}
function outputSchema(){const properties={runId:{type:'string'},date:{type:'string'},slot:{type:'string'},status:{type:'string',enum:['completed','partial','needs_human']},summary:{type:'string'},readOnlyVerified:{type:'boolean'},platformOperations:{type:'boolean'},receiptFile:{type:'string'},metricsFile:{type:'string'},handoffFile:{type:'string'},needsHuman:{type:'array',items:{type:'string'}}};return {type:'object',properties,required:Object.keys(properties),additionalProperties:false};}
function promptFor(c,{runId,date,slot,probe,browserPreflight,continuationOf}){
 const instructions=[`你是用户已授权的本机全站推广运营专用Codex执行会话，接续主会话${c.parentThreadId}的运营规则。当前运行${runId}，北京时间日期${date}，轮次${slot}。`,
 '唯一事实入口依次读取：'+path.join(c.workspace,'AGENTS.md')+'、'+path.join(c.workspace,'docs/codex-operations.md')+'、/home/zxhwolfe/project/akaiagents/AGENTS.md、/home/zxhwolfe/project/akaiagents/docs/ai/promotion_operations.md、'+c.policyFile+'，然后读取策略指向的当前回执、日数据、交接、台账、待办及产品目录/机会队列。最新用户要求与activeContract优先。不要依赖旧对话中的成功/发布推断。',
 '本会话模型固定沿用gpt-6.1-sol/medium和既有ChatGPT认证。不调用Grok/DeepSeek/GLM/Kimi/其他模型CLI，不启动子代理，不改模型路线、全局配置或本调度器，不启动嵌套Codex。',
 '只做推广范围。严禁部署、生产SSH/数据库写入、重启生产服务、修改主项目业务源码、提交推送或处理其他功能脏工作树。禁止打印凭据、原始签名媒体地址或私人邮件正文；不要读取无关私人材料。零新增付费，微软免费晓晓/Aria。',
 '只用既有发布工具与原生界面，不调用未授权的直接写入API。先核账号/素材来源/真实日期/质量/原图SHA及使用追踪，再持久预留，单次原生提交，独立回查。未知/超时只核原稿，不重传/重发。等待真实就绪，不绕过反自动化、安全验证或平台限制；登录/手机验证阻塞保留置前页面并记needsHuman，不反复重试。',
 '公众号/视频号不处理，小红书/Capafy暂停，ProductHunt暂缓，雪球限制期间暂停。WorkBuddy后台由用户管理，不登录、不改变九渠道编号链接映射。知乎历史AI警告继续暂停新增。Gmail每日增量in:anywhere含垃圾箱/回收站，正文与列表覆盖分开，不发送邮件/私信。无真实新/变更可索引URL不凑百度十条。',
 '用户2026-11-14最新规则：最近30天已经介绍过的同一个开源项目，不再用于新一期；换榜单、文案、语言或账号不重置窗口。先查跨平台发布史与原仓库身份，历史不全需补核，6–8个合格新项目不足就换榜/场景，不重复凑数。同一期按原计划中英、多平台同步是同一发布批次，可以继续；既有未知原稿只回查。新包用lib/radar-project-cooldown.js核验。',
 '全站覆盖须逐项核对：爱图工坊、AI开源项目雷达、全球热点选题雷达、两个WorkBuddy技能、企业报告、AI工作站及大AK。按现有周节奏写入当日交接：最近一次动作、已到期机会、本轮执行或不执行的真实原因、下次核对条件；不能只写“目录保留”就算覆盖。没有合格素材或真实机会不强行发布；不新增平台权限。',
 '平台阅读/播放/下载/监控请求不等于真人到站、安装、调用或咨询。未知记null；记录真实采样时间和内容时龄，历史数不得冒充今日。已做内容不重复。结束前复查待核状态，关闭完成的临时页，保留非空草稿/登录页。'];
 if(probe)instructions.push('本轮是只读接线验收：仅读取上述入口、策略和其currentRun；禁止Chrome/CDP、平台网站访问、发布、修改文件和旧待办执行；既有OpenAI模型连接除外。核对回执日期与最多三个未解事项后结束。readOnlyVerified=true、platformOperations=false。三份文件指针使用当前策略已有值，不创建日报。');
 else instructions.push(slot==='day'?'白天轮：先采已发布活跃渠道效果与到期24h/72h数据、通知/Gmail，再根据留存和反馈挑选有用内容。雷达每日中英各一期6–8项目，用真实原生项目卡、大字幕、固定镜头、无无关配图/配乐，先明确第一屏任务收益、审查脚本/成片再发布授权平台。初稿审查不合格时，先改稿、重选项目或换同日可用榜单后继续，不把自己能修的表达问题退给用户；确实无合格来源才停止，不凑数。双语页面名次允许不同，各原生截图保留各自名次，文案说明语言视图而不口播统一名次，不因此退回整个包。摘要不适合传播时核上游事实后重写，或换项目；不为内容选型问题要求用户确认。爱图优先图库未用精美原图+完整真提示词+具体用途/可改项，找不到才研究实创。其他线上功能按真实机会与精选社区周节奏承接，不机械日更每项功能。大AK不提前取旧图冒充当日，交晚间轮处理。':'晚间轮：先读取今天白天的回执，仅做未完成/到期回查。大AK至少17:30后，国内晚报至少19:30实际生成后，核三张原生完整图、交易日/真实版次和视觉完整性；微博/头条/淘股吧只发三图与专业复盘正文，不加产品链接、不裁原图；休市日保留真实报告日期并查重复，不为每天名额重复旧图。回查今天其他渠道与应回复事项，已发视频不再发一条。');
 if(!probe)instructions.push('浏览器父进程预检结果：'+JSON.stringify(browserPreflight||{})+'。Windows Chrome启动由沙箱外本机调度器负责；不要在模型沙箱内启动/重试Windows程序，也不扩大沙箱权限。若CDP可用，直接通过现有lib/cdp.js复用账号；预检不可用则保留真实阻塞，继续公开数据/选题/制作等独立任务。');
 if(continuationOf)instructions.push('这是用户明确要求在环境修复后继续今天未完成任务的新续作，来源运行ID='+continuationOf+'；保留原运行记录、合并今天已有成果，仅完成未做项；不是重新执行原轮，也不重发任何已发布/未知稿件。');
 if(!probe)instructions.push('本轮是用户已授权的正式运营，不是只读测试；之前只读要求仅对对应探针回合生效。readOnlyVerified=false；遇单个平台阻塞，记录该平台并继续可独立完成的工作，不把任务堆回用户。');
 if(!probe)instructions.push(`日报与回执保存${c.creativeRoot}/${date}-promotion-followup/；指标保存${c.creativeRoot}/promotion-reporting/daily/${date}.json，必须保留全部已登记渠道，明确哪些今日未采。合并今天此前发布/未知记录，不覆盖丢失。三份同日指针同步更新到策略，回执必须含orchestratorRunId=${runId}。总结边做边得到的优化并更新待办、STATUS.md，运行离线一致性检查。不得操作旧自动发布timer；它们已由新调度停用，制作/发布由你审稿后调用工具完成。正常结束的状态completed/partial/needs_human均须如实解释，不能为通过验收伪造数据。`);
 instructions.push(`最后按给定schema返回JSON，runId严格为${runId}，date=${date}，slot=${slot}。summary用中文可直接给用户看，列各渠道内容/数据/未完成原因。不要额外启动后续任务。`);return instructions.join('\n\n');
}
module.exports={validateConfig,outputSchema,promptFor,UUID};
