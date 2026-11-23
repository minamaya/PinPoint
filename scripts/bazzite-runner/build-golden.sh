#!/usr/bin/env bash
# Build the Bazzite runner's VM image and install it for new VMs (PP-4k0).
#
# Run on Bazzite as froeht:  build-golden.sh <playwright-version> [runner-version]
# From the Mac, `ci-runner image` runs it with the lockfile's Playwright version.
#
# Rebuild when Playwright or Ubuntu 26.04 moves, and at least every few weeks:
# JIT runners cannot update themselves, and GitHub stops sending jobs to a
# runner release that is too old. VMs already running keep the image they
# started from; only new VMs use the new one.
set -euo pipefail

playwright=${1:?usage: build-golden.sh <playwright-version> [runner-version]}
runner=${2:-$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name)}
runner=${runner#v}
here="$(cd "$(dirname "$0")" && pwd)"
work="${GH_RUNNER_BUILD_DIR:-$HOME/gh-runner/build}"
dest=/var/lib/ghrunner-images/golden.qcow2
base_url=https://cloud-images.ubuntu.com/resolute/current
base=resolute-server-cloudimg-amd64.img
qemu=/home/linuxbrew/.linuxbrew/bin

mkdir -p "$work"
cd "$work"
curl -fsSLO "$base_url/$base"
curl -fsSL "$base_url/SHA256SUMS" | grep " \*$base\$" | sha256sum -c -

sed -e "s/@RUNNER_VERSION@/$runner/g" -e "s/@PLAYWRIGHT_VERSION@/$playwright/g" \
  "$here/golden-user-data.yaml.tmpl" > user-data
printf 'instance-id: golden-%s\nlocal-hostname: pinpoint-runner\n' "$(date +%s)" > meta-data
"$qemu/xorriso" -as mkisofs -quiet -V cidata -J -R -o seed.iso user-data meta-data 2>/dev/null

rm -f golden.new.qcow2
"$qemu/qemu-img" convert -O qcow2 "$base" golden.new.qcow2
"$qemu/qemu-img" resize -q golden.new.qcow2 60G
echo "building: runner $runner, Playwright $playwright"
timeout 1800 "$qemu/qemu-system-x86_64" -machine q35,accel=kvm -cpu host -smp 4 -m 8G \
  -drive file=golden.new.qcow2,if=virtio,discard=unmap \
  -drive file=seed.iso,media=cdrom,readonly=on \
  -netdev user,id=n0 -device virtio-net-pci,netdev=n0 \
  -display none -serial file:build.log -no-reboot

if ! tr -d '\r' < build.log | grep -aq 'GOLDEN-42-OK'; then
  echo "build failed: see $work/build.log" >&2
  exit 1
fi
cp golden.new.qcow2 "$dest.new"
mv -f "$dest.new" "$dest"
echo "installed $dest (runner $runner, Playwright $playwright)"
