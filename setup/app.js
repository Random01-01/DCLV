/* global document, window */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const keyElement = document.querySelector('meta[name="setup-key"]');
  const setupKey = keyElement.content;
  keyElement.remove();
  const panels = [...document.querySelectorAll('[data-panel]')];
  const steps = [...document.querySelectorAll('[data-go]')];
  let step = 0;
  let furthest = 0;
  let demo = false;
  let initialized = false;
  let saved = false;
  let busy = false;
  let dockerReady = false;
  let invite = '';
  let pollTimer;
  let networkValues = { url: '', turn: '' };

  async function api(path, body) {
    const response = await window.fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-setup-key': setupKey },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: window.AbortSignal.timeout(15_000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir esta etapa.');
    return data;
  }

  function message(text = '') {
    $('message').textContent = text;
    $('message').hidden = !text;
  }

  function go(nextStep, focus = true) {
    step = nextStep;
    furthest = Math.max(furthest, step);
    panels.forEach((panel, index) => {
      panel.hidden = index !== step;
    });
    steps.forEach((item, index) => {
      item.classList.toggle('is-active', index === step);
      item.classList.toggle('is-done', index < step);
      item.disabled = index > furthest || saved || busy;
      if (index === step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    $('back').hidden = step === 0;
    $('footer-note').hidden = step > 0;
    $('next').textContent = [
      'Continuar →',
      'Revisar configuração →',
      demo ? 'Simular configuração →' : 'Salvar configuração →',
    ][step];
    if (focus) panels[step].querySelector('h2').focus();
    message();
  }

  function validPanel() {
    for (const input of panels[step].querySelectorAll('input')) {
      if (!input.disabled && !input.checkValidity()) {
        const details = input.closest('details');
        if (details) details.open = true;
        input.reportValidity();
        return false;
      }
    }
    return true;
  }

  function review() {
    $('review-client').textContent = $('clientId').value.trim();
    $('review-url').textContent = $('publicWebUrl').value.trim();
  }

  function updateDocker(docker) {
    dockerReady = docker.installed && docker.compose && docker.running;
    $('docker-dot').className = `status-indicator ${dockerReady ? 'ok' : 'bad'}`;
    $('docker-status').textContent = demo
      ? 'Prévia visual · Docker não será executado'
      : dockerReady
        ? 'Docker pronto · tudo certo para iniciar'
        : !docker.installed
          ? 'Docker não encontrado'
          : !docker.compose
            ? 'Instale o plugin Docker Compose v2.20+'
            : 'Abra o Docker e aguarde o Engine iniciar';
    $('docker-help').hidden = demo || dockerReady;
    $('start').disabled = busy || (!demo && !dockerReady);
  }

  function showJob(job) {
    if (job.state === 'idle') return;
    $('job-status').hidden = false;
    $('job-status').dataset.state = job.state;
    $('job-message').textContent = job.message;
    busy = job.state === 'running';
    $('start').disabled = busy || job.state === 'success' || (!demo && !dockerReady);
    $('start').textContent = busy
      ? 'Preparando serviços…'
      : job.state === 'success'
        ? demo
          ? 'Demonstração concluída'
          : 'Containers iniciados ✓'
        : 'Tentar iniciar novamente';
    $('complete').hidden = job.state !== 'success';
    if (job.state === 'running') {
      window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(() => refreshStatus(true), 2000);
    }
  }

  async function refreshStatus(polling = false) {
    $('recheck').disabled = true;
    try {
      const status = await api('/api/status');
      demo = status.demo;
      $('demo-banner').hidden = !demo;
      if (!initialized) {
        initialized = true;
        $('overwrite-row').hidden = !status.configured;
        if (demo) {
          const examples = {
            clientId: '123456789012345678',
            botToken: 'demo-not-a-real-token-000000000000',
            publicWebUrl: 'https://stream.exemplo.com',
            turnHost: 'turn.exemplo.com',
          };
          for (const [id, value] of Object.entries(examples)) {
            $(id).value = value;
            $(id).readOnly = true;
          }
          $('guildId').readOnly = true;
          $('allowedRoleIds').readOnly = true;
          $('turnExternalIp').readOnly = true;
          $('show-token').disabled = true;
        }
      }
      updateDocker(status.docker);
      if (status.job.state === 'running') {
        // Recover a build in progress after a reload; the bot token is never restored.
        saved = true;
        showActivation();
        $('invite-link').hidden = !invite;
        $('copy-invite').hidden = !invite;
        if (!invite)
          $('saved-description').textContent =
            'A configuração já foi salva. Acompanhando a inicialização em andamento.';
      }
      if (!demo && saved) showJob(status.job);
    } catch {
      $('docker-status').textContent = 'Não foi possível falar com o setup. Reabra o atalho local.';
      if (polling) {
        message(
          'A conexão com o assistente caiu. Os serviços podem continuar iniciando. Use Verificar novamente para retomar.',
        );
        $('recheck').disabled = false;
      }
    } finally {
      $('recheck').disabled = false;
    }
  }

  function showActivation() {
    go(2, false);
    $('review').hidden = true;
    $('activation').hidden = false;
    $('form-footer').hidden = true;
    if (invite) $('invite-link').href = invite;
    if (demo) {
      $('saved-description').textContent =
        'Esta é uma demonstração: nenhum arquivo foi salvo e nenhum token foi usado.';
      $('invite-link').setAttribute('aria-disabled', 'true');
      $('invite-link').textContent = 'Convite disponível no setup local';
      $('copy-invite').hidden = true;
      $('start').textContent = 'Simular inicialização →';
    }
  }

  $('setup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || saved || !validPanel()) return;
    if (step < 2) {
      if (step === 1) {
        let url;
        try {
          url = new window.URL($('publicWebUrl').value);
        } catch {
          message('Informe uma URL completa.');
          return;
        }
        if (
          url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        ) {
          message(
            'Para outros computadores, use HTTPS. HTTP em um IP da LAN não permite capturar a tela.',
          );
          return;
        }
        review();
      }
      go(step + 1);
      return;
    }
    if (!$('overwrite-row').hidden && !$('confirmOverwrite').checked) {
      message('Confirme a substituição ou volte para preservar sua configuração existente.');
      return;
    }
    busy = true;
    $('next').disabled = true;
    $('next').textContent = 'Salvando…';
    $('back').disabled = true;
    steps.forEach((item) => {
      item.disabled = true;
    });
    try {
      if (!demo) {
        const data = await api('/api/setup', {
          clientId: $('clientId').value,
          botToken: $('botToken').value,
          guildId: $('guildId').value,
          allowedRoleIds: $('allowedRoleIds').value,
          publicWebUrl: $('publicWebUrl').value,
          turnHost: $('turnHost').value,
          turnExternalIp: $('turnExternalIp').value,
          confirmOverwrite: $('confirmOverwrite').checked,
        });
        invite = data.invite;
      }
      saved = true;
      $('botToken').value = '';
      $('botToken').type = 'password';
      showActivation();
    } catch (error) {
      message(error.message || 'Não foi possível salvar a configuração.');
      $('next').textContent = 'Tentar salvar novamente';
    } finally {
      busy = false;
      $('next').disabled = false;
      $('back').disabled = false;
      steps.forEach((item, index) => {
        item.disabled = saved || index > furthest;
      });
    }
  });

  $('back').addEventListener('click', () => {
    if (!busy && !saved) go(Math.max(0, step - 1));
  });
  steps.forEach((item) =>
    item.addEventListener('click', () => {
      if (!busy && !saved) go(Number(item.dataset.go));
    }),
  );
  $('show-token').addEventListener('click', () => {
    const visible = $('botToken').type === 'password';
    $('botToken').type = visible ? 'text' : 'password';
    $('show-token').textContent = visible ? 'Ocultar' : 'Mostrar';
    $('show-token').setAttribute('aria-pressed', String(visible));
    $('show-token').setAttribute('aria-label', visible ? 'Ocultar token' : 'Mostrar token');
  });
  document.querySelectorAll('[name="mode"]').forEach((input) =>
    input.addEventListener('change', () => {
      const local = input.value === 'local';
      if (local) networkValues = { url: $('publicWebUrl').value, turn: $('turnHost').value };
      $('publicWebUrl').value = local ? 'http://localhost:8080' : networkValues.url;
      $('turnHost').value = local ? 'localhost' : networkValues.turn;
      $('publicWebUrl').readOnly = local || demo;
      $('turnHost').readOnly = local || demo;
      $('nat-options').hidden = local;
      if (local) $('turnExternalIp').value = '';
      $('network-note').querySelector('p').textContent = local
        ? 'Este modo serve apenas para testar no computador do host. Links localhost não funcionam para outras pessoas. Para compartilhar com seu servidor, escolha a opção de rede.'
        : 'HTTPS é necessário para compartilhar a tela. O assistente não cria domínio, certificado ou regras no roteador. Um túnel da página não substitui o TURN.';
    }),
  );
  $('copy-invite').addEventListener('click', async () => {
    if (!invite) return;
    try {
      await window.navigator.clipboard.writeText(invite);
      $('copy-invite').textContent = 'Copiado ✓';
    } catch {
      message('Não foi possível copiar. Use o botão Adicionar ao Discord para abrir o convite.');
    }
  });
  $('start').addEventListener('click', async () => {
    if (busy || !saved) return;
    message();
    busy = true;
    $('start').disabled = true;
    if (demo) {
      $('job-status').hidden = false;
      $('job-status').dataset.state = 'running';
      $('job-message').textContent = 'Simulando a etapa visual. Nenhum container será iniciado.';
      window.setTimeout(
        () =>
          showJob({
            state: 'success',
            message: 'Prévia concluída. No seu computador, este botão executa o Docker Compose.',
          }),
        1200,
      );
      return;
    }
    try {
      const response = await api('/api/start', {});
      showJob(response.job);
    } catch (error) {
      busy = false;
      showJob({
        state: 'error',
        message: error.message || 'Não foi possível iniciar os serviços.',
      });
    }
  });
  $('recheck').addEventListener('click', () => refreshStatus());
  $('quit').addEventListener('click', async () => {
    if (demo) {
      message(
        'Na instalação local, esse botão fecha somente o assistente. Os containers continuam ligados.',
      );
      return;
    }
    try {
      await api('/api/quit', {});
      window.clearTimeout(pollTimer);
      $('quit').disabled = true;
      $('quit').textContent = 'Pode fechar esta aba';
      $('recheck').disabled = true;
      $('docker-status').textContent = 'Assistente encerrado · serviços continuam no Docker';
    } catch {
      message(
        'Feche a janela do atalho para encerrar o assistente local. Os containers continuam no Docker.',
      );
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (busy) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  go(0, false);
  refreshStatus();
})();
