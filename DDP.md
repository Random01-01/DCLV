# DDP — Discord Developer Portal

**Do bot novo ao comando `/iniciar-stream`, sem editar código.**

Este guia é para o administrador que vai instalar o PrivateStream Bridge. Os outros membros só precisam do Discord e de um navegador. O bot não transmite pelo canal de voz: ele cria a sala e entrega o link para compartilhar a tela no navegador.

> Faça tudo no seu computador. **Nunca envie seu Bot Token no chat, em issues ou em prints.** O nome de alguns botões pode variar com o idioma e atualizações do Discord.

## 1 · Abra o Developer Portal

1. Acesse **[Discord Developer Portal](https://discord.com/developers/applications)** e entre na sua conta.
2. Clique em **New Application** (Nova aplicação).
3. Dê um nome, por exemplo **PrivateStream Bridge**, aceite os termos e clique em **Create**.
4. Em **General Information**, encontre **Application ID** e clique em **Copy**.
5. Guarde esse ID para o campo **Application ID** do setup. Não confunda com **Public Key**, **Client Secret** ou ID do servidor.

## 2 · Obtenha o token do bot

1. No menu lateral, abra **Bot**.
2. Se o bot já existir, prossiga. Se aparecer **Add Bot**, clique e confirme.
3. Defina o nome e, se quiser, o avatar do bot.
4. Na área **Token**, clique em **Reset Token**. Confirme a senha/2FA **somente no site oficial do Discord**, caso solicitado.
5. Clique em **Copy** e cole o valor no campo **Bot Token** do setup local. Ele pode ser exibido somente uma vez.

**Não é necessário habilitar intents privilegiadas:**

| Opção em Bot → Privileged Gateway Intents | Configuração |
| --- | --- |
| Presence Intent | Desativado |
| Server Members Intent | Desativado |
| Message Content Intent | Desativado |

O projeto usa slash commands; não lê o conteúdo das mensagens. Deixe **Requires OAuth2 Code Grant** desativado. Não preencha **Interactions Endpoint URL**: o bot recebe os comandos pela conexão Gateway.

**Public Bot:** para uso apenas nos seus próprios servidores, pode ficar desativado. Para permitir que outros administradores instalem o seu bot, ative-o; isso não torna seu token público. A disponibilidade de links padrão de instalação de um bot privado depende das opções apresentadas no Portal.

## 3 · Confira a instalação no servidor

Se a aplicação mostrar a página **Installation**, use **Guild Install** (instalação em servidor). O PrivateStream Bridge não foi feito para **User Install** ou comandos em mensagens diretas.

O setup gera automaticamente um convite com:

- Escopos **`bot`** e **`applications.commands`**;
- Permissões **View Channels** e **Send Messages** (`3072`);
- **Sem** permissão Administrator e **sem** permissões de voz.

Não é preciso preencher Redirect URI ou implementar OAuth2. Caso queira gerar o convite no próprio Portal, vá a **OAuth2 → URL Generator** e marque os mesmos escopos e permissões. Depois abra o link resultante.

Para adicionar o bot, sua conta precisa ter **Gerenciar servidor / Manage Server** no servidor de destino. O bot não precisa dessa permissão; ela é exigida de quem vai iniciar e encerrar transmissões.

## 4 · Copie o ID do servidor (opcional, recomendado)

Esta etapa é feita no **aplicativo Discord**, não no Developer Portal:

1. Abra **Configurações de usuário → Avançado**.
2. Ative **Modo Desenvolvedor / Developer Mode**.
3. Clique com o botão direito no ícone do servidor.
4. Clique em **Copiar ID do servidor**.
5. No setup, abra **Servidor e cargos** e cole o ID.

Isso registra os comandos diretamente no servidor informado. Deixar vazio registra comandos globais, cuja propagação pode demorar mais. Informe somente um servidor no qual o bot será instalado.

Para limitar espectadores a certos cargos, copie os IDs em **Configurações do servidor → Cargos** e preencha **IDs dos cargos autorizados**, separados por vírgula. Vazio permite espectadores de todos os cargos do servidor; iniciar/encerrar continua exigindo **Gerenciar servidor**.

## 5 · Abra o setup — sem terminal

### Preparação única

1. Instale o **[Node.js LTS](https://nodejs.org/en/download)** pelo instalador oficial (recomendado 22 ou mais recente; mínimo 20.11).
2. Instale e abra o **[Docker Desktop](https://docs.docker.com/get-started/get-docker/)**. Aguarde o Engine ficar pronto. No Linux também é possível usar Docker Engine com Compose v2.20+.
3. Baixe o projeto em **[Code → Download ZIP nesta branch](https://github.com/Random01-01/DCLV/tree/arena/01a0f959-dclv)** e extraia a pasta inteira. Não abra apenas o HTML do setup e não execute os arquivos dentro do ZIP.

Os instaladores oficiais podem pedir permissões do sistema ou uma reinicialização. O setup não instala software com privilégios administrativos silenciosamente. Docker Desktop tem termos de licença próprios; Docker Engine no Linux é uma alternativa sem licença paga obrigatória.

### Abra o arquivo do seu sistema

| Sistema | Arquivo na pasta extraída |
| --- | --- |
| Windows | **`Setup-Windows.cmd`** — duplo clique |
| macOS | **`Setup-macOS.command`** — abrir pelo Finder |
| Linux | **`Setup-Linux.sh`** — Executar como programa no gerenciador de arquivos |

No macOS/Linux, se necessário, habilite a permissão de execução nas propriedades do arquivo ou use **Abrir** pelo menu de contexto. As regras variam com o sistema/gerenciador. Os atalhos não são instaladores assinados; execute apenas a cópia de origem confiável.

O navegador abrirá o assistente em **http://localhost:4177**. Mantenha a janela do atalho aberta durante o setup. Se o navegador não abrir automaticamente, digite esse endereço no navegador **da mesma máquina**. Não é necessário instalar pacotes npm no host.

### Etapa 01 — Seu bot

- Cole **Application ID** e **Bot Token** das etapas anteriores;
- Preencha servidor/cargos se desejar;
- Clique em **Continuar**.

### Etapa 02 — Conexão

Escolha um dos modos:

| Modo | Quando usar |
| --- | --- |
| **Teste neste computador** | Preenche `http://localhost:8080` e TURN `localhost`. Serve para um teste local, não para espectadores em outras máquinas. |
| **Com outras pessoas** | Informe uma URL HTTPS já acessível e o host IPv4/DNS do TURN que os participantes conseguem alcançar. |

**Atenção à rede:**

- O navegador exige **HTTPS** para capturar a tela, mesmo na LAN. HTTP só é permitido em `localhost`/loopback. `http://192.168.x.x:8080` não é uma configuração completa para compartilhar tela.
- O setup configura os containers, **não** cria domínio, certificado TLS, túnel ou regras no roteador.
- Para a página, use um proxy/túnel HTTPS confiável apontando para a porta 8080. Um túnel HTTP, por exemplo Cloudflare Tunnel, **não transporta o TURN**.
- O TURN local usa UDP/TCP **3478**, TCP **5349** (se houver certificado TURN TLS) e UDP **49152–49252**. Libere/encaminhe essas portas conforme sua rede. Não exponha a porta **4177** do setup.
- Atrás de NAT, o campo opcional **IPv4 público anunciado pelo TURN** preenche o endereço externo anunciado pelo Coturn. Ele não abre portas automaticamente.
- Com CGNAT, encaminhar portas pode não funcionar. Use uma VPN compartilhada ou relay alcançável. Veja os cenários no [README](README.md#exposição-httpwss-sem-pagar).

### Etapa 03 — Ativar

1. Revise os dados e clique em **Salvar configuração**.
2. Se já houver um `.env`, o assistente pede confirmação antes de substituí-lo. Isso renova os segredos e substitui ajustes anteriores; não faça durante uma transmissão ativa.
3. Clique em **Adicionar ao Discord**, escolha o servidor e autorize.
4. Com Docker pronto, clique em **Iniciar PrivateStream**.
5. Aguarde o build e a inicialização. O setup exibe o progresso sem expor logs ou credenciais.
6. Aguarde o bot aparecer online no Discord. **Containers iniciados** não equivale a token validado ou conexão TURN testada.
7. Clique em **Fechar assistente** ao terminar. Isso fecha o setup, não os containers. Mantenha a máquina e o Docker ligados para o bot funcionar.

O `.env` é gerado automaticamente, com três segredos independentes. O token é retirado do formulário após salvar. Não usamos `localStorage` ou `sessionStorage`. Em sistemas POSIX, o arquivo é criado com permissão `0600`; no Windows, proteja sua conta e a pasta com as permissões do sistema.

## 6 · Faça a primeira transmissão

1. No chat do servidor, execute **`/iniciar-stream`** com uma conta que tenha **Gerenciar servidor**.
2. Abra o botão **Abrir interface do host** na resposta privada do bot.
3. Clique em **Compartilhar tela** e autorize a captura. Se o navegador oferecer, marque compartilhar áudio.
4. Os espectadores executam **`/entrar-stream`** e abrem seus próprios links privados.
5. Use **`/status-stream`** para consultar a sala e **`/encerrar-stream`** ao terminar.

Cada link tem prazo curto e uso único. **Não encaminhe o link do host nem o link de outro espectador.** O bot não consegue contornar a autorização de captura do navegador.

## Ajuda rápida

| Problema | O que conferir |
| --- | --- |
| Bot offline | Docker aberto, containers ativos e token correto. Se redefiniu o token no Portal, configure novamente e clique em iniciar para recriar os serviços. |
| Comandos não aparecem | Bot instalado no servidor correto, escopo `applications.commands`, servidor opcional correto e permissão de usar comandos no canal. Aguarde a propagação global. |
| Não posso iniciar/encerrar | Sua conta precisa de **Gerenciar servidor**. Essa permissão não precisa ser concedida ao bot. |
| Docker não encontrado | Instale pelo link do assistente; abra o Docker e clique em **Verificar novamente**. |
| Docker instalado, mas não pronto | Aguarde o Engine/WSL/virtualização, confirme permissões do usuário e reinicie o Docker. No Linux, configure o acesso ao daemon conforme a documentação da distribuição. |
| Falha no build/início | Confira internet, espaço em disco e conflitos nas portas 8080/3478/5349/faixa UDP. Veja o estado dos containers no Docker Desktop. Tente iniciar novamente. Não publique logs sem remover segredos. |
| Não aparece Compartilhar tela | Use HTTPS com certificado confiável, ou localhost para teste no próprio computador. Não ignore o requisito usando flags inseguras do navegador. |
| A página abre, mas o vídeo não | O TURN precisa ser alcançável: confira firewall, NAT/CGNAT e portas. O túnel da página não resolve a mídia. |
| Token exposto | **Bot → Reset Token** no Portal, reconfigure localmente e reinicie os serviços. O token antigo deixa de funcionar. |

**Nenhuma credencial precisa ser enviada aos mantenedores para instalar ou obter ajuda.**
