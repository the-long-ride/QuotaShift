import sqlite3, json, sys, os, base64

def read_varint(data, offset):
    result = 0
    shift = 0
    pos = offset
    while True:
        if pos >= len(data):
            raise Exception("incomplete")
        byte = data[pos]
        result |= (byte & 0x7F) << shift
        pos += 1
        if not (byte & 0x80):
            break
        shift += 7
    return result, pos

def skip_field(data, offset, wire_type):
    if wire_type == 0:
        _, new_offset = read_varint(data, offset)
        return new_offset
    elif wire_type == 1:
        return offset + 8
    elif wire_type == 2:
        length, content_offset = read_varint(data, offset)
        return content_offset + length
    elif wire_type == 5:
        return offset + 4
    else:
        raise Exception("unknown wire type")

def find_fields(data, target_field):
    offset = 0
    results = []
    while offset < len(data):
        try:
            tag, new_offset = read_varint(data, offset)
        except:
            break
        wire_type = tag & 7
        field_num = tag >> 3
        if field_num == target_field and wire_type == 2:
            try:
                length, content_offset = read_varint(data, new_offset)
                results.append(data[content_offset:content_offset + length])
            except:
                pass
        try:
            offset = skip_field(data, new_offset, wire_type)
        except:
            break
    return results

def find_field_str(data, target_field):
    fields = find_fields(data, target_field)
    if fields:
        return fields[0].decode('utf-8', errors='ignore')
    return None

def decode_unified_state_entry(outer_b64, target_key):
    try:
        outer_blob = base64.b64decode(outer_b64)
    except:
        return None
    data_entries = find_fields(outer_blob, 1)
    for entry in data_entries:
        key = find_field_str(entry, 1)
        if key == target_key:
            rows = find_fields(entry, 2)
            if rows:
                row = rows[0]
                payload_b64 = find_field_str(row, 1)
                if payload_b64:
                    try:
                        return base64.b64decode(payload_b64)
                    except:
                        pass
    return None

db_paths = sys.argv[1].split('|')
res = {}
found = False

# Sort db_paths by modification time so we process the most recently used IDE profile first
db_paths = sorted(db_paths, key=lambda p: os.path.getmtime(p) if os.path.exists(p) else 0, reverse=True)

import urllib.parse
for db in db_paths:
    if not os.path.exists(db):
        continue
    try:
        db_uri = 'file:{}?mode=ro'.format(urllib.parse.quote(db.replace('\\', '/')))
        conn = sqlite3.connect(db_uri, uri=True)
        c = conn.cursor()
        c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'")
        if not c.fetchone():
            conn.close()
            continue
        c.execute("SELECT key, value FROM ItemTable WHERE key IN ('antigravityUnifiedStateSync.oauthToken', 'antigravity.profileUrl', 'antigravityUnifiedStateSync.userStatus', 'antigravity.refreshToken', 'antigravityUnifiedStateSync.enterprisePreferences')")
        for row in c.fetchall():
            res[row[0]] = row[1]
        
        # Detect authMethod based on presence of enterprisePreferences
        ent_pref = res.get("antigravityUnifiedStateSync.enterprisePreferences")
        if ent_pref and ent_pref != "null":
            res["antigravity.authMethod"] = "enterprise"
        else:
            res["antigravity.authMethod"] = "consumer"
            
        conn.close()
        found = True
        break
    except:
        pass

if not found:
    print(json.dumps({}))
    sys.exit(0)

# Decode oauthToken if in protobuf format
oauth_val = res.get("antigravityUnifiedStateSync.oauthToken")
if oauth_val:
    payload = decode_unified_state_entry(oauth_val, "oauthTokenInfoSentinelKey")
    if payload:
        access_token = find_field_str(payload, 1)
        if access_token:
            res["antigravityUnifiedStateSync.oauthToken"] = access_token
        refresh_token = find_field_str(payload, 3)
        if refresh_token:
            res["antigravity.refreshToken"] = refresh_token
        id_token = find_field_str(payload, 5)
        if id_token:
            res["antigravity.idToken"] = id_token

# Decode userStatus if in protobuf format
user_status_val = res.get("antigravityUnifiedStateSync.userStatus")
if user_status_val:
    payload = decode_unified_state_entry(user_status_val, "userStatusSentinelKey")
    if payload:
        f7 = find_field_str(payload, 7)
        email = f7 if (f7 and "@" in f7) else find_field_str(payload, 3)
        if email:
            res["antigravityUnifiedStateSync.userStatus"] = json.dumps({"userInfo": {"email": email}})

print(json.dumps(res))
