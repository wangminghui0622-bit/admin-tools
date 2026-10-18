# -*- coding: utf-8 -*-
"""Transform admin-core init.sql for the multi-service architecture.

Core keeps only its own sys_apis/casbin/menus, all re-prefixed /sys-api.
Foreign-service rows (Job/Mcms/Mms/Fms) are removed -- each service's own
init.sql re-registers them. Missing core-gap routes are appended.
"""
import re
import sys

SRC = r"D:\admin-zero\admin-core\internal\logic\init.sql"
TS = "2026-10-15 06:49:53"

# prefixes that belong to OTHER services -> remove entirely
REMOVE_PREFIXES = (
    "/cloud_file", "/email", "/file", "/member", "/sms",
    "/storage_provider", "/task", "/upload", "/menu_param",
)

# new routes (M1 core gaps) not present in the dump
# (path, description, group, method, is_required)
NEW_APIS = [
    ("/sys-api/core/ping", "apiDesc.ping", "core", "GET", 0),
    ("/sys-api/core/init/database", "apiDesc.initDatabase", "core", "GET", 1),
    ("/sys-api/core/init/job_database", "apiDesc.initJobDatabase", "core", "GET", 1),
    ("/sys-api/core/init/mcms_database", "apiDesc.initMcmsDatabase", "core", "GET", 1),
    ("/sys-api/captcha/email", "apiDesc.captchaEmail", "captcha", "GET", 1),
    ("/sys-api/captcha/sms", "apiDesc.captchaSms", "captcha", "GET", 1),
    ("/sys-api/user/login_by_email", "apiDesc.userLoginByEmail", "user", "POST", 1),
    ("/sys-api/user/login_by_sms", "apiDesc.userLoginBySms", "user", "POST", 1),
    ("/sys-api/user/register_by_email", "apiDesc.userRegisterByEmail", "user", "POST", 1),
    ("/sys-api/user/register_by_sms", "apiDesc.userRegisterBySms", "user", "POST", 1),
    ("/sys-api/user/reset_password_by_email", "apiDesc.userResetPasswordByEmail", "user", "POST", 1),
    ("/sys-api/user/reset_password_by_sms", "apiDesc.userResetPasswordBySms", "user", "POST", 1),
    ("/sys-api/oauth/login/callback", "apiDesc.oauthCallback", "oauth", "GET", 1),
    ("/sys-api/configuration/system/list", "apiDesc.systemConfiguration", "configuration", "POST", 0),
    ("/sys-api/dict/public/:name", "apiDesc.publicDict", "dictionary", "GET", 1),
]

# menu ids owned by core (everything else is Job/Mcms/Mms/Fms and removed)
CORE_MENU_IDS = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17}

def foreign(path: str) -> bool:
    return path.startswith(REMOVE_PREFIXES)

def main() -> None:
    with open(SRC, encoding="utf-8") as f:
        text = f.read()

    # ---------- casbin_rules ----------
    m = re.search(r"INSERT IGNORE INTO `casbin_rules` VALUES (.*?);", text)
    assert m, "casbin_rules INSERT not found"
    rows = re.findall(r"\((\d+),'p','001','([^']*)','([^']*)','','',''\)", m.group(1))
    kept, dropped, max_id = [], 0, 0
    for rid, path, method in rows:
        max_id = max(max_id, int(rid))
        if foreign(path):
            dropped += 1
            continue
        kept.append("(%d,'p','001','/sys-api%s','%s','','','')" % (int(rid), path, method))
    for path, _desc, _g, method, _req in NEW_APIS:
        max_id += 1
        kept.append("(%d,'p','001','%s','%s','','','')" % (max_id, path, method))
    new_line = "INSERT IGNORE INTO `casbin_rules` VALUES " + ",".join(kept) + ";"
    text = text[:m.start()] + new_line + text[m.end():]
    casbin_max = max_id

    # ---------- sys_apis ----------
    m = re.search(r"INSERT IGNORE INTO `sys_apis` VALUES (.*?);", text)
    assert m, "sys_apis INSERT not found"
    rows = re.findall(
        r"\((\d+),'[^']*','[^']*','([^']*)','([^']*)','([^']*)','([^']*)','([^']*)',(\d+)\)",
        m.group(1))
    kept, dropped, max_id = [], 0, 0
    for rid, path, desc, group, svc, method, req in rows:
        max_id = max(max_id, int(rid))
        if svc != "Core" or foreign(path):
            dropped += 1
            continue
        kept.append("(%d,'%s','%s','/sys-api%s','%s','%s','%s','%s',%s)"
                    % (int(rid), TS, TS, path, desc, group, svc, method, req))
    apis_kept = len(kept)
    for path, desc, group, method, req in NEW_APIS:
        max_id += 1
        kept.append("(%d,'%s','%s','%s','%s','%s','Core','%s',%d)"
                    % (max_id, TS, TS, path, desc, group, method, req))
    new_line = "INSERT IGNORE INTO `sys_apis` VALUES " + ",".join(kept) + ";"
    text = text[:m.start()] + new_line + text[m.end():]
    apis_max = max_id

    # ---------- sys_menus ----------
    m = re.search(r"INSERT IGNORE INTO `sys_menus` VALUES (.*?);", text)
    assert m, "sys_menus INSERT not found"
    rows = re.findall(r"\((\d+),(.*?)\)(?=,\(|\s*;)", m.group(1), re.S)
    kept, menus_kept, dropped = [], 0, 0
    for rid, rest in rows:
        if int(rid) in CORE_MENU_IDS:
            kept.append("(%s,%s)" % (rid, rest))
            menus_kept += 1
        else:
            dropped += 1
    new_line = "INSERT IGNORE INTO `sys_menus` VALUES " + ",".join(kept) + ";"
    text = text[:m.start()] + new_line + text[m.end():]

    # ---------- role_menus ----------
    m = re.search(r"INSERT IGNORE INTO `role_menus` VALUES (.*?);", text)
    assert m, "role_menus INSERT not found"
    pairs = re.findall(r"\((\d+),(\d+)\)", m.group(1))
    kept = ["(%d,%d)" % (int(rid), int(mid)) for rid, mid in pairs
            if int(mid) in CORE_MENU_IDS]
    rm_kept = len(kept)
    new_line = "INSERT IGNORE INTO `role_menus` VALUES " + ",".join(kept) + ";"
    text = text[:m.start()] + new_line + text[m.end():]

    # ---------- AUTO_INCREMENT bumps ----------
    text = re.sub(r"AUTO_INCREMENT=\d+ DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;\n/\*!40101 SET character_set_client = @saved_cs_client \*/;\n\n/\*!40000 ALTER TABLE `casbin_rules` DISABLE KEYS \*/",
                  "AUTO_INCREMENT=%d DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;\n/*!40101 SET character_set_client = @saved_cs_client */;\n\n/*!40000 ALTER TABLE `casbin_rules` DISABLE KEYS */" % (casbin_max + 1),
                  text, count=1)
    text = re.sub(r"AUTO_INCREMENT=\d+ DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='API Table",
                  "AUTO_INCREMENT=%d DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='API Table" % (apis_max + 1),
                  text, count=1)

    with open(SRC, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)

    print("casbin: next_id=%d  sys_apis: next_id=%d  menus kept=%d  role_menus kept=%d"
          % (casbin_max + 1, apis_max + 1, len(menus_kept), len(rm_kept)))

if __name__ == "__main__":
    main()
