#!/bin/sh
set -eu
cd "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1 || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=11)?0:1)'; then
  printf '\nInstale o Node.js 22 LTS ou mais recente pelo gerenciador de aplicativos da sua distribuição.\nDepois, abra este arquivo novamente.\n'
  if command -v xdg-open >/dev/null 2>&1; then xdg-open 'https://nodejs.org/en/download' >/dev/null 2>&1 || true; fi
  exit 1
fi
printf '\nAbrindo o assistente no navegador. Mantenha esta janela aberta durante o setup.\nSe necessário, abra http://localhost:4177\n\n'
exec node scripts/setup-ui.mjs
