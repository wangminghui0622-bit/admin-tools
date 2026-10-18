// Append menu registration blocks to job/message init.sql (idempotent, path-based role binding).
const fs = require('fs');

const JOB_BLOCK = `-- menu registration: task management (parent = core SystemManagement menu id 3)
INSERT IGNORE INTO \`sys_menus\` VALUES
(210,'2026-10-15 06:49:53','2026-10-15 06:49:53',8,2,1,'/task','TaskManagement','','/sys/task/index',0,'Job',NULL,'route.taskManagement','ic:baseline-access-alarm',1,0,0,0,'',0,0,0,20,'',3);

-- role 1 is authorized for the task management menu (resolved by path)
INSERT IGNORE INTO \`role_menus\` (\`role_id\`,\`menu_id\`)
SELECT 1, \`id\` FROM \`sys_menus\` WHERE \`path\` IN ('/task');

`;

const MCMS_BLOCK = `-- menu registration: message center management
INSERT IGNORE INTO \`sys_menus\` VALUES
(220,'2026-10-15 06:50:11','2026-10-15 06:50:11',4,1,1,'/mcms_dir','MessageCenterManagement','','LAYOUT',0,'Mcms',NULL,'route.messageCenterManagement','clarity:email-line',0,0,0,0,'',0,0,0,20,'',1000000),
(221,'2026-10-15 06:50:11','2026-10-15 06:50:11',1,2,2,'/mcms_email_provider','EmailProviderManagement','','/mcms/emailProvider/index',0,'Mcms',NULL,'route.emailProviderManagement','clarity:email-line',0,0,0,0,'',0,0,0,20,'',220),
(222,'2026-10-15 06:50:11','2026-10-15 06:50:11',2,2,2,'/mcms_sms_provider','SmsProviderManagement','','/mcms/smsProvider/index',0,'Mcms',NULL,'route.smsProviderManagement','clarity:mobile-line',0,0,0,0,'',0,0,0,20,'',220);

-- role 1 is authorized for the message center menus (resolved by path)
INSERT IGNORE INTO \`role_menus\` (\`role_id\`,\`menu_id\`)
SELECT 1, \`id\` FROM \`sys_menus\` WHERE \`path\` IN ('/mcms_dir','/mcms_email_provider','/mcms_sms_provider');

`;

const JOB_ANCHOR = '/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;';
const MCMS_ANCHOR = "  (9022, 'p', '001', '/sys-api/sms_provider/list', 'POST', '', '', '');";

// job: insert before the mysqldump restore-settings trailer; replace any earlier broken patch
let job = fs.readFileSync('../admin-job/internal/logic/init.sql', 'utf8');
job = job.replace(new RegExp('^-- menu registration.*?^\\s*$', 'ms'), '');
job = job.replace(new RegExp('^-- role 1 is authorized.*?^\\s*$', 'ms'), '');
if (!job.includes(JOB_BLOCK) && !job.includes("'/task','TaskManagement'")) {
  if (!job.includes(JOB_ANCHOR)) throw new Error('job anchor missing');
  job = job.replace(JOB_ANCHOR, JOB_BLOCK + JOB_ANCHOR);
}
fs.writeFileSync('../admin-job/internal/logic/init.sql', job, 'utf8');
console.log('patched admin-job');

// message: file ends right after the last casbin row (no trailer) -> append
let mcms = fs.readFileSync('../admin-message/internal/logic/init.sql', 'utf8');
mcms = mcms.replace(new RegExp('^-- menu registration.*?^\\s*$', 'ms'), '');
mcms = mcms.replace(new RegExp('^-- role 1 is authorized.*?^\\s*$', 'ms'), '');
if (!mcms.includes("'/mcms_dir','MessageCenterManagement'")) {
  if (!mcms.includes(MCMS_ANCHOR)) throw new Error('mcms anchor missing');
  const idx = mcms.indexOf(MCMS_ANCHOR) + MCMS_ANCHOR.length;
  mcms = mcms.slice(0, idx) + '\n' + MCMS_BLOCK + mcms.slice(idx);
}
fs.writeFileSync('../admin-message/internal/logic/init.sql', mcms, 'utf8');
console.log('patched admin-message');
