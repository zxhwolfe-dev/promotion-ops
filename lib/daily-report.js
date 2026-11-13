'use strict';
const STATUS={published_native_verified:'已公开',published_native_verified_external_unknown:'后台已发布，外部待核',pending_review:'审核中',submitted_reconcile_only:'已提交，结果待核，不重发',reserved_before_upload:'已预留上传，需核对进度',unknown_reconcile_only:'结果待核，不重发',unknown_upload_reconcile_only:'上传结果待核，不重传',prepared_native:'已准备，未发布',already_complete_today_not_republished:'今天已完成，未重复发布'};
function dailyReport(run){
 const escape=v=>String(v??'—').replaceAll('|','／').replaceAll('\n',' ');
 const channels={douyin:'抖音',bilibili:'B站',tiktok:'TikTok',youtube:'YouTube',x:'X',weibo:'微博',toutiao:'头条',taoguba:'淘股吧'};
 const channel=x=>escape(channels[x]||x);
 const reason=x=>({native_validation_missing:'发布流程尚未通过验证，自动发送关闭',native_adapter_not_yet_validated:'发布流程尚未通过验证，自动发送关闭'}[x]||x);
 const lines=[`${run.date} 推广执行结果`,'','| 渠道 | 内容／状态 | 最新数据 | 需要处理 |','|---|---|---|---|'];
 for(const r of run.results||[]){const metrics=r.proof?.metrics;lines.push(`| ${channel(r.channel)} | ${escape(STATUS[r.status]||r.status)} | ${metrics?escape(JSON.stringify(metrics)):'尚未取得'} | — |`);}
 for(const e of [...(run.failures||[]),...(run.skipped||[])])lines.push(`| ${channel(e.channel||'任务')} | ${e.automationSkipped?'未自动操作'+(e.existingStatus?'；已有记录：'+escape(STATUS[e.existingStatus]||e.existingStatus):''):'未完成'} | — | ${escape(reason(e.reason))} |`);
 const reported=new Set([...(run.results||[]),...(run.failures||[]),...(run.skipped||[])].map(x=>x.channel));
 for(const t of run.plan?.current||[])if(!reported.has(t.channel))lines.push(`| ${channel(t.channel)} | ${t.status==='complete'?'今天有已核回执':t.status==='not_yet_due'?'尚未到发布时间':'缺少今日完整回执'} | 尚未取得新采样 | ${t.status==='needs_result_reconciliation'?'只回查原帖，不重发':'—'} |`);
 if(run.status==='planned_no_browser_or_publication')lines.push('','本次只生成计划，没有连接账号或发布内容。');
 if(['built_requires_native_publisher_validation','built_only_no_publication'].includes(run.status))lines.push('','中英视频已制作并通过本地验收；本次为制作模式，没有上传。');
 if(run.skipped?.length)lines.push('','未启用渠道已列出；已启用渠道正常完成不等于全站运营全部完成。');
 lines.push('','未知数据不记零；累计播放不等于新增用户或产品使用。');return lines.join('\n')+'\n';
}
module.exports={dailyReport};
