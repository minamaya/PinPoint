#!/usr/bin/env python3
"""Recover CI jobs stranded on a Bazzite runner that stopped answering (PP-4k0).

Runs from .github/workflows/bazzite-watchdog.yaml every five minutes, on
GitHub-hosted runners, whenever BAZZITE_LEASE is not "0" (cleanly off). The
supervisor on Bazzite rewrites the lease at least every 30 seconds while it is
alive, so a lease whose time is more than DEAD_AFTER_S old means the machine
crashed, lost its network, or was powered off mid-run.

A job is stranded when it waits for a `pinpoint-run-<id>` label and either the
supervisor is dead (and the job has waited GRACE_S) or the job has waited
STUCK_AFTER_S even with the supervisor alive. Each stranded run is cancelled. A
pull_request run is then re-run, and a re-run always routes to ubuntu-latest
(`github.run_attempt == 1` in ci.yml). A cancelled merge-queue run drops its PR
from the queue; the log names the PR so it can be re-queued.

Jobs already running on a dead VM need no help: GitHub fails a job whose runner
stops reporting.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

LABEL_PREFIX = "pinpoint-run-"
LEASE_TTL_S = 90
DEAD_AFTER_S = 180
GRACE_S = 120
STUCK_AFTER_S = 30 * 60
QUEUE_BRANCH_PREFIX = "gh-readonly-queue/main/"


def parse_ts(text: str) -> datetime:
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def heartbeat(lease: str) -> datetime | None:
    """The time the supervisor last wrote the lease, or None when it is off or unreadable."""
    try:
        if lease.startswith("1-"):
            return parse_ts(lease[2:])
        if lease[:1] == "2":
            return parse_ts(lease) - timedelta(seconds=LEASE_TTL_S)
    except ValueError:
        return None
    return None


def stranded(job: dict, now: datetime, supervisor_dead: bool) -> bool:
    if job["status"] != "queued" or not any(
        lbl.startswith(LABEL_PREFIX) for lbl in job["labels"]
    ):
        return False
    waited = (now - parse_ts(job["created_at"])).total_seconds()
    return waited > STUCK_AFTER_S or (supervisor_dead and waited > GRACE_S)


def queue_pr(head_branch: str) -> str | None:
    """PR number from a merge-queue branch such as gh-readonly-queue/main/pr-2629-<sha>."""
    if not head_branch.startswith(QUEUE_BRANCH_PREFIX):
        return None
    rest = head_branch[len(QUEUE_BRANCH_PREFIX) :]
    parts = rest.split("-")
    return parts[1] if len(parts) > 2 and parts[0] == "pr" else None


def api(method: str, path: str):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}{path}",
        method=method,
        headers={
            "Authorization": f"Bearer {os.environ['GH_TOKEN']}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def main() -> int:
    now = datetime.now(timezone.utc)
    lease = os.environ.get("BAZZITE_LEASE", "0")
    beat = heartbeat(lease)
    dead = beat is None or (now - beat).total_seconds() > DEAD_AFTER_S
    print(
        f"lease={lease!r} heartbeat={beat} supervisor {'not answering' if dead else 'alive'}"
    )

    runs: dict[int, dict] = {}
    for status in ("queued", "in_progress"):
        for run in api("GET", f"/actions/runs?status={status}&per_page=100")[
            "workflow_runs"
        ]:
            jobs = api(
                "GET", f"/actions/runs/{run['id']}/jobs?filter=latest&per_page=100"
            )["jobs"]
            if any(stranded(job, now, dead) for job in jobs):
                runs[run["id"]] = run

    if not runs:
        print("nothing stranded")
        return 0

    for run_id, run in runs.items():
        print(
            f"cancelling stranded run {run_id} ({run['event']} on {run['head_branch']})"
        )
        api("POST", f"/actions/runs/{run_id}/cancel")
    deadline = time.time() + 120
    pending = set(runs)
    while pending and time.time() < deadline:
        time.sleep(5)
        pending = {
            r
            for r in pending
            if api("GET", f"/actions/runs/{r}")["status"] != "completed"
        }
    for run_id in pending:
        api("POST", f"/actions/runs/{run_id}/force-cancel")

    failed = 0
    for run_id, run in runs.items():
        pr = queue_pr(run["head_branch"] or "")
        if run["event"] == "merge_group":
            print(
                f"::warning::Merge-queue run {run_id} was stranded on Bazzite and cancelled;"
                f" re-queue PR #{pr} with `gh pr merge {pr} --squash`."
            )
            continue
        try:
            api("POST", f"/actions/runs/{run_id}/rerun-failed-jobs")
            print(f"re-ran {run_id} on GitHub-hosted runners")
        except urllib.error.HTTPError as err:
            print(f"::error::re-run of {run_id} failed: HTTP {err.code}")
            failed = 1
    return failed


if __name__ == "__main__":
    sys.exit(main())
