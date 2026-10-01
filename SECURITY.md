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
