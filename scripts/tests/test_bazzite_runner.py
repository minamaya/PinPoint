"""Policy tests for the Bazzite CI runner (PP-4k0).

The supervisor and watchdog run on Bazzite and in a scheduled workflow, so
nothing else exercises their routing and admission rules before they act on
real CI runs. These tests pin the rules that keep Bazzite from ever blocking CI:
the lease's string ordering, which runs the supervisor serves, and the routing
expression every CI job carries.
"""

from __future__ import annotations

import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
RUNNER_DIR = ROOT / "scripts" / "bazzite-runner"
CI = ROOT / ".github" / "workflows" / "ci.yml"
WATCHDOG_WORKFLOW = ROOT / ".github" / "workflows" / "bazzite-watchdog.yaml"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(
        f"bazzite_{name}", RUNNER_DIR / f"{name}.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


supervisor = _load("supervisor")
watchdog = _load("watchdog")

NOW = datetime(2026, 11, 22, 23, 0, 0, tzinfo=timezone.utc)
TS = "%Y-%m-%dT%H:%M:%SZ"


def _run(
    run_id=100,
    event="pull_request",
    branch="feat/x",
    actor="timothyfroehlich",
    trigger=None,
    head="minamaya/PinPoint",
    created="2026-11-22T22:59:00Z",
):
    return {
        "id": run_id,
        "event": event,
        "head_branch": branch,
        "head_repository": {"full_name": head},
        "actor": {"login": actor},
        "triggering_actor": {"login": trigger or actor},
        "created_at": created,
    }


def _job(labels, job_id=1, status="queued", created="2026-11-22T22:59:00Z"):
    return {
        "id": job_id,
        "labels": labels,
        "status": status,
        "created_at": created,
        "name": "job",
    }


# --- Lease ordering: ci.yml compares these as strings ----------------------


def test_accepting_lease_sorts_after_the_events_it_should_route():
    lease = supervisor.lease_value(NOW)
    assert lease == (NOW + timedelta(seconds=90)).strftime(TS)
    assert lease > NOW.strftime(TS)
    assert lease < (NOW + timedelta(minutes=2)).strftime(TS)


@pytest.mark.parametrize("idle", ["0", supervisor.busy_value(NOW)])
def test_off_and_busy_leases_route_nothing(idle):
    # Any event time GitHub can send starts with the year, so a lease starting
    # with a lower digit compares below it.
    assert not idle > "2000-01-01T00:00:00Z"
    assert not idle > NOW.strftime(TS)


# --- Which runs the supervisor serves --------------------------------------


@pytest.mark.parametrize("label_suffix", ["", "-l"])
def test_serves_tims_same_repo_pr_run_on_its_own_label(label_suffix):
    run = _run()
    assert supervisor.refusal(run, _job([f"pinpoint-run-100{label_suffix}"])) is None


@pytest.mark.parametrize(
    "queued_by", ["timothyfroehlich", "github-merge-queue[bot]", "another-maintainer"]
)
def test_serves_merge_queue_run_whoever_queued_it(queued_by):
    # ci.yml routes every merge-queue run while the lease is fresh, so refusing
    # one here would cancel it and drop its PR from the queue.
    run = _run(
        event="merge_group",
        branch="gh-readonly-queue/main/pr-2629-583ef9e",
        actor=queued_by,
    )
    assert supervisor.candidate(run)
    assert supervisor.refusal(run, _job(["pinpoint-run-100-l"])) is None


def test_serves_merge_queue_run():
    run = _run(event="merge_group", branch="gh-readonly-queue/main/pr-2629-583ef9e")
    assert supervisor.refusal(run, _job(["pinpoint-run-100-l"])) is None


@pytest.mark.parametrize(
    ("run", "labels"),
    [
        (_run(actor="dependabot[bot]"), ["pinpoint-run-100"]),
        (_run(trigger="someone-else"), ["pinpoint-run-100"]),
        (_run(head="a-fork/PinPoint"), ["pinpoint-run-100"]),
        (_run(event="push", branch="main"), ["pinpoint-run-100"]),
        (
            _run(event="merge_group", branch="feature/not-the-queue"),
            ["pinpoint-run-100"],
        ),
        (_run(), ["pinpoint-run-999"]),  # another run's label
        (_run(), ["self-hosted"]),
        (_run(), ["pinpoint-run-100", "linux"]),
    ],
)
def test_refuses_everything_else(run, labels):
    assert supervisor.refusal(run, _job(labels)) is not None


def test_heavy_label_gets_the_large_vm():
    assert supervisor.size_for("pinpoint-run-100-l") == supervisor.HEAVY
    assert supervisor.size_for("pinpoint-run-100") == supervisor.LIGHT


def test_merge_queue_jobs_are_served_before_pr_jobs():
    pr = _run(run_id=1, created="2026-11-22T22:00:00Z")
    queue = _run(
        run_id=2,
        event="merge_group",
        branch="gh-readonly-queue/main/pr-1-abc",
        created="2026-11-22T22:30:00Z",
    )
    order = supervisor.serve_order(
        [(pr, _job(["pinpoint-run-1"])), (queue, _job(["pinpoint-run-2"]))]
    )
    assert [run["id"] for run, _ in order] == [2, 1]


# --- Watchdog -------------------------------------------------------------


def test_heartbeat_reads_both_live_lease_forms_and_ignores_off():
    assert watchdog.heartbeat(supervisor.lease_value(NOW)) == NOW
    assert watchdog.heartbeat(supervisor.busy_value(NOW)) == NOW
    assert watchdog.heartbeat("0") is None
    assert watchdog.heartbeat("garbage") is None


def test_stranded_needs_a_dead_supervisor_or_a_long_wait():
    job = _job(
        ["pinpoint-run-100-l"], created=(NOW - timedelta(minutes=3)).strftime(TS)
    )
    assert watchdog.stranded(job, NOW, supervisor_dead=True)
    assert not watchdog.stranded(job, NOW, supervisor_dead=False)
    old = _job(["pinpoint-run-100"], created=(NOW - timedelta(minutes=31)).strftime(TS))
    assert watchdog.stranded(old, NOW, supervisor_dead=False)
    hosted = _job(["ubuntu-latest"], created=(NOW - timedelta(hours=1)).strftime(TS))
    assert not watchdog.stranded(hosted, NOW, supervisor_dead=True)


def test_queue_pr_number_from_merge_queue_branch():
    assert (
        watchdog.queue_pr("gh-readonly-queue/main/pr-2629-583ef9eba2c00fef") == "2629"
    )
    assert watchdog.queue_pr("feature/x") is None


# --- Workflows ------------------------------------------------------------


def _ci_jobs():
    return yaml.safe_load(CI.read_text())["jobs"]


HEAVY_JOBS = {"static", "test-integration", "test-e2e-smoke", "test-e2e-full-chromium"}
LIGHT_JOBS = {"changes", "linters", "ci-gate"}


@pytest.mark.parametrize("job", sorted(HEAVY_JOBS | LIGHT_JOBS))
def test_ci_job_routes_by_lease_and_fails_over(job):
    runs_on = " ".join(_ci_jobs()[job]["runs-on"].split())
    assert runs_on.startswith("${{ github.run_attempt == 1 "), (
        "re-runs must go to ubuntu-latest"
    )
    assert (
        "vars.BAZZITE_LEASE > github.event.merge_group.head_commit.timestamp" in runs_on
    )
    assert "vars.BAZZITE_PR_LEASE > github.event.pull_request.updated_at" in runs_on
    # The PR branch must apply the supervisor's actor check, or the supervisor
    # cancels a run ci.yml sent it.
    assert "github.actor == 'timothyfroehlich'" in runs_on
    assert "github.triggering_actor == 'timothyfroehlich'" in runs_on
    # The lease is UTC; an offset event time would compare wrongly as a string.
    assert "endsWith(github.event.merge_group.head_commit.timestamp, 'Z')" in runs_on
    assert (
        "github.event.pull_request.head.repo.full_name == github.repository" in runs_on
    )
    assert runs_on.endswith("|| 'ubuntu-latest' }}")
    label = "pinpoint-run-{0}-l" if job in HEAVY_JOBS else "pinpoint-run-{0}"
    assert f"format('{label}', github.run_id)" in runs_on


def test_every_routed_ci_job_uses_the_same_expression():
    jobs = _ci_jobs()
    shapes = {
        " ".join(jobs[name]["runs-on"].replace("{0}-l", "{0}").split())
        for name in HEAVY_JOBS | LIGHT_JOBS
    }
    assert len(shapes) == 1


def test_push_only_comprehensive_job_stays_hosted():
    assert _ci_jobs()["test-e2e-comprehensive"]["runs-on"] == "ubuntu-latest"


def test_watchdog_skips_while_bazzite_is_off_and_runs_hosted():
    job = yaml.safe_load(WATCHDOG_WORKFLOW.read_text())["jobs"]["watchdog"]
    assert "vars.BAZZITE_LEASE != '0'" in job["if"]
    assert job["runs-on"] == "ubuntu-latest"
