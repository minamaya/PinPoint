#!/usr/bin/env bash
# Privileged setup for the Bazzite GitHub runner (PP-4k0). Idempotent.
# Copy this directory to Bazzite (`ci-runner deploy`), then run from a real
# terminal: ssh -t bazzite-lan "sudo bash ~/gh-runner/host/install.sh"
#
# Root owns the parts that protect the host: the ghrunner user, the egress
# fence, the systemd units, the polkit rule, and the token. froeht owns what is
# safe to iterate on without sudo: the supervisor, its env file, and the golden
# image. The supervisor runs as ghrunner, so editing it cannot lift the fence.
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)"

id ghrunner >/dev/null 2>&1 || useradd --system --home-dir /var/lib/ghrunner \
  --no-create-home --shell /usr/sbin/nologin ghrunner

install -d -m 0751 -o root -g ghrunner /etc/ghrunner
install -m 0644 "$src/ghrunner-egress.nft" /etc/ghrunner/ghrunner-egress.nft
install -d -m 2750 -o froeht -g ghrunner /etc/ghrunner/app
install -m 0640 -o froeht -g ghrunner "$src/supervisor.py" /etc/ghrunner/app/supervisor.py
[ -f /etc/ghrunner/app/env ] || install -m 0640 -o froeht -g ghrunner /dev/null /etc/ghrunner/app/env
install -m 0644 "$src/ghrunner-egress.service" /etc/systemd/system/
install -m 0644 "$src/gh-runner.service" /etc/systemd/system/
install -m 0644 "$src/50-gh-runner.rules" /etc/polkit-1/rules.d/

install -d -m 0750 -o ghrunner -g ghrunner /var/lib/ghrunner
# build-golden.sh, run as froeht, writes the VM image here.
install -d -m 0755 -o froeht -g froeht /var/lib/ghrunner-images

systemctl daemon-reload
systemctl enable ghrunner-egress.service
systemctl restart ghrunner-egress.service
nft list table inet ghrunner_egress >/dev/null && echo "egress fence loaded"

if [ ! -s /etc/ghrunner/token ]; then
  echo "Paste the fine-grained token (input hidden), then Enter:"
  read -rs tok
  (umask 077 && printf "%s" "$tok" > /etc/ghrunner/token)
  echo "token saved to /etc/ghrunner/token (root only)"
fi
echo "done. Build the VM image as froeht (build-golden.sh), then: ci-runner on"
