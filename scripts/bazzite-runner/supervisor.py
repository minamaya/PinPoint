#!/usr/bin/env python3
"""Ephemeral KVM runners for minamaya/PinPoint on Bazzite (PP-4k0).

Runs as the unprivileged `ghrunner` user under gh-runner.service. Each queued
job that targets `pinpoint-run-<run id>` gets one fresh VM: a qcow2 overlay on
the read-only golden image, registered with a just-in-time runner config, and
deleted when the VM powers off. The registration token stays on the host.

Bazzite never blocks CI. Workflows route a run here only while the repository
variable BAZZITE_LEASE holds a timestamp later than the run's own event time.
This supervisor rewrites that lease every LEASE_EVERY_S seconds while it has
room for another run, and clears it when it is full, draining, or stopping. If
the machine dies, the lease simply expires and new runs go to ubuntu-latest;
re-runs always go to ubuntu-latest (`github.run_attempt == 1` in the routing).

Served: merge-queue runs first, then Tim's own same-repo pull_request runs
(when the workflow's BAZZITE_PRS switch routes them). A job reaches a VM only by
naming its own run's label, since JIT runners carry no other label. Any other
queued job that asks for a self-hosted or pinpoint-run label is cancelled.

Stopping:
- `touch /etc/ghrunner/app/drain` clears the lease, finishes the runs already
  here (taking their later jobs too), then exits. This is `ci-runner off`.
- SIGTERM (`systemctl stop`, `ci-runner off --now`) clears the lease, cancels
  this machine's runs, kills the VMs, and re-runs pull_request runs on
  ubuntu-latest. A cancelled merge-queue run drops its PR from the queue.
"""

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

OWNER = "minamaya"
REPO = "PinPoint"
FULL = f"{OWNER}/{REPO}"
ALLOWED_ACTOR = os.environ.get("GH_RUNNER_ALLOWED_AUTHOR", "timothyfroehlich")
SCOPE = os.environ.get("GH_RUNNER_SCOPE", "org")  # org | repo
RUNNER_GROUP_ID = int(os.environ.get("GH_RUNNER_GROUP_ID", "1"))
MAX_RUNS = int(os.environ.get("GH_RUNNER_MAX_RUNS", "2"))  # runs admitted at once
# PR runs only fill an otherwise idle machine, so a merge-queue run always has room.
PR_RUNS = int(os.environ.get("GH_RUNNER_PR_RUNS", "1"))
MAX_VMS = int(os.environ.get("GH_RUNNER_MAX_VMS", "5"))
HEAVY = ("4", os.environ.get("GH_RUNNER_HEAVY_MEM", "8G"))
LIGHT = ("2", os.environ.get("GH_RUNNER_LIGHT_MEM", "3G"))
HEAVY_SUFFIX = "-l"  # ci.yml marks the build, integration and E2E jobs with it
JOB_TIMEOUT_S = int(os.environ.get("GH_RUNNER_JOB_TIMEOUT_S", str(90 * 60)))
DRAIN_TIMEOUT_S = int(os.environ.get("GH_RUNNER_DRAIN_TIMEOUT_S", str(20 * 60)))
POLL_S = 10
FULL_SCAN_EVERY = 12  # polls; about two minutes
LEASE_EVERY_S = 30
LEASE_TTL_S = 90
LEASE_VAR = "BAZZITE_LEASE"  # merge-queue runs, and the heartbeat
PR_LEASE_VAR = "BAZZITE_PR_LEASE"  # Tim's PR runs
LABEL_PREFIX = "pinpoint-run-"
NAME_PREFIX = "bazzite-"
QUEUE_BRANCH_PREFIX = "gh-readonly-queue/main/"

