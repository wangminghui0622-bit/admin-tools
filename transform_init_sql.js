// Transform admin-core init.sql for the multi-service architecture.
// Core keeps only its own sys_apis/casbin/menus, all re-prefixed /sys-api.
// Foreign-service rows (Job/Mcms/Mms/Fms) are removed -- each service's own
// init.sql re-registers them. Missing core-gap routes are appended.
const fs = require('fs');

const SRC = 'D:\\admin-zero\\admin-core\\internal\\logic\\init.sql';
const TS = '2026-10-15 06:49:53';

// prefixes that belong to OTHER services -> remove entirely
const REMOVE_PREFIXES = [
  '/cloud_file', '/email', '/file', '/member', '/sms',
  '/storage_provider', '/task', '/upload', '/menu_param',
];

// new routes (M1 core gaps) not present in the dump
// [path, description, group, method, is_required]
const NEW_APIS = [
  ['/sys-api/core/ping', 'apiDesc.ping', 'core', 'GET', 0],
  ['/sys-api/core/init/database', 'apiDesc.initDatabase', 'core', 'GET', 1],
  ['/sys-api/core/init/job_database', 'apiDesc.initJobDatabase', 'core', 'GET', 1],
  ['/sys-api/core/init/mcms_database', 'apiDesc.initMcmsDatabase', 'core', 'GET', 1],
  ['/sys-api/captcha/email', 'apiDesc.captchaEmail', 'captcha', 'GET', 1],
  ['/sys-api/captcha/sms', 'apiDesc.captchaSms', 'captcha', 'GET', 1],
  ['/sys-api/user/login_by_email', 'apiDesc.userLoginByEmail', 'user', 'POST', 1],
  ['/sys-api/user/login_by_sms', 'apiDesc.userLoginBySms', 'user', 'POST', 1],
  ['/sys-api/user/register_by_email', 'apiDesc.userRegisterByEmail', 'user', 'POST', 1],
  ['/sys-api/user/register_by_sms', 'apiDesc.userRegisterBySms', 'user', 'POST', 1],
  ['/sys-api/user/reset_password_by_email', 'apiDesc.userResetPasswordByEmail', 'user', 'POST', 1],
  ['/sys-api/user/reset_password_by_sms', 'apiDesc.userResetPasswordBySms', 'user', 'POST', 1],
  ['/sys-api/oauth/login/callback', 'apiDesc.oauthCallback', 'oauth', 'GET', 1],
  ['/sys-api/configuration/system/list', 'apiDesc.systemConfiguration', 'configuration', 'POST', 0],
  ['/sys-api/dict/public/:name', 'apiDesc.publicDict', 'dictionary', 'GET', 1],
];

// menu ids owned by core (everything else is Job/Mcms/Mms/Fms and removed)
const CORE_MENU_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17]);

const foreign = (path) => REMOVE_PREFIXES.some((p) => path.startsWith(p));

let text = fs.readFileSync(SRC, 'utf8');
const lines = text.split('\n');

const replLine = (tableName, fn) => {
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`INSERT IGNORE INTO \`${tableName}\` VALUES `)) {
      lines[i] = `INSERT IGNORE INTO \`${tableName}\` VALUES ` + fn(lines[i].slice(lines[i].indexOf('VALUES ') + 7));
      replaced = true;
      break;
    }
  }
  if (!replaced) throw new Error(tableName + ' INSERT not found');
};

// ---------- casbin_rules ----------
let casbinMax = 0;
replLine('casbin_rules', (body) => {
  const re = /\((\d+),'p','001','([^']*)','([^']*)','','',''\)/g;
  const kept = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, rid, path, method] = m;
    casbinMax = Math.max(casbinMax, Number(rid));
    if (foreign(path)) continue;
    kept.push(`(${rid},'p','001','/sys-api${path}','${method}','','','')`);
  }
  for (const [path, , , method] of NEW_APIS) {
    casbinMax += 1;
    kept.push(`(${casbinMax},'p','001','${path}','${method}','','','')`);
  }
  return kept.join(',') + ';';
});

// ---------- sys_apis ----------
let apisMax = 0;
replLine('sys_apis', (body) => {
  const re = /\((\d+),'[^']*','[^']*','([^']*)','([^']*)','([^']*)','([^']*)','([^']*)',(\d+)\)/g;
  const kept = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, rid, path, desc, group, svc, method, req] = m;
    apisMax = Math.max(apisMax, Number(rid));
    if (svc !== 'Core' || foreign(path)) continue;
    kept.push(`(${rid},'${TS}','${TS}','/sys-api${path}','${desc}','${group}','${svc}','${method}',${req})`);
  }
  for (const [path, desc, group, method, req] of NEW_APIS) {
    apisMax += 1;
    kept.push(`(${apisMax},'${TS}','${TS}','${path}','${desc}','${group}','Core','${method}',${req})`);
  }
  return kept.join(',') + ';';
});

// ---------- sys_menus ----------
let menusKept = 0;
replLine('sys_menus', (body) => {
  const re = /\((\d+),(.*?)\)(?=,\(|;)/g;
  const kept = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, rid, rest] = m;
    if (CORE_MENU_IDS.has(Number(rid))) {
      kept.push(`(${rid},${rest})`);
      menusKept += 1;
    }
  }
  return kept.join(',') + ';';
});

// ---------- role_menus ----------
let rmKept = 0;
replLine('role_menus', (body) => {
  const re = /\((\d+),(\d+)\)/g;
  const kept = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, rid, mid] = m;
    if (CORE_MENU_IDS.has(Number(mid))) {
      kept.push(`(${rid},${mid})`);
      rmKept += 1;
    }
  }
  return kept.join(',') + ';';
});

text = lines.join('\n');

// ---------- AUTO_INCREMENT bumps ----------
text = text.replace(
  /AUTO_INCREMENT=\d+ DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;\n\/\*!40101 SET character_set_client = @saved_cs_client \*\/;\n\n\/\*!40000 ALTER TABLE `casbin_rules` DISABLE KEYS \*\//,
  `AUTO_INCREMENT=${casbinMax + 1} DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;\n/*!40101 SET character_set_client = @saved_cs_client */;\n\n/*!40000 ALTER TABLE \`casbin_rules\` DISABLE KEYS */`
);
text = text.replace(
  /AUTO_INCREMENT=\d+ DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='API Table/,
  `AUTO_INCREMENT=${apisMax + 1} DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='API Table`
);

fs.writeFileSync(SRC, text, 'utf8');

console.log(`casbin next_id=${casbinMax + 1}  sys_apis next_id=${apisMax + 1}  menus kept=${menusKept}  role_menus kept=${rmKept}`);
