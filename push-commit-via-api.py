#!/usr/bin/env python
"""github.com 主站不可达时的备用提交通道：走 api.github.com 的 Git Data API 推送本地提交到远端分支。
用法：python push-commit-via-api.py <repo> <branch> <file1> [file2 ...]  # 文件路径相对仓库根
"""
import base64
import http.client
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

repo, branch = sys.argv[1], sys.argv[2]
files = sys.argv[3:]
api = f"https://api.github.com/repos/{repo}"


def token() -> str:
    out = subprocess.run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n",
                         capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("no token")


TOK = token()


def request(method: str, url: str, payload=None, retries: int = 3):
    data = json.dumps(payload).encode() if payload is not None else None
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {TOK}")
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("User-Agent", "workbuddy-publisher")
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return resp.status, json.loads(resp.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode() or "{}")
            except Exception:
                body = {}
            return e.code, body
        except (urllib.error.URLError, http.client.IncompleteRead, ConnectionError, TimeoutError) as e:
            last = e
            time.sleep(2 + attempt * 3)
    raise SystemExit(f"request failed: {url} ({last})")


# 1) 基线提交
st, ref = request("GET", f"{api}/git/ref/heads/{branch}")
if st != 200:
    raise SystemExit(f"ref fetch failed: {st} {ref}")
base_sha = ref["object"]["sha"]
st, base_commit = request("GET", f"{api}/git/commits/{base_sha}")
base_tree = base_commit["tree"]["sha"]
print(f"base: {base_sha[:10]} tree {base_tree[:10]}")

# 2) 本地待推提交的说明与文件树
message = subprocess.run(["git", "log", "-1", "--pretty=%s"], capture_output=True, text=True).stdout.strip()
body_extra = subprocess.run(["git", "log", "-1", "--pretty=%b"], capture_output=True, text=True).stdout.strip()
full_message = message if not body_extra else f"{message}\n\n{body_extra}"

# 3) 逐文件建 blob
tree_entries = []
for rel in files:
    path = rel.replace("\\", "/")
    if not os.path.exists(rel):
        # 文件已删除：tree 条目 sha 置空表示移除该路径
        tree_entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
        print(f"  delete {path}")
        continue
    with open(rel, "rb") as f:
        content = base64.b64encode(f.read()).decode()
    st, blob = request("POST", f"{api}/git/blobs", {"content": content, "encoding": "base64"})
    if st not in (200, 201):
        raise SystemExit(f"blob failed for {rel}: {st} {blob}")
    tree_entries.append({"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    print(f"  blob {rel} -> {blob['sha'][:10]}")

# 4) 新 tree（基于远端 tree，只覆盖指定文件）
st, new_tree = request("POST", f"{api}/git/trees", {"base_tree": base_tree, "tree": tree_entries})
if st not in (200, 201):
    raise SystemExit(f"tree failed: {st} {new_tree}")
print(f"tree -> {new_tree['sha'][:10]}")

# 5) 新 commit
st, commit = request("POST", f"{api}/git/commits", {
    "message": full_message, "tree": new_tree["sha"], "parents": [base_sha]
})
if st not in (200, 201):
    raise SystemExit(f"commit failed: {st} {commit}")
print(f"commit -> {commit['sha'][:10]}")

# 6) 更新 ref（fast-forward）
st, updated = request("PATCH", f"{api}/git/refs/heads/{branch}", {"sha": commit["sha"], "force": False})
if st not in (200, 201):
    raise SystemExit(f"ref update failed: {st} {updated}")
print(f"branch {branch} -> {commit['sha'][:10]}")
