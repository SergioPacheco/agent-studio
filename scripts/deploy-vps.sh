#!/usr/bin/env bash
set -euo pipefail
: "${VPS_HOST:?Configure VPS_HOST}"
: "${VPS_USER:?Configure VPS_USER}"
: "${VPS_PATH:?Configure VPS_PATH}"
: "${VPS_SSH_KEY:?Configure VPS_SSH_KEY}"
: "${VPS_KNOWN_HOSTS:?Configure VPS_KNOWN_HOSTS verificado}"
[[ "$VPS_HOST" =~ ^[a-zA-Z0-9.-]+$ ]] || exit 2
[[ "$VPS_USER" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 2
[[ "$VPS_PATH" =~ ^/home/[a-zA-Z0-9_/-]+$ ]] || exit 2
[[ "$VPS_PATH" != *..* && "$VPS_PATH" != "/home/$VPS_USER" && "$VPS_PATH" == "/home/$VPS_USER/"* ]] || exit 2
keydir=$(mktemp -d)
trap 'rm -rf "$keydir"' EXIT
printf '%s\n' "$VPS_SSH_KEY" > "$keydir/key"
printf '%s\n' "$VPS_KNOWN_HOSTS" > "$keydir/known_hosts"
chmod 600 "$keydir/key" "$keydir/known_hosts"
ssh_options=(-i "$keydir/key" -o "UserKnownHostsFile=$keydir/known_hosts" -o StrictHostKeyChecking=yes -o BatchMode=yes)
ssh "${ssh_options[@]}" "$VPS_USER@$VPS_HOST" "mkdir -p '$VPS_PATH'"
rsync -az --delete --exclude='.git/' --exclude='node_modules/' --exclude='.env' --exclude='.studio/' --exclude='release/' -e "ssh -i $keydir/key -o UserKnownHostsFile=$keydir/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes" ./ "$VPS_USER@$VPS_HOST:$VPS_PATH/"
ssh "${ssh_options[@]}" "$VPS_USER@$VPS_HOST" "cd '$VPS_PATH' && test -f .env && systemctl --user restart agent-studio"
