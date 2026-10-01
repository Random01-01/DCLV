# PrivateStream Bridge

**Streaming de tela auto-hospedado, autenticado pelo Discord e transportado por WebRTC relay-only.**

O host executa o stack completo na própria máquina. O Discord funciona como a camada de autorização e distribuição de links temporários; nenhum vídeo passa pelo canal de voz do Discord.

> **Estado do projeto:** MVP funcional para uso em LAN/VPN e base de produção para internet. A mídia é peer-to-peer entre o host e cada viewer, mas sempre negociada através de TURN. A qualidade final depende do navegador, GPU, CPU, upload do host e configuração de NAT.

## O que este repositório entrega

- Monorepo TypeScript com `apps/bot`, `apps/backend`, `apps/web` e `packages/shared`.
- Discord slash commands: `/iniciar-stream`, `/entrar-stream`, `/encerrar-stream` e `/status-stream`.
- Sala efêmera por servidor, token assinado com HMAC, expiração de 10 minutos e consumo único.
- Sinalização WebSocket sem persistir tokens, Discord IDs ou candidatos ICE em logs.
- `iceTransportPolicy: "relay"` no navegador e rejeição no servidor de candidatos `host`, `srflx` e `prflx`.
- TURN com credenciais temporárias compatíveis com `use-auth-secret` do Coturn.
- Captura `getDisplayMedia` com foco em movimento, presets 1080p60/30 e 720p60/30, bitrate limitado no `RTCRtpSender` e preferência H.264/VP9/VP8.
- Áudio estéreo sem processamento de voz e teto de 128 kbps no sender Opus.
- Painel de resolução, FPS, bitrate, perda e estado do relay.
- Docker Compose com bot, backend, web, Coturn e perfil opcional de Cloudflare Tunnel.
- Testes Vitest de relay-only SDP, expiração/uso único e higiene de payload público.

## Aviso importante: “custo zero” não significa banda zero

O host paga com a **banda de upload da sua própria conexão**. No preset 1080p60, reserve aproximadamente:

| Viewers simultâneos | Upload aproximado do host |
| ---: | ---: |
| 1 | 8 Mbps |
| 3 | 24 Mbps |
| 5 | 40 Mbps |

Há overhead de WebRTC/TURN, ACKs e variação de bitrate. Deixe margem de 20–30% e meça a conexão. Um upload residencial de 20 Mbps não deve tentar atender três viewers em 1080p60. O modo 720p30 reduz bastante o consumo.

A conexão TURN relay-only também faz o tráfego de mídia passar pelo Coturn. Quando o Coturn está na máquina do host, cada viewer consome upload e download do host (o viewer recebe o stream). Uma VPS gratuita ou um relay remoto pode mudar o gargalo, mas **não elimina custos, limites, termos de uso ou necessidade de configuração**. Verifique as cotas atuais do provedor antes de contar com qualquer oferta gratuita.

## Instalação pelo GitHub

### Pré-requisitos

