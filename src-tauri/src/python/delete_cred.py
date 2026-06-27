import ctypes, ctypes.wintypes
CRED_TYPE_GENERIC = 1
try:
    adv = ctypes.WinDLL("advapi32")
    adv.CredDeleteW = adv.CredDeleteW
    adv.CredDeleteW.restype = ctypes.wintypes.BOOL
    adv.CredDeleteW.argtypes = [ctypes.c_wchar_p, ctypes.wintypes.DWORD, ctypes.wintypes.DWORD]
    adv.CredDeleteW("gemini:antigravity", CRED_TYPE_GENERIC, 0)
except Exception as e:
    pass
