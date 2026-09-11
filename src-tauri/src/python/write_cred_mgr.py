import ctypes, ctypes.wintypes, json, sys, datetime
CRED_TYPE_GENERIC = 1

def read_input():
    try:
        value = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        if not isinstance(value, dict) or not isinstance(value.get("token"), str):
            raise ValueError
        refresh = value.get("refresh_token")
        if refresh is not None and not isinstance(refresh, str):
            raise ValueError
        id_token = value.get("id_token")
        if id_token is not None and not isinstance(id_token, str):
            raise ValueError
        email = value.get("email")
        if email is not None and not isinstance(email, str):
            raise ValueError
        return value["token"], refresh or None, id_token or None, email or None
    except Exception:
        print("ERROR: invalid writer input", file=sys.stderr)
        sys.exit(2)

class FILETIME(ctypes.Structure):
    _fields_ = [("dwLowDateTime", ctypes.wintypes.DWORD), ("dwHighDateTime", ctypes.wintypes.DWORD)]
class CREDENTIAL_ATTRIBUTE(ctypes.Structure):
    _fields_ = [("Keyword", ctypes.c_wchar_p), ("Flags", ctypes.wintypes.DWORD), ("ValueSize", ctypes.wintypes.DWORD), ("Value", ctypes.c_char_p)]
class CREDENTIAL(ctypes.Structure):
    _fields_ = [("Flags", ctypes.wintypes.DWORD), ("Type", ctypes.wintypes.DWORD), ("TargetName", ctypes.c_wchar_p), ("Comment", ctypes.c_wchar_p), ("LastWritten", FILETIME), ("CredentialBlobSize", ctypes.wintypes.DWORD), ("CredentialBlob", ctypes.POINTER(ctypes.c_ubyte)), ("Persist", ctypes.wintypes.DWORD), ("AttributeCount", ctypes.wintypes.DWORD), ("Attributes", ctypes.POINTER(CREDENTIAL_ATTRIBUTE)), ("TargetAlias", ctypes.c_wchar_p), ("UserName", ctypes.c_wchar_p)]
adv = ctypes.WinDLL("advapi32")
adv.CredReadW.restype = ctypes.wintypes.BOOL
adv.CredReadW.argtypes = [ctypes.c_wchar_p, ctypes.wintypes.DWORD, ctypes.wintypes.DWORD, ctypes.POINTER(ctypes.POINTER(CREDENTIAL))]
adv.CredWriteW.restype = ctypes.wintypes.BOOL
adv.CredWriteW.argtypes = [ctypes.POINTER(CREDENTIAL), ctypes.wintypes.DWORD]
adv.CredFree.argtypes = [ctypes.c_void_p]
new_token, new_refresh_token, new_id_token, target_email = read_input()

pcred = ctypes.POINTER(CREDENTIAL)()
existing = {"auth_method": "consumer", "token": {}}
if adv.CredReadW("gemini:antigravity", CRED_TYPE_GENERIC, 0, ctypes.byref(pcred)):
    cred = pcred.contents
    blob = bytes(cred.CredentialBlob[:cred.CredentialBlobSize])
    adv.CredFree(pcred)
    try:
        existing = json.loads(blob.decode("utf-8"))
    except:
        pass

if "token" not in existing or not isinstance(existing["token"], dict):
    existing["token"] = {}

existing["token"]["access_token"] = new_token
existing["token"]["token_type"] = "Bearer"
if new_refresh_token:
    existing["token"]["refresh_token"] = new_refresh_token
else:
    existing["token"].pop("refresh_token", None)

expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
existing["token"]["expiry"] = expiry

if new_id_token:
    existing["id_token"] = new_id_token
elif target_email:
    stale = True
    if "id_token" in existing and isinstance(existing["id_token"], str):
        try:
            import base64
            parts = existing["id_token"].split(".")
            if len(parts) >= 2:
                pad = parts[1] + "=" * (-len(parts[1]) % 4)
                claims = json.loads(base64.urlsafe_b64decode(pad.encode("ascii")).decode("utf-8"))
                if claims.get("email", "").lower() == target_email.lower():
                    stale = False
        except Exception:
            pass
    if stale:
        existing.pop("id_token", None)
else:
    existing.pop("id_token", None)

new_blob = json.dumps(existing).encode("utf-8")
blob_arr = (ctypes.c_ubyte * len(new_blob))(*new_blob)
cred_write = CREDENTIAL()
cred_write.Type = CRED_TYPE_GENERIC
cred_write.TargetName = "gemini:antigravity"
cred_write.CredentialBlobSize = len(new_blob)
cred_write.CredentialBlob = blob_arr
cred_write.Persist = 2  # CRED_PERSIST_LOCAL_MACHINE
cred_write.UserName = "antigravity"

# Delete first to ensure we write clean
try:
    adv.CredDeleteW = ctypes.WinDLL("advapi32").CredDeleteW
    adv.CredDeleteW.restype = ctypes.wintypes.BOOL
    adv.CredDeleteW.argtypes = [ctypes.c_wchar_p, ctypes.wintypes.DWORD, ctypes.wintypes.DWORD]
    adv.CredDeleteW("gemini:antigravity", CRED_TYPE_GENERIC, 0)
except:
    pass

ok = adv.CredWriteW(ctypes.byref(cred_write), 0)
if ok:
    print("SUCCESS_V2")
else:
    print("WRITE_FAILED", file=sys.stderr)
    sys.exit(1)
