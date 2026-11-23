#!/usr/bin/env bash
# ci-runner.sh — switch the Bazzite CI runner from the Mac (PP-4k0).
#
#   ci-runner on          start taking CI runs (merge queue first)
#   ci-runner off         stop taking new runs, finish the ones already there, then stop
#   ci-runner off --now   stop at once: cancel its runs, re-run PR runs on GitHub-hosted
#                         runners; an in-flight merge-queue PR leaves the queue
#   ci-runner prs on|off  take Tim's own PR runs when Bazzite is otherwise idle (default on)
#   ci-runner status      leases, service state, recent log
#   ci-runner deploy      copy this directory to Bazzite and install the supervisor
#                         (takes effect at the next ci-runner on)
#   ci-runner image       rebuild the runner VM image on Bazzite
#
# Off never blocks CI: as soon as the lease is withdrawn, new runs go to
# ubuntu-latest. See scripts/bazzite-runner/README.md.
set -euo pipefail

repo=minamaya/PinPoint
host=${BAZZITE_HOST:-bazzite}

case "${1:-status}" in
  on)
    ssh "$host" 'rm -f /etc/ghrunner/app/drain && systemctl start gh-runner.service'
    echo "Bazzite runner on."
    ;;
  off)
    if [ "${2:-}" = "--now" ]; then
      ssh "$host" 'systemctl stop gh-runner.service'
      echo "Bazzite runner stopped."
      exit 0
    fi
    ssh "$host" 'touch /etc/ghrunner/app/drain'
    echo "Draining: no new runs; finishing the ones already on Bazzite (up to 20 min)."
    echo "Ctrl-C leaves it draining in the background; 'ci-runner off --now' stops at once."
    ssh "$host" 'while systemctl is-active --quiet gh-runner.service; do sleep 5; done'
    echo "Bazzite runner off."
    ;;
  prs)
    case "${2:-}" in
      on) ssh "$host" 'rm -f /etc/ghrunner/app/prs-off' ;;
      off) ssh "$host" 'touch /etc/ghrunner/app/prs-off' ;;
      *) echo "usage: ci-runner prs on|off" >&2; exit 2 ;;
    esac
    echo "PR runs on Bazzite: $2"
    ;;
  deploy)
    here="$(cd "$(dirname "$0")" && pwd)"
    ssh "$host" 'mkdir -p ~/gh-runner/host'
    scp -q "$here"/* "$host:gh-runner/host/"
    if ssh "$host" 'test -w /etc/ghrunner/app'; then
      scp -q "$here/supervisor.py" "$host:/etc/ghrunner/app/supervisor.py"
    else
      echo "Not installed yet: ssh -t bazzite-lan 'sudo bash ~/gh-runner/host/install.sh'"
      exit 0
    fi
    echo "Deployed. Restart to load it: ci-runner off && ci-runner on"
    echo "Unit, firewall or polkit changes also need: ssh -t bazzite-lan 'sudo bash ~/gh-runner/host/install.sh'"
    ;;
  image)
    here="$(cd "$(dirname "$0")" && pwd)"
    playwright=$(sed -n 's/.*@playwright\/test@\([0-9][0-9.]*\)).*/\1/p' "$here/../../pnpm-lock.yaml" | head -1)
    # shellcheck disable=SC2029 # the version is read here, on the Mac, on purpose
    ssh "$host" "bash ~/gh-runner/host/build-golden.sh $playwright"
    ;;
  status)
    printf 'merge-queue lease: %s\n' "$(gh variable get BAZZITE_LEASE --repo "$repo" 2>/dev/null || echo unset)"
    printf 'PR lease: %s\n' "$(gh variable get BAZZITE_PR_LEASE --repo "$repo" 2>/dev/null || echo unset)"
    ssh "$host" 'printf "service: %s\n" "$(systemctl is-active gh-runner.service)";
      journalctl -u gh-runner.service -n 8 --no-pager -o cat 2>/dev/null'
    ;;
  *)
    sed -n '2,16p' "$0" >&2
    exit 2
    ;;
esac