- Git 2.40+
- Docker Engine 24+ e Docker Compose v2
- Conta e aplicação no [Discord Developer Portal](https://discord.com/developers/applications)
- Navegador Chromium/Firefox/Safari atualizado com `getDisplayMedia`
- Para 1080p60: GPU/aceleração de hardware habilitada no navegador e upload suficiente

### 1. Baixe o código

Substitua a URL abaixo por um fork da sua organização se necessário:

```bash
git clone https://github.com/Random01-01/DCLV.git private-stream-bridge
cd private-stream-bridge
git checkout arena/01a0f959-dclv   # ou a tag/release escolhida
```

Para acompanhar atualizações:

```bash
git fetch origin
git pull --ff-only origin main
```

### 2. Crie o bot do Discord

1. No Developer Portal, crie uma Application e copie **Application ID**.
2. Em **Bot**, crie o bot e copie o token uma única vez.
3. Em **OAuth2 → URL Generator**, selecione scopes `bot` e `applications.commands`.
4. Conceda apenas as permissões necessárias: `View Channels`, `Send Messages`, `Use Slash Commands` e `Embed Links`.
5. Instale o bot no servidor de teste.
6. Copie o ID do servidor com o modo desenvolvedor do Discord ativo. Definir `DISCORD_GUILD_ID` faz os comandos aparecerem rapidamente; vazio registra comandos globais.

### 3. Configure segredos e endereço

```bash
cp .env.example .env
openssl rand -hex 32   # use um valor para HMAC_SECRET
openssl rand -hex 32   # outro para INTERNAL_API_SECRET
openssl rand -hex 32   # outro para TURN_SECRET
$EDITOR .env
```

Preencha, no mínimo:

```dotenv
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
INTERNAL_API_SECRET=...
HMAC_SECRET=...
TURN_SECRET=...
PUBLIC_WEB_URL=http://IP_DA_MAQUINA:8080
PUBLIC_TURN_HOST=IP_DA_MAQUINA
```

- Em teste na mesma LAN, `PUBLIC_WEB_URL` e `PUBLIC_TURN_HOST` podem usar o IP privado do host, por exemplo `192.168.1.20`.
- Não use `localhost` no link que será aberto por outro computador: `localhost` aponta para o computador do viewer.
- Para internet, use um DNS/IP público alcançável e configure `PUBLIC_TURN_HOST` com esse endereço. O certificado TLS de `turns:` deve corresponder ao hostname.
- `DISCORD_ALLOWED_ROLE_IDS` aceita IDs separados por vírgula. Se estiver vazio, qualquer membro do servidor pode executar `/entrar-stream`.

### 4. Suba o stack

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend bot
```

O web app fica em `http://IP_DA_MAQUINA:8080`. O health check do backend fica em `http://IP_DA_MAQUINA:3000/healthz` somente se a porta for publicada manualmente; por padrão ele fica acessível apenas dentro da rede Docker.

> O serviço renderiza `turn/turnserver.conf` com os valores do `.env` ao iniciar. Se você alterar `TURN_PORT`, `TURN_TLS_PORT`, `TURN_MIN_PORT`, `TURN_MAX_PORT`, `TURN_REALM` ou `TURN_SECRET`, recrie o container Coturn (`docker compose up -d --force-recreate coturn`).

## Uso diário

1. No Discord, um administrador ou membro com `Manage Server` executa `/iniciar-stream` e escolhe o preset.
2. Abra o botão **Abrir interface do host** em um navegador no computador que fará a captura.
3. Clique em **Compartilhar tela** e selecione uma tela/janela. Para áudio, habilite o áudio do sistema no seletor do navegador.
4. Compartilhe o link retornado por `/entrar-stream` apenas com membros autorizados. Cada execução gera um link independente e de uso único.
5. O viewer abre o link; o vídeo ocupa a tela sem barras intrusivas. O host pode trocar o preset e alternar métricas.
6. Use `/status-stream` para ver preset, viewers, expiração e estado do relay.
7. Use `/encerrar-stream` ao terminar. As conexões são fechadas, os tokens da sala são removidos e as credenciais não podem ser reutilizadas.

### Teste somente na LAN

1. Descubra o IP LAN do host (`ip addr`, `ipconfig` ou `ifconfig`).
2. Configure `PUBLIC_WEB_URL=http://IP_LAN:8080`, `PUBLIC_TURN_HOST=IP_LAN`.
3. Permita TCP/UDP 8080, UDP/TCP 3478, TCP 5349 e UDP 49152–49252 no firewall do host.
4. Abra o link do host no host e o link do viewer em outro computador da mesma rede.
5. No painel do host, confirme `Relay TURN ativo`. Se ficar em “conectando”, veja `docker compose logs coturn` e confira a faixa UDP.

### Exposição HTTP/WSS sem pagar

O túnel só deve expor **web/sinalização**. Ele não transporta automaticamente a mídia WebRTC nem substitui o TURN.

**Cloudflare Tunnel (teste rápido):**

```bash
docker compose --profile tunnel up -d
# copie a URL https://... exibida por:
docker compose logs -f cloudflared
```

Para uso repetível, crie um túnel nomeado no Cloudflare, aponte-o para `http://web:80`, use um hostname fixo em `PUBLIC_WEB_URL` e reinicie `bot`/`backend`. Não coloque o token do túnel no GitHub. Um túnel rápido muda de URL e deve ser tratado apenas como teste.

**Tailscale:**

- Coloque host e viewers na mesma tailnet e use o IP/hostname Tailscale em `PUBLIC_WEB_URL` e `PUBLIC_TURN_HOST`.
- Alternativamente, exponha apenas a interface web com Funnel e deixe a mídia em uma rota Tailscale alcançável. Firewalls e políticas da tailnet continuam valendo.

**ngrok free:**

- Aponte o túnel HTTP para a porta 8080.
- Atualize `PUBLIC_WEB_URL` com o hostname que o plano disponibilizar.
- O TURN ainda precisa ser público/roteável; um túnel HTTP não carrega UDP TURN.

### Coturn local na internet

1. Faça port-forward no roteador para a máquina do host: UDP/TCP 3478, TCP 5349 e UDP 49152–49252.
2. Defina `PUBLIC_TURN_HOST` como o IP público ou DNS do host.
3. Para `turns:` real, monte um certificado em `turn/certs/` e descomente `cert`/`pkey` em `turn/turnserver.conf`.
4. Se o IP muda, use DDNS. UPnP/NAT-PMP pode automatizar o encaminhamento, mas aumenta a superfície de ataque; prefira configuração manual e firewall restritivo.
5. Teste com um viewer em rede móvel, não apenas na mesma LAN.

### Coturn remoto / VPS gratuita

Instale Coturn em uma máquina com IP público, copie o mesmo `TURN_SECRET` para o relay remoto e configure `PUBLIC_TURN_HOST` apontando para ele. O backend pode continuar no host se os browsers alcançarem o TURN remoto. Ajuste `turnserver.conf`, firewall e certificado no relay. Ofertas como Oracle Cloud Always Free mudam de quota, região e disponibilidade; confirme os limites atuais e os termos do provedor antes de usar.

## Arquitetura e fluxo de segurança

```text
Discord slash command
        │ HTTPS interno + INTERNAL_API_SECRET
        ▼
Bot ───────► Backend Fastify ── WSS signaling ── Host browser
                    │                      ╲      ╲
                    └── memória/SQLite*     ╲────── Viewer browsers
                                               ╲
                                                Coturn TURN/STUN relay
```

`*` O MVP usa memória para não persistir tokens. O contrato do `RoomStore` permite trocar por SQLite sem enviar Discord IDs ao cliente.

1. O bot envia o Discord ID somente na chamada privada bot→backend.
2. O backend gera `room_xxxx`, `user_xxxx` e tokens HMAC opacos. O ID do Discord não entra em link, SDP, resposta pública ou WebRTC.
3. O token de acesso vive no fragmento `#token=...`; o browser o lê, faz um POST de sessão e remove o fragmento com `history.replaceState`. Não usamos `localStorage` nem `sessionStorage`.
4. O token de acesso é consumido uma vez e troca-se por um lease curto de WebSocket. A mensagem `renew` renova o lease sem expor nova identidade.
5. Todos os `RTCPeerConnection` usam `iceTransportPolicy: 'relay'`. O backend rejeita SDP/candidatos com tipos não relay como defesa em profundidade.
6. O backend cria credencial TURN com `timestamp:participantId` e HMAC, com TTL curto. Ao encerrar a sala, tokens e conexões são removidos.
7. Logs não registram payloads WebSocket, tokens, IPs, SDP ou candidatos. O painel também não apresenta IP/hostname de candidatos.

### Limitações de privacidade

Relay-only impede a descoberta direta entre host e viewers dentro desta aplicação, mas não é anonimato absoluto: o provedor do TURN vê o tráfego e o IP de cada cliente para transportar os pacotes. Proteja o segredo do TURN, mantenha o servidor atualizado e não publique logs do Coturn.

## Estrutura do código

```text
apps/
  backend/       API Fastify, RoomStore, WSS e credenciais TURN
  bot/           discord.js, comandos e cliente interno do backend
  web/           React + Vite, captura, sinalização e UI
packages/
  shared/        tipos, schemas Zod, HMAC, política relay-only
turn/            configuração e ponto de montagem de certificados Coturn
docker/          Dockerfiles e proxy nginx
.github/         CI no GitHub Actions
```

## Desenvolvimento local sem Docker

```bash
npm install
npm run typecheck
npm test

# terminal 1 — backend (com .env preenchido)
npm run dev:backend

# terminal 2 — web
npm run dev:web

# terminal 3 — bot
npm run dev:bot
```

Para desenvolvimento, `http://localhost:5173` é aceito como origem CORS. O navegador ainda precisa alcançar o Coturn configurado em `PUBLIC_TURN_HOST`.

### Testes e qualidade

```bash
npm test
npm run typecheck
npm run build
npm run lint
```

Os testes principais garantem:

- uma oferta SDP com candidato `host`/`srflx` é rejeitada e uma oferta relay é aceita;
- HMAC inválido, expiração e reuso de token são rejeitados;
- o payload público não inclui `discordId`, `guildId`, IP ou campos de rede;
- a fronteira `/api/rooms/:id/session` não vaza IDs do Discord.

## Troubleshooting

- **`expired_token`:** gere outro link com `/entrar-stream`; não recarregue um link já consumido.
- **Sala abre mas não há mídia:** confira `PUBLIC_TURN_HOST`, portas UDP da faixa relay, firewall e `docker compose logs coturn`.
- **`localhost` no viewer:** troque `PUBLIC_WEB_URL` por IP LAN, DNS público ou hostname Tailscale.
- **1080p60 instável:** teste 1080p30 ou 720p60, confirme aceleração de hardware, reduza viewers e meça upload.
- **Áudio ausente:** o seletor de tela do navegador precisa ter “compartilhar áudio do sistema”; isso varia por SO/navegador.
- **Cloudflare Tunnel funciona para a página mas não para vídeo:** esperado; configure um TURN alcançável separadamente.
- **Comandos não aparecem:** use `DISCORD_GUILD_ID` para registro imediato, reinicie o bot e confirme `applications.commands` no convite.

## Contribuindo pelo GitHub

1. Faça fork no GitHub, clone o fork e crie uma branch de trabalho.
2. Não inclua `.env`, certificados privados, tokens Discord, dumps de logs ou links de sala.
3. Rode `npm test`, `npm run typecheck`, `npm run build` e `npm run lint`.
4. Abra um Pull Request descrevendo como testou LAN/TURN e qualquer alteração de segurança.
5. Para mudanças em signaling, inclua um teste de rejeição de candidatos não relay.

## Licença

MIT. Veja [LICENSE](LICENSE).
