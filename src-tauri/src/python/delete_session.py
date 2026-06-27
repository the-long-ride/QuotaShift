import sqlite3, sys, os
db_paths = sys.argv[1].split('|')
for db in db_paths:
    if not os.path.exists(db):
        continue
    try:
        conn = sqlite3.connect(db)
        c = conn.cursor()
        c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'")
        if c.fetchone():
            c.execute("DELETE FROM ItemTable WHERE key IN ('antigravityUnifiedStateSync.oauthToken', 'antigravity.profileUrl', 'antigravityUnifiedStateSync.userStatus', 'antigravity.refreshToken')")
            conn.commit()
        conn.close()
    except Exception as e:
        print("ERROR:", str(e))
        sys.exit(1)
print("SUCCESS")
