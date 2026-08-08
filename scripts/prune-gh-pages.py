#!/usr/bin/env python3
"""
Auto-prune stale assets from gh-pages after every deploy.
Keeps only the assets in the current dist/assets folder.
Run from repo root after building: python3 scripts/prune-gh-pages.py
"""
import urllib.request, json, os, sys, subprocess

REPO = "taxresolutioncrm/taxcasereview-CRM"

# Get token from env or git credential
T = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
if not T:
    print("ERROR: set GH_TOKEN env var")
    sys.exit(1)

headers = {"Authorization": f"token {T}", "Accept": "application/vnd.github+json"}

def gh(url, method="GET", data=None):
    req = urllib.request.Request(url, headers=headers, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(data).encode()
    with urllib.request.urlopen(req) as r:
        return json.load(r)

# Current build assets
dist_dir = os.path.join(os.path.dirname(__file__), "../dist/assets")
if not os.path.exists(dist_dir):
    print("ERROR: dist/assets not found — run npm run build first")
    sys.exit(1)

current_assets = set(f"assets/{f}" for f in os.listdir(dist_dir))
print(f"Current build has {len(current_assets)} assets")

# Get gh-pages tree
tree = gh(f"https://api.github.com/repos/{REPO}/git/trees/gh-pages?recursive=1")
stale = [(f["path"], f["sha"]) for f in tree["tree"]
         if f["path"].startswith("assets/")
         and f["type"] == "blob"
         and f["path"] not in current_assets]

if not stale:
    print("✅ No stale assets — gh-pages is clean")
    sys.exit(0)

print(f"Pruning {len(stale)} stale assets...")

branch = gh(f"https://api.github.com/repos/{REPO}/git/ref/heads/gh-pages")
base_commit_sha = branch["object"]["sha"]
commit = gh(f"https://api.github.com/repos/{REPO}/git/commits/{base_commit_sha}")
base_tree_sha = commit["tree"]["sha"]

BATCH = 300
for i in range(0, len(stale), BATCH):
    batch = stale[i:i+BATCH]
    entries = [{"path": p, "mode": "100644", "type": "blob", "sha": None} for p, _ in batch]
    new_tree = gh(f"https://api.github.com/repos/{REPO}/git/trees", method="POST",
                  data={"base_tree": base_tree_sha, "tree": entries})
    base_tree_sha = new_tree["sha"]
    print(f"  Batch {i//BATCH+1}: {min(i+BATCH, len(stale))}/{len(stale)} pruned")

new_commit = gh(f"https://api.github.com/repos/{REPO}/git/commits", method="POST", data={
    "message": f"chore: auto-prune {len(stale)} stale asset chunks",
    "tree": base_tree_sha,
    "parents": [base_commit_sha]
})
gh(f"https://api.github.com/repos/{REPO}/git/refs/heads/gh-pages", method="PATCH",
   data={"sha": new_commit["sha"]})

print(f"✅ Done — {len(stale)} stale files removed, commit {new_commit['sha'][:8]}")
