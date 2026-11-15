'use strict';
const f=process.argv[2];if(!f)throw Error('Usage: node scripts/ops/install-codex-schedule.js <private config.json>');require('../../lib/codex-ops-schedule').installSchedule({configFile:require('node:path').resolve(f)}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});
