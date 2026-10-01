# PrivateStream Bridge

**Streaming de tela auto-hospedado, autenticado pelo Discord e transportado por WebRTC relay-only.**

O host executa o stack completo na própria máquina. O Discord funciona como a camada de autorização e distribuição de links temporários; nenhum vídeo passa pelo canal de voz do Discord.

Depois da configuração inicial, a experiência do usuário é **sem código**: o bot é convidado para o servidor, o host executa `/iniciar-stream` no chat, clica no link recebido e escolhe **Compartilhar tela** no navegador. Viewers apenas usam `/entrar-stream` e abrem o link privado.

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
- Setup visual minimalista, atalhos por sistema operacional e guia [DDP](DDP.md).
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

## Setup visual — sem editar código

O administrador usa um assistente minimalista de três etapas: **Seu bot → Conexão → Ativar**. Os membros continuam usando apenas os comandos do Discord e o navegador.

### 1. Prepare o computador

- Instale **[Node.js LTS](https://nodejs.org/en/download)** (22+ recomendado, mínimo 20.11) pelo instalador oficial.
- Instale e abra **[Docker Desktop](https://docs.docker.com/get-started/get-docker/)**, ou Docker Engine com Compose v2.20+ no Linux.
- Baixe **Code → Download ZIP** na [branch do projeto](https://github.com/Random01-01/DCLV/tree/arena/01a0f959-dclv) e **extraia a pasta inteira**.
- Use um navegador atualizado. A qualidade e o áudio capturado dependem do navegador e sistema operacional.

O setup verifica o Docker e orienta a instalação se estiver faltando; não instala software administrativo silenciosamente. Os instaladores oficiais podem pedir confirmação ou reinício. Docker Desktop possui termos de licença próprios; Docker Engine no Linux não exige licença paga.

### 2. Crie o bot no Discord

Siga **[DDP — Discord Developer Portal](DDP.md)**: o guia explica a criação da aplicação, Application ID, token, intents, permissões, convite e ID do servidor. Você nunca precisa enviar o token a outra pessoa.

### 3. Abra o assistente

| Sistema | Arquivo para abrir na pasta extraída |
| --- | --- |
| Windows | `Setup-Windows.cmd` — duplo clique |
| macOS | `Setup-macOS.command` — Finder → Abrir |
| Linux | `Setup-Linux.sh` — Executar como programa |

No macOS/Linux, o gerenciador de arquivos pode exigir a permissão de execução nas propriedades. Detalhes no [DDP](DDP.md#5--abra-o-setup--sem-terminal).

O assistente abre **http://localhost:4177**. Mantenha a janela do atalho aberta durante a configuração. **Não precisa executar `npm install` no computador do usuário**: o setup usa apenas recursos nativos do Node; as dependências do stack são instaladas nos containers.

1. **Seu bot:** cole Application ID e Bot Token; servidor e cargos são opcionais.
2. **Conexão:** escolha teste somente neste computador ou informe URL HTTPS e TURN alcançáveis pelos participantes. O IPv4 público do TURN pode ser informado para NAT.
3. **Ativar:** revise, salve, abra **Adicionar ao Discord** e clique em **Iniciar PrivateStream**.

O assistente gera os segredos, grava `.env` com proteção local, cria o convite, verifica Docker/Compose e acompanha a inicialização. O token é removido do formulário após salvar. Configurações existentes só são substituídas com confirmação; isso renova segredos e substitui ajustes anteriores. Não reconfigure durante uma transmissão ativa.

**Containers iniciados não significa bot autenticado ou mídia testada.** Aguarde o bot ficar online no Discord e teste com um espectador. Ao concluir, **Fechar assistente** encerra o setup, mas os serviços continuam no Docker. A máquina e o Docker precisam permanecer ligados.

### Rede: o que não é automático

- **Teste local:** `http://localhost:8080` funciona apenas no próprio computador; não compartilhe links localhost com outras pessoas.
- **Outros dispositivos, mesmo na LAN:** é necessário **HTTPS com certificado confiável** para a captura de tela. O setup recusa HTTP em IPs da LAN, pois isso não atende ao requisito de contexto seguro do navegador.
- O setup **não provisiona domínio, TLS, VPN, túnel, firewall ou roteador**. Informe uma URL HTTPS já acessível, apontando por proxy/túnel para a porta 8080.
- Um túnel HTTPS da página **não substitui o TURN**. O relay precisa ser alcançável: UDP/TCP 3478, UDP 49152–49252, e TCP 5349 quando TURN TLS estiver configurado.
- NAT/CGNAT podem exigir regras de rede, VPN ou relay remoto. Leia os cenários abaixo e o [DDP](DDP.md).
- Não exponha a porta **4177**: o setup real aceita somente clientes locais, com proteção de origem e chave temporária. O preview público é apenas demonstrativo e não salva credenciais nem executa Docker.

### Alternativas para desenvolvedores

Se já usa terminal, os mesmos recursos estão disponíveis por:

```bash
git clone --branch arena/01a0f959-dclv https://github.com/Random01-01/DCLV.git private-stream-bridge
cd private-stream-bridge
npm run setup           # interface local; não precisa npm install
npm run setup:cli       # assistente textual legado
npm run setup:preview   # demonstração pública, sem escrita ou execução de Docker
```

Para atualização, na branch correspondente, use `git pull --ff-only`. Não substitua `.env` por arquivos de exemplo ao atualizar.

Também é possível configurar `.env` manualmente a partir de `.env.example` e iniciar com `docker compose up -d --build`. Os segredos `HMAC_SECRET`, `INTERNAL_API_SECRET` e `TURN_SECRET` devem ser aleatórios e diferentes (32 bytes cada). Nunca comite `.env` ou certificados privados.

Por padrão, nginx expõe a página na porta 8080 e encaminha API/WS para o backend interno. O endpoint `/healthz` do backend não é publicado na máquina. O Coturn renderiza seu template com os valores do `.env` durante a inicialização.

## Experiência sem código para os usuários

A instalação do bot é feita uma vez pelo administrador. A partir daí, ninguém precisa abrir terminal, editar TypeScript ou conhecer Docker para iniciar uma transmissão:

1. O administrador usa o setup visual para configurar o stack, convidar o bot e iniciar os serviços uma vez.
2. O host entra no servidor Discord e executa `/iniciar-stream` no chat.
3. O bot responde com uma mensagem efêmera e o botão **Abrir interface do host**.
4. O host clica no botão, clica em **Compartilhar tela** e escolhe tela/janela e áudio do sistema no navegador.
5. Cada viewer autorizado executa `/entrar-stream`, recebe uma mensagem efêmera com seu link e apenas abre esse link.
6. O host pode alterar o preset durante a transmissão; `/status-stream` mostra viewers e relay; `/encerrar-stream` fecha tudo.

O bot não envia vídeo pelo Discord. Ele cria a sala no backend local, gera o link efêmero e autoriza a conexão WebRTC.

## Uso diário

1. No Discord, um administrador ou membro com `Manage Server` executa `/iniciar-stream` e escolhe o preset.
2. Abra o botão **Abrir interface do host** em um navegador no computador que fará a captura.
3. Clique em **Compartilhar tela** e selecione uma tela/janela. Para áudio, habilite o áudio do sistema no seletor do navegador.
4. Cada membro autorizado executa `/entrar-stream` para receber seu próprio link privado, de uso único. Não encaminhe links de acesso.
5. O viewer abre o link; o vídeo ocupa a tela sem barras intrusivas. O host pode trocar o preset e alternar métricas.
6. Use `/status-stream` para ver preset, viewers, expiração e estado do relay.
7. Use `/encerrar-stream` ao terminar. As conexões são fechadas, os tokens da sala são removidos e as credenciais não podem ser reutilizadas.

### Teste somente na LAN

1. Descubra o IP LAN do host (`ip addr`, `ipconfig` ou `ifconfig`).
2. Use uma URL HTTPS com certificado confiável para `PUBLIC_WEB_URL`, via proxy/túnel para a porta 8080, e `PUBLIC_TURN_HOST=IP_LAN`. A exceção HTTP/localhost vale somente para teste na própria máquina.
3. Permita a conexão web ao proxy, UDP/TCP 3478 e UDP 49152–49252; TCP 5349 se TURN TLS estiver configurado. A página interna usa TCP 8080, não UDP.
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

- Coloque host e viewers na mesma tailnet. Use uma URL HTTPS confiável em `PUBLIC_WEB_URL` (por exemplo, via Tailscale Serve) e o IP/hostname Tailscale alcançável em `PUBLIC_TURN_HOST`.
- Alternativamente, exponha apenas a interface web com Funnel e deixe a mídia em uma rota Tailscale alcançável. Firewalls e políticas da tailnet continuam valendo.

**ngrok free:**

- Aponte o túnel HTTP para a porta 8080.
- Atualize `PUBLIC_WEB_URL` com o hostname que o plano disponibilizar.
- O TURN ainda precisa ser público/roteável; um túnel HTTP não carrega UDP TURN.

### Coturn local na internet

1. Faça port-forward no roteador para a máquina do host: UDP/TCP 3478, TCP 5349 e UDP 49152–49252.
2. Defina `PUBLIC_TURN_HOST` como o IP público ou DNS do host.
3. Para `turns:` real, coloque `fullchain.pem` e `privkey.pem` em `turn/certs/`. O entrypoint inclui `cert`/`pkey` automaticamente quando os arquivos configurados existem. O certificado deve corresponder ao hostname TURN.
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
setup/           UI minimalista (HTML, CSS e JS locais, sem CDN)
scripts/         servidor, validação e testes do setup, assistente textual
Setup-*          atalhos para Windows, macOS e Linux
DDP.md           guia Discord Developer Portal e instalação sem terminal
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
- a fronteira `/api/rooms/:id/session` não vaza IDs do Discord;
- o setup valida entradas, protege o `.env`, exige origem/chave local e impede builds simultâneos;
- o preview não salva arquivos nem inicia containers; logs Docker não são enviados à UI.

Os testes nativos do setup também podem ser executados isoladamente: `npm run test:setup`. Os testes de inicialização usam um executor Docker simulado; não substituem um teste real de instalação, Discord e TURN.

## Troubleshooting

- **`expired_token`:** gere outro link com `/entrar-stream`; não recarregue um link já consumido.
- **Sala abre mas não há mídia:** confira `PUBLIC_TURN_HOST`, portas UDP da faixa relay, firewall e `docker compose logs coturn`.
- **`localhost` no viewer:** configure uma URL HTTPS alcançável em `PUBLIC_WEB_URL`, e o IP/DNS correto em `PUBLIC_TURN_HOST`.
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
