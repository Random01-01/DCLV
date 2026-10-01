#!/bin/sh
set -eu
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
cd "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1 || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=11)?0:1)'; then
  printf '\nInstale o Node.js LTS pelo instalador oficial e abra este arquivo novamente.\nNenhum comando precisa ser digitado.\n'
  open 'https://nodejs.org/en/download' || true
  printf '\nPressione Enter para fechar.\n'
  read -r answer || true
  exit 1
fi
printf '\nAbrindo o assistente no navegador. Mantenha esta janela aberta durante o setup.\nSe necessário, abra http://localhost:4177\n\n'
exec node scripts/setup-ui.mjs
