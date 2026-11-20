#!/usr/bin/env bash
# Source me from the G04 worktree root:   source scripts/guard-g04-env.sh
# Exports PROCESS REFERENCES only (paths to private files created by the provisioning helpers). No secret value is printed or stored here.
# Needs: .env.local (GitHub App + GITHUB_APP_WEBHOOK_SECRET, git-ignored) and .local/g04-root4.txt (written by scripts/guard-g04-requalify.mjs).
export GUARD_LOCAL_ENV=g04
eval "$(node --conditions=react-server --import tsx scripts/guard-g02-local-env.ts env)"   # GUARD_DB_{APP,WORKER}_{APPROVAL,PASSWORD}_FILE
ROOT="$(cat .local/g04-root4.txt)"
export GUARD_PRODUCT_CONFIG_FILE="$ROOT/product.runtime.json" GUARD_PRODUCT_ENABLED=1 GUARD_G04_ENABLED=1
export G02_INSTALL_DOCKER="${G02_INSTALL_DOCKER:-C:/Users/sheil/AppData/Local/Programs/DockerDesktop/resources/bin/docker}"
# GITHUB_APP_WEBHOOK_SECRET must come from .env.local (Next and the dispatcher load it); never export a different one here.
unset GITHUB_APP_WEBHOOK_SECRET
