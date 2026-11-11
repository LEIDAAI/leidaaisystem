#!/usr/bin/env python
"""GitHub 主站被网络阻断时的备用发布通道：走 api.github.com 的 Contents API 推送 dist 产物到 gh-pages。
用法：python publish-via-api.py <repo> <branch> <dist_dir>"""
import base64
import http.client
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

repo, branch, dist = sys.argv[1], sys.argv[2], sys.argv[3]
api = f"https://api.github.com/repos/{repo}/contents"


def token() -> str:
    out = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n",
        capture_output=True, text=True,
    ).stdout
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
    raise SystemExit(f"request failed after {retries} tries: {url} ({last})")


def list_dir(path: str):
    status, body = request("GET", f"{api}/{path}?ref={branch}" if path else f"{api}?ref={branch}")
    if status != 200 or not isinstance(body, list):
        return []
    return body


def sha_of(path: str):
    status, body = request("GET", f"{api}/{path}?ref={branch}")
    return body.get("sha") if status == 200 else None


def put(path: str, local: str):
    with open(local, "rb") as f:
        content = base64.b64encode(f.read()).decode()
    payload = {"message": f"deploy: {os.path.basename(path)}", "content": content, "branch": branch}
    sha = sha_of(path)
    if sha:
        payload["sha"] = sha
    status, body = request("PUT", f"{api}/{path}", payload)
    return status


def delete(path: str, sha: str):
    status, body = request("DELETE", f"{api}/{path}", {"message": f"deploy: remove {path}", "sha": sha, "branch": branch})
    return status


local_files = []
for root, _dirs, files in os.walk(dist):
    for name in files:
        full = os.path.join(root, name)
        rel = os.path.relpath(full, dist).replace("\\", "/")
        local_files.append((rel, full))

remote = {}
for item in list_dir("assets"):
    if item.get("type") == "file":
        remote["assets/" + item["name"]] = item["sha"]

ok = fail = 0
for rel, full in sorted(local_files):
    st = put(rel, full)
    if st in (200, 201):
        ok += 1
        print(f"  PUT  {rel}")
    else:
        fail += 1
        print(f"  FAIL {rel} -> {st}")
    remote.pop(rel, None)

removed = 0
for rel, sha in remote.items():
    if delete(rel, sha) in (200, 204):
        removed += 1
        print(f"  DEL  {rel}")

print(f"done: uploaded={ok} failed={fail} removed_stale={removed}")
sys.exit(1 if fail else 0)
