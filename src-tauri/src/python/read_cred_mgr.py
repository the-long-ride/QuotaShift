import ctypes, ctypes.wintypes, json, sys
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
adv.CredFree.argtypes = [ctypes.c_void_p]
pcred = ctypes.POINTER(CREDENTIAL)()
if adv.CredReadW("gemini:antigravity", CRED_TYPE_GENERIC, 0, ctypes.byref(pcred)):
    cred = pcred.contents
    blob = bytes(cred.CredentialBlob[:cred.CredentialBlobSize])
    adv.CredFree(pcred)
    try:
        data = json.loads(blob.decode("utf-8"))
        tok = data.get("token", {})
        print(json.dumps({"antigravityUnifiedStateSync.oauthToken": tok.get("access_token", ""), "antigravity.refreshToken": tok.get("refresh_token", ""), "antigravity.credentialManagerVersion": "2", "antigravity.authMethod": data.get("auth_method", "consumer")}))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(0)
print(json.dumps({}))
