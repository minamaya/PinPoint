# Bazzite CI runner

PinPoint's CI can run on Tim's Bazzite desktop in throwaway KVM virtual machines, alongside GitHub's hosted runners (PP-4k0). It exists to take load off the 20-job concurrency cap on GitHub-hosted runners, the merge queue first. Bazzite is also Tim's gaming PC, so it is off unless he turns it on, and it never blocks CI: anything it cannot take goes to `ubuntu-latest`.

## How a run reaches Bazzite

Every routed job in `.github/workflows/ci.yml` picks its runner with one expression:

- A **merge-queue** run goes to Bazzite when the repository variable `BAZZITE_LEASE` is later than the merge-group commit's time.
- One of **Tim's same-repo PR runs** goes to Bazzite when `BAZZITE_PR_LEASE` is later than the PR's update time.
- Anything else (forks, other authors, pushes, schedules) and **every re-run** goes to `ubuntu-latest`.

The supervisor on Bazzite rewrites each lease every 30 seconds with a time 90 seconds ahead, while it has room. If Bazzite crashes, reboots, loses its network, or is switched off, the lease lapses and new runs go to GitHub within 90 seconds.

A routed job asks for the label `pinpoint-run-<run id>`; the build, integration and E2E jobs add `-l` and get a 4 vCPU / 8 GB VM instead of 2 vCPU / 3 GB. The supervisor registers each VM as a just-in-time runner carrying only that label, so a VM can take only its own run's jobs.

Room: up to two runs at once (`GH_RUNNER_MAX_RUNS`), of which at most one is a PR run (`GH_RUNNER_PR_RUNS`), so a PR run never takes the merge queue's place. Merge-queue jobs start first.

### Lease values

| Value       | Meaning                                             | Routes runs?                     |
| ----------- | --------------------------------------------------- | -------------------------------- |
| `2026-…Z`   | accepting until that time                           | yes, runs that started before it |
| `1-2026-…Z` | alive but full or draining; the time is a heartbeat | no                               |
| `0`         | off                                                 | no                               |

The comparisons are string comparisons in the workflow expression. The off and busy forms start with a digit below `2`, so they sort below every timestamp.

### When Bazzite dies mid-run

Jobs already running on a dead VM are failed by GitHub when the runner stops reporting. Jobs of a routed run that had not started yet would wait, so `.github/workflows/bazzite-watchdog.yaml` runs every five minutes on GitHub's runners while the lease is not `0`. When the heartbeat is more than three minutes old, `watchdog.py` cancels those runs. It re-runs PR runs (re-runs go to `ubuntu-latest`) and names any merge-queue PR that has to be re-queued with `gh pr merge <PR> --squash`.

## Security

- **Each job gets a fresh VM**: a copy-on-write overlay of a read-only image, deleted after the job. Nothing a job leaves behind reaches the next one.
- **VMs cannot reach the LAN, the tailnet, or Bazzite itself.** Their traffic leaves through `passt` running as the `ghrunner` user, and `ghrunner-egress.nft` rejects private, tailnet, loopback, link-local and IPv6 destinations for that user. Every reject sits behind a `meta skuid` match, so packets the kernel sends without a socket (TCP resets, ICMP errors, neighbour discovery) are never touched.
- **No credential enters a VM.** The token lives in `/etc/ghrunner/token` (root only) and reaches the supervisor through systemd's `LoadCredential`. A VM gets only its one-job JIT config.
- **The supervisor serves only allowed runs.** It cancels any queued job that asks for a self-hosted or `pinpoint-run-` label from a run it does not serve, since a PR can edit its own workflow's `runs-on`.

The token is a fine-grained PAT owned by minamaya, scoped to PinPoint, with Actions and Variables read/write and the organization's Self-hosted runners read/write. The org's Default runner group allows public repositories.

## Operating it (from the Mac)

```bash
bash scripts/bazzite-runner/ci-runner.sh on            # start taking runs
bash scripts/bazzite-runner/ci-runner.sh off           # take no new runs, finish the ones there, stop
bash scripts/bazzite-runner/ci-runner.sh off --now     # stop at once; queued merge-queue PRs leave the queue
bash scripts/bazzite-runner/ci-runner.sh prs on|off    # whether Tim's PR runs may use idle capacity
bash scripts/bazzite-runner/ci-runner.sh status
bash scripts/bazzite-runner/ci-runner.sh deploy        # copy this directory to Bazzite, install the supervisor
bash scripts/bazzite-runner/ci-runner.sh image         # rebuild the VM image
```

`off` withdraws both leases at once, so new runs go to GitHub immediately; draining only finishes what is already on Bazzite (up to 20 minutes). Rebuild the image when Playwright moves or every few weeks: just-in-time runners cannot update themselves, and GitHub stops sending jobs to runner releases that are too old.

## Files

| File                                                             | Where it lives on Bazzite                            | Owner                    |
| ---------------------------------------------------------------- | ---------------------------------------------------- | ------------------------ |
| `supervisor.py`                                                  | `/etc/ghrunner/app/supervisor.py` (env in `app/env`) | froeht; runs as ghrunner |
| `gh-runner.service`, `ghrunner-egress.service`                   | `/etc/systemd/system/`                               | root                     |
| `ghrunner-egress.nft`                                            | `/etc/ghrunner/`                                     | root                     |
| `50-gh-runner.rules` (polkit: froeht may start/stop the service) | `/etc/polkit-1/rules.d/`                             | root                     |
| `install.sh`                                                     | run once with sudo; idempotent                       |                          |
| `build-golden.sh`, `golden-user-data.yaml.tmpl`                  | build `/var/lib/ghrunner-images/golden.qcow2`        | froeht                   |
| `watchdog.py`                                                    | runs in `bazzite-watchdog.yaml` on GitHub            |                          |
| `ci-runner.sh`                                                   | the Mac (`bash scripts/bazzite-runner/ci-runner.sh`) |                          |

QEMU and xorriso come from Homebrew, so nothing is layered onto the Bazzite image. Setup from scratch: `ci-runner deploy`, then `ssh -t bazzite-lan 'sudo bash ~/gh-runner/host/install.sh'` (it asks for the token), then `ci-runner image`, then `ci-runner on`.
