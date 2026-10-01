# Security policy

## Reporting

Não publique tokens Discord, links de sala, segredos HMAC/TURN ou candidatos ICE em issues. Para vulnerabilidades de privacidade, autenticação ou relay, abra um aviso privado no GitHub ou contate os mantenedores antes de publicar detalhes.

## Modelo de ameaça

O PrivateStream Bridge impede, por padrão, que clientes WebRTC negociem diretamente: o navegador e o backend exigem candidatos TURN relay. Isso não impede o provedor do TURN de observar IPs e metadados de transporte. O host deve manter o sistema, Docker, navegador, bot e Coturn atualizados.

## Boas práticas

- Gere segredos aleatórios diferentes para `HMAC_SECRET`, `INTERNAL_API_SECRET` e `TURN_SECRET`.
- Nunca comite `.env`, certificados privados ou links com `#token`.
- Use TLS para a interface web e `turns:` na internet.
- Restrinja `DISCORD_ALLOWED_ROLE_IDS` quando o servidor não for privado.
- Não habilite UPnP sem entender a política do roteador.

## Setup local

O assistente recebe o Bot Token e pode executar Docker Compose, portanto é uma ferramenta administrativa, não um serviço público. Ele verifica o endereço de origem local, Host, Origin e uma chave aleatória de sessão mantida apenas em memória. Requisições de outros sites/dispositivos são rejeitadas. A interface não usa CDNs, armazenamento de tokens no navegador ou logs de payloads.

- Não encaminhe a porta 4177 nem publique o setup por proxy/túnel.
- O modo `--demo` é uma prévia: todas as operações de escrita, início e encerramento são bloqueadas no servidor.
- `.env` é criado com modo 0600 nos sistemas POSIX. No Windows, a proteção depende também das permissões da pasta/conta. Substituir a configuração exige confirmação explícita e renova os segredos.
- O setup não expõe stdout/stderr do Docker na API. Revise logs localmente, removendo tokens e dados de rede antes de compartilhá-los.
- Feche o assistente ao terminar. Os containers continuam em execução; o setup não precisa ficar aberto para usar o bot.
- O acesso local não protege contra malware, extensões maliciosas ou outro processo com acesso à sua conta/daemon Docker. Use apenas um computador confiável.