STATE = Path(os.environ.get("STATE_DIRECTORY", "/var/lib/ghrunner"))
APP = Path(os.environ.get("GH_RUNNER_APP_DIR", "/etc/ghrunner/app"))
DRAIN_FLAG = APP / "drain"
PRS_OFF_FLAG = APP / "prs-off"  # ci-runner prs off
GOLDEN = Path(
    os.environ.get("GH_RUNNER_GOLDEN", "/var/lib/ghrunner-images/golden.qcow2")
)
JOBS = STATE / "jobs"
QEMU = os.environ.get(
    "GH_RUNNER_QEMU", "/home/linuxbrew/.linuxbrew/bin/qemu-system-x86_64"
)
QEMU_IMG = os.environ.get(
    "GH_RUNNER_QEMU_IMG", "/home/linuxbrew/.linuxbrew/bin/qemu-img"
)
XORRISO = os.environ.get("GH_RUNNER_XORRISO", "/home/linuxbrew/.linuxbrew/bin/xorriso")

stopping = False
vms: dict[int, dict] = {}  # job id -> {proc, dir, runner_id, run_id, started, name}
admitted: dict[int, float] = {}  # run id -> when its first VM started
last_lease: dict[str, tuple[str, float]] = {}  # variable -> (value written, when)
# Runners whose VM exited while GitHub still had a job on them: name -> {run_id, runner_id, since}
dead: dict[str, dict] = {}
rerun_when_done: set[int] = set()  # PR runs force-cancelled because a VM died mid-job
# Serial logs of VMs that exited early or mid-job. install.sh makes the directory
# ghrunner:froeht 2750, so froeht can read them over ssh without sudo.
LOG_DIR = Path(os.environ.get("GH_RUNNER_LOG_DIR", "/var/log/ghrunner"))
VM_LOGS = LOG_DIR / "vm-logs"
# A JIT config is one long base64 string; nothing on the console should carry
# one, but a copy readable by froeht must not either.
SECRET_LIKE = re.compile(rb"[A-Za-z0-9+/=_-]{120,}")
VM_LOGS_KEPT = 20
DEAD_GRACE_S = 30  # a finished job can take a few seconds to free its runner
DEAD_RETRY_S = 120  # then check again this often (each check is two API calls)
DEAD_GIVE_UP_S = 30 * 60


