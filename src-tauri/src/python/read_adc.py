import json, sys, os

paths = sys.argv[1].split("|") if len(sys.argv) > 1 else []
result = {}

for p in paths:
    if not os.path.exists(p):
        continue
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("type") != "authorized_user":
            continue
        if data.get("refresh_token"):
            result["antigravity.refreshToken"] = data["refresh_token"]
            result["antigravity.authMethod"] = "consumer"
            if data.get("client_id"):
                for known_id_prefix in ["76", "1071", "8843"]:
                    if data["client_id"].startswith(known_id_prefix):
                        if known_id_prefix == "8843":
                            result["antigravity.authMethod"] = "enterprise"
                        break
        if data.get("access_token"):
            result["antigravityUnifiedStateSync.oauthToken"] = data["access_token"]
        if data.get("token_uri"):
            result["antigravity.tokenUri"] = data["token_uri"]
        break
    except:
        pass

print(json.dumps(result))
