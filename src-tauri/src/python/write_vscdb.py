import sqlite3, sys, os, base64, time, json

def encode_varint(value):
    buf = bytearray()
    while value >= 0x80:
        buf.append((value & 0x7F) | 0x80)
        value >>= 7
    buf.append(value)
    return bytes(buf)

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

def get_entry_key(entry_data):
    offset = 0
    while offset < len(entry_data):
        tag, new_offset = read_varint(entry_data, offset)
        wire_type = tag & 7
        field_num = tag >> 3
        if field_num == 1 and wire_type == 2:
            length, content_offset = read_varint(entry_data, new_offset)
            return entry_data[content_offset:content_offset + length].decode('utf-8', errors='ignore')
        offset = skip_field(entry_data, new_offset, wire_type)
    return None

def remove_unified_topic_entry(topic_data, target_key):
    result = bytearray()
    offset = 0
    while offset < len(topic_data):
        start_offset = offset
        tag, new_offset = read_varint(topic_data, offset)
        wire_type = tag & 7
        field_num = tag >> 3
        next_offset = skip_field(topic_data, new_offset, wire_type)
        
        should_remove = False
        if field_num == 1 and wire_type == 2:
            length, content_offset = read_varint(topic_data, new_offset)
            entry_data = topic_data[content_offset:content_offset + length]
            key = get_entry_key(entry_data)
            if key == target_key:
                should_remove = True
                
        if not should_remove:
            result.extend(topic_data[start_offset:next_offset])
        offset = next_offset
    return bytes(result)

def encode_len_delim_field(field_num, data):
    tag = (field_num << 3) | 2
    return encode_varint(tag) + encode_varint(len(data)) + data

def encode_string_field(field_num, value):
    return encode_len_delim_field(field_num, value.encode('utf-8'))

def create_unified_topic_entry(sentinel_key, payload):
    row = encode_string_field(1, base64.b64encode(payload).decode('utf-8'))
    entry = encode_string_field(1, sentinel_key) + encode_len_delim_field(2, row)
    return encode_len_delim_field(1, entry)

def create_oauth_info(access_token, refresh_token, expiry):
    f1 = encode_string_field(1, access_token)
    f2 = encode_string_field(2, "Bearer")
    f3 = encode_string_field(3, refresh_token or "")
    seconds_tag = (1 << 3) | 0
    timestamp_msg = encode_varint(seconds_tag) + encode_varint(expiry)
    nanos_tag = (2 << 3) | 0
    timestamp_msg += encode_varint(nanos_tag) + encode_varint(0)
    f4 = encode_len_delim_field(4, timestamp_msg)
    return f1 + f2 + f3 + f4

def create_minimal_user_status_payload(email):
    return encode_string_field(3, email) + encode_string_field(7, email)

def create_unified_state_entry(sentinel_key, payload):
    return base64.b64encode(create_unified_topic_entry(sentinel_key, payload)).decode('utf-8')


db_paths = sys.argv[1].split('|')
token = sys.argv[2]
profile = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "" else None
refresh = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != "" else None
email = sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] != "" else None

for db in db_paths:
    try:
        parent = os.path.dirname(db)
        if parent and not os.path.exists(parent):
            os.makedirs(parent, exist_ok=True)
        conn = sqlite3.connect(db)
        c = conn.cursor()
        c.execute("CREATE TABLE IF NOT EXISTS ItemTable(key TEXT UNIQUE, value TEXT)")
        
        # Read current oauthToken from ItemTable
        c.execute("SELECT value FROM ItemTable WHERE key='antigravityUnifiedStateSync.oauthToken'")
        row = c.fetchone()
        current_topic = b""
        if row:
            try:
                current_topic = base64.b64decode(row[0])
            except:
                pass
        
        # Remove old oauthTokenInfoSentinelKey
        topic_data = remove_unified_topic_entry(current_topic, "oauthTokenInfoSentinelKey")
        
        # Create new oauthTokenInfoSentinelKey entry
        oauth_info = create_oauth_info(token, refresh, int(time.time() + 3600))
        new_oauth_entry = create_unified_topic_entry("oauthTokenInfoSentinelKey", oauth_info)
        
        # Check if authStateWithContextSentinelKey is present
        has_auth_state = False
        try:
            offset = 0
            while offset < len(topic_data):
                tag, new_offset = read_varint(topic_data, offset)
                wire_type = tag & 7
                field_num = tag >> 3
                if field_num == 1 and wire_type == 2:
                    length, content_offset = read_varint(topic_data, new_offset)
                    entry_data = topic_data[content_offset:content_offset + length]
                    if get_entry_key(entry_data) == "authStateWithContextSentinelKey":
                        has_auth_state = True
                        break
                offset = skip_field(topic_data, new_offset, wire_type)
        except:
            pass
            
        if not has_auth_state:
            auth_state_json = json.dumps({
                "state": "signedIn",
                "context": {
                    "project": "",
                    "showProjectError": False,
                    "errorMessage": "",
                    "ineligibleMessage": "",
                    "verificationUrl": "",
                    "isGcpTos": False,
                    "browserOpenFailed": False,
                    "appealUrl": "",
                    "appealLinkText": ""
                }
            })
            auth_state_entry = create_unified_topic_entry("authStateWithContextSentinelKey", auth_state_json.encode('utf-8'))
            topic_data = topic_data + auth_state_entry
            
        topic_data = topic_data + new_oauth_entry
        oauth_proto_val = base64.b64encode(topic_data).decode('utf-8')
        
        # Write user status
        user_status_proto_val = None
        if email:
            user_status_proto_val = create_unified_state_entry("userStatusSentinelKey", create_minimal_user_status_payload(email))

        # Write to database
        c.execute("INSERT OR REPLACE INTO ItemTable(key, value) VALUES('antigravityUnifiedStateSync.oauthToken', ?)", (oauth_proto_val,))
        if profile:
            c.execute("INSERT OR REPLACE INTO ItemTable(key, value) VALUES('antigravity.profileUrl', ?)", (profile,))
        else:
            c.execute("DELETE FROM ItemTable WHERE key='antigravity.profileUrl'")
            
        if refresh:
            c.execute("INSERT OR REPLACE INTO ItemTable(key, value) VALUES('antigravity.refreshToken', ?)", (refresh,))
        else:
            c.execute("DELETE FROM ItemTable WHERE key='antigravity.refreshToken'")
            
        if user_status_proto_val:
            c.execute("INSERT OR REPLACE INTO ItemTable(key, value) VALUES('antigravityUnifiedStateSync.userStatus', ?)", (user_status_proto_val,))
            
        c.execute("INSERT OR REPLACE INTO ItemTable(key, value) VALUES('antigravityOnboarding', 'true')")
        c.execute("DELETE FROM ItemTable WHERE key='jetskiStateSync.agentManagerInitState'")
        conn.commit()
        conn.close()
    except Exception as e:
        print("ERROR:", str(e))
        sys.exit(1)

print("SUCCESS")