def log(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def token() -> str:
    cred = os.environ.get("CREDENTIALS_DIRECTORY")
    path = Path(cred) / "token" if cred else Path("/etc/ghrunner/token")
    return path.read_text().strip()


# GET responses by path, revalidated with If-None-Match. A 304 does not count
# against the rate limit, which this token shares with every gh session Tim runs.
_etags: dict[str, tuple[str, object]] = {}


def api(method: str, path: str, body: dict | None = None):
    headers = {
        "Authorization": f"Bearer {token()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "pinpoint-bazzite-runner",
    }
    cached = _etags.get(path) if method == "GET" else None
    if cached:
        headers["If-None-Match"] = cached[0]
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            data = json.loads(raw) if raw else None
            etag = resp.headers.get("ETag")
            if method == "GET" and etag:
                _etags[path] = (etag, data)
            return data
    except urllib.error.HTTPError as err:
        if err.code == 304 and cached:
            return cached[1]
        raise


def runners_path() -> str:
    return (
        f"/orgs/{OWNER}/actions/runners"
        if SCOPE == "org"
        else f"/repos/{FULL}/actions/runners"
    )


# --- Policy (pure functions; unit-tested in scripts/tests) -----------------


def lease_value(now: datetime, ttl_s: int = LEASE_TTL_S) -> str:
    """ISO-8601 UTC, second precision: compares as a string against GitHub's event times."""
    return (
        (now + timedelta(seconds=ttl_s))
        .astimezone(timezone.utc)
        .strftime("%Y-%m-%dT%H:%M:%SZ")
    )


def is_queue_run(run) -> bool:
    return run["event"] == "merge_group" and (run.get("head_branch") or "").startswith(
        QUEUE_BRANCH_PREFIX
    )


def candidate(run, actor: str = ALLOWED_ACTOR) -> bool:
    """A run that may hold jobs for this machine: a merge-queue run or Tim's own PR run."""
    if (run.get("head_repository") or {}).get("full_name") != FULL:
        return False
    if is_queue_run(run):
        return True
    return (
        run["event"] == "pull_request"
        and (run.get("actor") or {}).get("login") == actor
    )


def wants_us(job) -> bool:
    return any(
        lbl == "self-hosted" or lbl.startswith(LABEL_PREFIX) for lbl in job["labels"]
    )


def refusal(run, job, actor: str = ALLOWED_ACTOR) -> str | None:
    """None when the job may run here, else the reason it may not."""
    if not (is_queue_run(run) or run["event"] == "pull_request"):
        return f"event {run['event']} on {run.get('head_branch')}"
    head = (run.get("head_repository") or {}).get("full_name")
    if head != FULL:
        return f"head repo {head}"
    # A merge-queue run carries whoever queued it (auto-merge, another
    # maintainer); every PR in it was already approved to merge, so ci.yml routes
    # it regardless and so does this. A PR run must be Tim's, as ci.yml checks.
    if not is_queue_run(run):
        for who in ("actor", "triggering_actor"):
            login = (run.get(who) or {}).get("login")
            if login != actor:
                return f"{who} {login}"
    own = f"{LABEL_PREFIX}{run['id']}"
    if job["labels"] not in ([own], [own + HEAVY_SUFFIX]):
        return f"labels {job['labels']}"
    return None


def size_for(label: str) -> tuple[str, str]:
    """(vCPUs, memory) for a VM. A VM takes only jobs with its exact label, so
    marking heavy jobs with their own label keeps them off the small VMs."""
    return HEAVY if label.endswith(HEAVY_SUFFIX) else LIGHT


def serve_order(pairs):
    """Merge-queue jobs first, then oldest run first."""
    return sorted(
        pairs,
        key=lambda rj: (not is_queue_run(rj[0]), rj[0]["created_at"], rj[1]["id"]),
    )


# --- GitHub side ------------------------------------------------------------


def queued_jobs(full: bool):
    """Yield (run, job) for queued jobs in queued or in-progress runs.

    Candidate runs are read on every poll. Every other run is read only on a
    full scan, which looks for a job that names some other run's label.
    """
    seen = set()
    for status in ("queued", "in_progress"):
        runs = api("GET", f"/repos/{FULL}/actions/runs?status={status}&per_page=100")[
            "workflow_runs"
        ]
        for run in runs:
            if run["id"] in seen or not (full or candidate(run)):
                continue
            seen.add(run["id"])
            jobs = api(
                "GET",
                f"/repos/{FULL}/actions/runs/{run['id']}/jobs?filter=latest&per_page=100",
            )["jobs"]
            for job in jobs:
                if job["status"] == "queued":
                    yield run, job


def busy_value(now: datetime) -> str:
    """Alive but taking no new runs: sorts below every timestamp, and still carries a heartbeat."""
    return "1-" + now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def set_lease(value: str, var: str = LEASE_VAR) -> None:
    """Write a lease variable. Its forms, all comparing as strings in ci.yml:

    - "<expiry>" (an ISO timestamp): accepting; routes runs that started before it.
    - "1-<now>": alive but full or draining; routes nothing, and the watchdog
      workflow reads the time in BAZZITE_LEASE as a heartbeat.
    - "0": off; routes nothing, and the watchdog skips.
    GitHub refuses empty variables, and a word such as "none" would sort above
    every timestamp, so the off and busy forms start with a digit below "2".
    """
    stored = value or "0"
    if stored == "0" and last_lease.get(var, ("",))[0] == "0":
        return
    try:
        try:
            api(
                "PATCH",
                f"/repos/{FULL}/actions/variables/{var}",
                {"name": var, "value": stored},
            )
        except urllib.error.HTTPError as err:
            if err.code != 404:
                raise
            api(
                "POST",
                f"/repos/{FULL}/actions/variables",
                {"name": var, "value": stored},
            )
        last_lease[var] = (stored, time.time())
    except (urllib.error.URLError, OSError) as err:
        # Never fatal: an unwritten lease lapses on its own within 90 seconds.
        log(f"{var} write failed: {err}")


def clear_leases() -> None:
    set_lease("", PR_LEASE_VAR)
    set_lease("")


def cancel(run_id: int) -> None:
    try:
        api("POST", f"/repos/{FULL}/actions/runs/{run_id}/cancel")
    except (urllib.error.URLError, OSError) as err:
        log(f"cancel {run_id}: {err}")


def delete_runner(runner_id: int) -> bool:
    """True once the runner is gone. False while GitHub still has a job on it
    (HTTP 422) or when GitHub could not say (any other error)."""
    try:
        api("DELETE", f"{runners_path()}/{runner_id}")
    except urllib.error.HTTPError as err:
        if err.code == 404:  # an ephemeral runner removes itself after its job
            return True
        if err.code != 422:
            log(f"delete runner {runner_id}: HTTP {err.code}")
        return False
    except (urllib.error.URLError, OSError) as err:
        log(f"delete runner {runner_id}: {err}")
        return False
    return True


def idle_and_unneeded(vm) -> bool:
    """The VM's runner holds no job and its run has finished.

    Any VM of a run can take any of that run's jobs (they share one label), so
    the job a VM was started for says nothing about what it is running now.
    """
    try:
        busy = api("GET", f"{runners_path()}/{vm['runner_id']}")["busy"]
    except urllib.error.HTTPError as err:
        return err.code == 404  # the ephemeral runner already deregistered
    return not busy and run_completed(vm["run_id"])


def run_completed(run_id: int) -> bool:
    return api("GET", f"/repos/{FULL}/actions/runs/{run_id}")["status"] == "completed"


def completed_or_unknown(run_id: int) -> bool:
    """For shutdown: an unreachable API counts as done, so the wait cannot stall."""
    try:
        return run_completed(run_id)
    except (urllib.error.URLError, OSError):
        return True


# --- VMs --------------------------------------------------------------------


# passt sends a guest's UDP flow from the host on the same source port, and drops
# it when that port is taken (PP-itvwi): tailscaled holds 41641, and concurrent
# VMs would take each other's ports. So each VM slot gets its own slice of the
# guest's ephemeral range, and the ports the host has bound are reserved.
EPHEMERAL = (32768, 60999)  # Linux default, in the guest and on the host
TAILSCALE_PORT = 41641


def port_range(slot: int, slots: int = MAX_VMS) -> tuple[int, int]:
    span = (EPHEMERAL[1] - EPHEMERAL[0] + 1) // slots
    low = EPHEMERAL[0] + slot * span
    return low, low + span - 1


def host_udp_ports(tables=("/proc/net/udp", "/proc/net/udp6")) -> set[int]:
    """Local ports of the host's UDP sockets (the hex after the colon in column 2)."""
    ports = set()
    for table in tables:
        try:
            rows = Path(table).read_text().splitlines()[1:]
        except OSError:
            continue
        for row in rows:
            ports.add(int(row.split()[1].rsplit(":", 1)[1], 16))
    return ports


def reserved_ports(low: int, high: int, host_ports: set[int]) -> str:
    keep = sorted(p for p in host_ports | {TAILSCALE_PORT} if low <= p <= high)
    return ",".join(map(str, keep))


def free_slot() -> int:
    used = {vm["slot"] for vm in vms.values()}
    return next(i for i in range(MAX_VMS) if i not in used)


def user_data(jit: str, ports: tuple[int, int] = EPHEMERAL, reserved: str = "") -> str:
    low, high = ports
    bootcmd = f'  - [sysctl, -w, "net.ipv4.ip_local_port_range={low} {high}"]\n'
    if reserved:
        bootcmd += f'  - [sysctl, -w, "net.ipv4.ip_local_reserved_ports={reserved}"]\n'
    return f"""#cloud-config
bootcmd:
{bootcmd}write_files:
  - path: /home/runner/jit
    permissions: "0600"
    content: {jit}
runcmd:
  - [bash, -c, "chown runner:runner /home/runner/jit; cd /home/runner/actions-runner && sudo -u runner ./run.sh --jitconfig $(cat /home/runner/jit) > /dev/ttyS0 2>&1; poweroff"]
"""


def runner_name(run_id: int, job_id: int, now: float) -> str:
    """Unique per spawn: a dead VM's runner can stay registered after its job id
    is queued again, and GitHub refuses a second runner with the same name (409)."""
    return f"{NAME_PREFIX}{run_id}-{job_id}-{int(now):x}"


def spawn(run, job) -> None:
    name = runner_name(run["id"], job["id"], time.time())
    label = job["labels"][0]
    vcpus, mem = size_for(label)
    slot = free_slot()
    ports = port_range(slot)
    reserved = reserved_ports(*ports, host_udp_ports())
    resp = api(
        "POST",
        f"{runners_path()}/generate-jitconfig",
        {"name": name, "runner_group_id": RUNNER_GROUP_ID, "labels": [label]},
    )
    try:
        # The JIT config registers a runner for this repository, so only ghrunner may
        # read it: in user-data, in the seed ISO, and in the overlay once the VM boots.
        d = JOBS / str(job["id"])
        d.mkdir(mode=0o700, parents=True)
        fd = os.open(d / "user-data", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(user_data(resp["encoded_jit_config"], ports, reserved))
        (d / "meta-data").write_text(f"instance-id: {name}\nlocal-hostname: {name}\n")
        subprocess.run(
            [
                XORRISO,
                "-as",
                "mkisofs",
                "-quiet",
                "-V",
                "cidata",
                "-J",
                "-R",
                "-o",
                str(d / "seed.iso"),
                str(d / "user-data"),
                str(d / "meta-data"),
            ],
            check=True,
            capture_output=True,
        )
        (d / "user-data").unlink()  # the JIT config now lives only in the seed
        subprocess.run(
            [
                QEMU_IMG,
                "create",
                "-q",
                "-f",
                "qcow2",
                "-b",
                str(GOLDEN),
                "-F",
                "qcow2",
                str(d / "disk.qcow2"),
            ],
            check=True,
        )
        proc = subprocess.Popen(
            [
                QEMU,
                "-machine",
                "q35,accel=kvm",
                "-cpu",
                "host",
                "-smp",
                vcpus,
                "-m",
                mem,
                # The overlay is thrown away after the job, so skip host flushes.
                "-drive",
                f"file={d / 'disk.qcow2'},if=virtio,discard=unmap,cache=unsafe",
                "-drive",
                f"file={d / 'seed.iso'},media=cdrom,readonly=on",
                # No gateway mapping: the guest cannot address the host's loopback.
                # Its own address is 10.88.0.2, not a copy of the host's LAN address, so
                # the host's LAN IP is a remote address the firewall can block.
                # IPv4 only; the host firewall blocks private and tailnet ranges for ghrunner.
                "-netdev",
                "passt,id=n0,param=--no-map-gw,param=--ipv4-only,"
                "param=--address,param=10.88.0.2,param=--netmask,param=24,"
                "param=--gateway,param=10.88.0.1,param=--dns,param=1.1.1.1",
                "-device",
                "virtio-net-pci,netdev=n0",
                "-display",
                "none",
                "-serial",
                f"file:{d / 'serial.log'}",
                "-no-reboot",
            ],
            stdout=subprocess.DEVNULL,
            stderr=open(d / "qemu.log", "w"),
        )
    except Exception:
        # Leave nothing registered or on disk for a VM that never started.
        # delete_runner catches its own errors, so the original one is re-raised.
        delete_runner(resp["runner"]["id"])
        shutil.rmtree(JOBS / str(job["id"]), ignore_errors=True)
        raise
    vms[job["id"]] = {
        "proc": proc,
        "dir": d,
        "runner_id": resp["runner"]["id"],
        "run_id": run["id"],
        "started": time.time(),
        "name": name,
        "slot": slot,
    }
    admitted.setdefault(run["id"], time.time())
    log(f"spawned {name} ({vcpus} vCPU/{mem}) for {run['head_branch']} / {job['name']}")


def reap(force: bool = False) -> None:
    for job_id, vm in list(vms.items()):
        expired = time.time() - vm["started"] > JOB_TIMEOUT_S
        # A run cancelled before this VM picked up a job (a newer push superseded
        # it) leaves the JIT runner waiting forever; free the slot.
        orphaned = (
            not force
            and vm["proc"].poll() is None
            and time.time() - vm["started"] > 60
            and idle_and_unneeded(vm)
        )
        if force or expired or orphaned:
            vm["proc"].kill()
        if vm["proc"].poll() is None:
            continue
        vm["proc"].wait()
        freed = delete_runner(vm["runner_id"])
        lived = time.time() - vm["started"]
        # A timeout kill with its job still assigned leaves the job stuck like a
        # crash does, so it is recovered too. An orphan kill needs an idle runner,
        # and a forced kill is shutdown_now's, which cancels the runs itself.
        if not freed and not (force or orphaned):
            # GitHub still has a job on this runner, which no VM is running now.
            dead[vm["name"]] = {
                "run_id": vm["run_id"],
                "runner_id": vm["runner_id"],
                "since": time.time(),
                "next": time.time() + DEAD_GRACE_S,
            }
        if not freed or lived < 120:
            keep_serial_log(vm)
        shutil.rmtree(vm["dir"], ignore_errors=True)
        del vms[job_id]
        why = (
            " (timeout)"
            if expired
            else " (job finished elsewhere)"
            if orphaned
            else f" (exited after {lived:.0f}s with a job still assigned)"
            if not freed
            else ""
        )
        log(f"reaped {vm['name']}{why}")


def keep_serial_log(vm) -> None:
    """Keep the console of a VM that died early or mid-job; its directory is deleted."""
    try:
        if not VM_LOGS.is_dir():
            VM_LOGS.mkdir()
            VM_LOGS.chmod(0o2750)  # the umask is 077; froeht's group reads these
        text = SECRET_LIKE.sub(b"[redacted]", (vm["dir"] / "serial.log").read_bytes())
        dest = VM_LOGS / f"{vm['name']}.log"
        fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o640)
        with os.fdopen(fd, "wb") as f:
            os.fchmod(f.fileno(), 0o640)
            f.write(text)
        for old in sorted(VM_LOGS.iterdir(), key=lambda p: p.stat().st_mtime)[
            :-VM_LOGS_KEPT
        ]:
            old.unlink()
    except OSError as err:
        log(f"keeping serial log of {vm['name']}: {err}")


def stuck_on(job_list, name: str) -> bool:
    """A job of the run is still in progress on a runner whose VM is gone."""
    return any(
        j["status"] == "in_progress" and j.get("runner_name") == name for j in job_list
    )


def recover_dead() -> None:
    """Cancel a run whose job is stuck on a dead VM, and re-run it if it is a PR run.

    GitHub waits a long time before failing a job whose runner vanished, and a
    merge-queue run cannot pass with one, so cancelling only frees the queue
    sooner. The re-run goes to ubuntu-latest (ci.yml routes re-runs there).
    """
    now = time.time()
    for name, info in list(dead.items()):
        if now < info["next"]:
            continue
        info["next"] = now + DEAD_RETRY_S
        if now - info["since"] > DEAD_GIVE_UP_S:
            log(f"{name}: GitHub never released its runner; giving up on it")
            del dead[name]
            continue
        try:
            recover_one(name, info)
        except Exception as err:  # noqa: BLE001 - retried after DEAD_RETRY_S
            log(f"recovering {name}: {err}")
    for run_id in list(rerun_when_done):
        try:
            if not run_completed(run_id):
                continue
            api("POST", f"/repos/{FULL}/actions/runs/{run_id}/rerun-failed-jobs")
            log(f"re-ran {run_id} on GitHub-hosted runners")
        except urllib.error.HTTPError as err:
            if err.code >= 500 or err.code == 429:
                log(f"re-run {run_id}: HTTP {err.code}; retrying")
                continue
            # 403/422: GitHub will not re-run it; retrying would never succeed.
            log(f"re-run {run_id}: HTTP {err.code}; giving up on it")
        except (urllib.error.URLError, OSError) as err:
            log(f"re-run {run_id}: {err}")
            continue
        rerun_when_done.discard(run_id)


def recover_one(name: str, info: dict) -> None:
    run_id = info["run_id"]
    if delete_runner(info["runner_id"]):
        del dead[name]  # GitHub released it: the job had finished after all
        return
    jobs = api("GET", f"/repos/{FULL}/actions/runs/{run_id}/jobs?per_page=100")
    if not stuck_on(jobs["jobs"], name):
        return  # not yet released; retried later
    run = api("GET", f"/repos/{FULL}/actions/runs/{run_id}")
    api("POST", f"/repos/{FULL}/actions/runs/{run_id}/force-cancel")
    if is_queue_run(run):
        log(
            f"{name} died mid-job; force-cancelled merge-queue run {run_id}, its PR left the queue"
        )
    else:
        log(
            f"{name} died mid-job; force-cancelled run {run_id}, re-running it on GitHub"
        )
        rerun_when_done.add(run_id)


def forget_finished_runs() -> None:
    live = {vm["run_id"] for vm in vms.values()}
    for run_id in list(admitted):
        if (
            run_id not in live
            and time.time() - admitted[run_id] > 60
            and run_completed(run_id)
        ):
            del admitted[run_id]


def cleanup_stale() -> None:
    """Remove VMs and offline runners left by a previous supervisor."""
    shutil.rmtree(JOBS, ignore_errors=True)
    JOBS.mkdir(mode=0o700, parents=True)
    for runner in api("GET", f"{runners_path()}?per_page=100")["runners"]:
        if runner["name"].startswith(NAME_PREFIX) and not runner["busy"]:
            delete_runner(runner["id"])


# --- Main loop --------------------------------------------------------------


def serve_once(full: bool) -> list:
    """One poll: refuse what is not ours, start VMs for what is. Returns our queued jobs.

    Admission is the lease's job, not this one's: a job that names this
    machine's label was routed here and cannot move, so it is always served,
    draining or not, as soon as a VM is free.
    """
    queued = list(queued_jobs(full))
    ours = []
    for run, job in queued:
        if not wants_us(job) or job["id"] in vms:
            continue
        reason = refusal(run, job)
        if reason:
            log(f"cancelling run {run['id']} ({run['head_branch']}): {reason}")
            cancel(run["id"])
        else:
            ours.append((run, job))
    for run, job in serve_order(ours):
        if len(vms) >= MAX_VMS:
            break
        try:
            spawn(run, job)
        except Exception as err:  # noqa: BLE001 - one job's failure must not stop the rest
            log(f"spawn for run {run['id']} / {job['name']} failed: {err}")
    return ours


def renew_leases(draining: bool) -> None:
    """Merge-queue lease while fewer than MAX_RUNS runs are here; PR lease only
    while fewer than PR_RUNS are, so PR runs never take the merge queue's room."""
    now = datetime.now(timezone.utc)
    queue_room = not draining and len(admitted) < MAX_RUNS
    pr_room = not draining and not PRS_OFF_FLAG.exists() and len(admitted) < PR_RUNS
    for var, room, idle in (
        (LEASE_VAR, queue_room, busy_value(now)),
        (PR_LEASE_VAR, pr_room, "0"),
    ):
        value, when = last_lease.get(var, ("", 0.0))
        accepting = value[:1] == "2"
        stale = time.time() - when >= LEASE_EVERY_S
        if room != accepting or (room and stale) or (var == LEASE_VAR and stale):
            set_lease(lease_value(now) if room else idle, var)


def shutdown_now() -> None:
    """Cancel our runs, kill the VMs, then re-run pull_request runs on ubuntu-latest.

    Cancelling before killing lets each VM's runner report its job cancelled.
    A VM killed first leaves its job hanging until GitHub gives up on the runner.
    """
    set_lease("", PR_LEASE_VAR)
    set_lease(busy_value(datetime.now(timezone.utc)))
    runs = {vm["run_id"]: None for vm in vms.values()}
    try:
        for run, job in queued_jobs(full=True):
            if refusal(run, job) is None:
                runs[run["id"]] = run
    except Exception as err:  # noqa: BLE001 - shutdown must finish
        log(f"listing queued jobs on shutdown: {err}")
    for run_id in runs:
        cancel(run_id)
    deadline = time.time() + 75
    pending = set(runs)
    while pending and time.time() < deadline:
        pending = {r for r in pending if not completed_or_unknown(r)}
        if pending:
            time.sleep(3)
    reap(force=True)
    # Shutdown must reach the end even with GitHub unreachable: each step below
    # is best effort, and the watchdog workflow recovers anything left over.
    for run_id in pending:
        try:
            api("POST", f"/repos/{FULL}/actions/runs/{run_id}/force-cancel")
        except (urllib.error.URLError, OSError) as err:
            log(f"force-cancel {run_id}: {err}")
    for run_id in runs:
        try:
            run = runs[run_id] or api("GET", f"/repos/{FULL}/actions/runs/{run_id}")
            if is_queue_run(run):
                log(f"cancelled merge-queue run {run_id}; its PR left the queue")
                continue
            api("POST", f"/repos/{FULL}/actions/runs/{run_id}/rerun-failed-jobs")
            log(f"re-ran {run_id} on GitHub-hosted runners")
        except (urllib.error.URLError, OSError) as err:
            log(f"rerun {run_id}: {err}")


def on_term(*_):
    global stopping
    stopping = True


def main() -> int:
    os.umask(0o077)  # seed ISOs, overlays and logs too; the unit sets UMask= as well
    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)
    if not GOLDEN.exists():
        log(f"missing {GOLDEN}")
        return 1
    if DRAIN_FLAG.exists():
        log(f"{DRAIN_FLAG} is present; remove it to start (ci-runner on does)")
        return 1
    cleanup_stale()
    log(
        f"serving {FULL}: merge queue up to {MAX_RUNS} runs, {ALLOWED_ACTOR}'s PRs up to {PR_RUNS},"
        f" {MAX_VMS} VMs max"
    )
    tick = 0
    drain_started = 0.0
    while not stopping:
        draining = DRAIN_FLAG.exists()
        if draining and not drain_started:
            drain_started = time.time()
            set_lease("", PR_LEASE_VAR)
            set_lease(busy_value(datetime.now(timezone.utc)))
            log("draining: finishing the runs already here")
        try:
            recover_dead()
        except Exception as err:  # noqa: BLE001 - retried next poll; serving goes on
            log(f"recovering dead runners: {err}")
        try:
            reap()
            forget_finished_runs()
            renew_leases(draining)
            ours = serve_once(full=tick % FULL_SCAN_EVERY == 0)
            tick += 1
            # Admitted runs stay until GitHub marks them completed, so a run whose
            # next job is not queued yet still holds the drain open.
            if draining and not vms and not admitted and not ours:
                log("drained")
                break
            if draining and time.time() - drain_started > DRAIN_TIMEOUT_S:
                log("drain timed out")
                shutdown_now()
                break
        except Exception as err:  # noqa: BLE001 - keep serving through API hiccups
            log(f"loop error: {err}")
        for _ in range(POLL_S):
            if stopping:
                break
            time.sleep(1)
    if stopping:
        shutdown_now()
    clear_leases()
    log("stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
