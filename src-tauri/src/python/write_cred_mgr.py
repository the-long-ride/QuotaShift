import ctypes, ctypes.wintypes, json, sys, datetime
CRED_TYPE_GENERIC = 1
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
new_token = sys.argv[1]
new_refresh_token = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "" else None

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
    print("WRITE_FAILED:" + str(ctypes.get_last_error()))
