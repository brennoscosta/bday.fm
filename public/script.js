// bday.fm prototype — shared behaviour

document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const menuBtn = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', mobileMenu.classList.contains('open'));
    });
  }

  // Scroll reveal
  const revealEls = document.querySelectorAll('.reveal, .reveal-stagger');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  // Count-up stats
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseFloat(el.getAttribute('data-count'));
    const suffix = el.getAttribute('data-suffix') || '';
    const decimals = el.getAttribute('data-decimals') ? parseInt(el.getAttribute('data-decimals')) : 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      const dur = 1400;
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = (decimals ? val.toFixed(decimals) : Math.round(val).toLocaleString('pt-BR')) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if ('IntersectionObserver' in window) {
      const io2 = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { run(); io2.disconnect(); } });
      }, { threshold: 0.4 });
      io2.observe(el);
    } else { run(); }
  });

  // FAQ accordion
  document.querySelectorAll('.faq-item .faq-q').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  // Login obrigatório para ações específicas (presentear, escrever, curtir, comentar, loja etc.):
  // basta adicionar o atributo data-requires-login no elemento clicável. Se não estiver logado,
  // a ação é bloqueada e o usuário é enviado para o login (com ?next= de volta para a página atual).
  function isLoggedIn() {
    return typeof authGetSession === 'function' && !!authGetSession();
  }
  function goToLoginFromHere() {
    // Preserva a página E os parâmetros atuais (ex: ?user=rafael) para que, depois do login,
    // a pessoa volte exatamente para quem ela queria presentear — não sempre para o perfil padrão.
    const page = window.location.pathname.split('/').pop() || 'index.html';
    const next = encodeURIComponent(page + window.location.search);
    window.location.href = `login.html?next=${next}`;
  }

  // Generic modal open/close via data attributes
  document.querySelectorAll('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.hasAttribute('data-requires-login') && !isLoggedIn()) { goToLoginFromHere(); return; }
      const id = btn.getAttribute('data-open-modal');
      const modal = document.getElementById(id);
      if (modal) modal.classList.add('open');
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-backdrop').classList.remove('open');
    });
  });
  document.querySelectorAll('.modal-backdrop').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('open'); });
  });

  // Toast helper
  window.showToast = (msg) => {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  };

  // Tabs (data-tab-group / data-tab-target)
  document.querySelectorAll('[data-tab-group]').forEach(group => {
    const groupName = group.getAttribute('data-tab-group');
    const buttons = group.querySelectorAll('[data-tab-btn]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const target = btn.getAttribute('data-tab-btn');
        document.querySelectorAll(`[data-tab-panel][data-tab-of="${groupName}"]`).forEach(panel => {
          panel.classList.toggle('hidden', panel.getAttribute('data-tab-panel') !== target);
        });
      });
    });
  });

  // Homepage username -> profile CTA (demo)
  const usernameForm = document.getElementById('usernameForm');
  if (usernameForm) {
    usernameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = document.getElementById('usernameInput').value.trim();
      if (!val) {
        showToast('Digite um nome de usuário para continuar.');
        return;
      }
      showToast(`Quase lá! Crie sua conta para ativar bday.fm/${val}...`);
      setTimeout(() => { window.location.href = `cadastro.html?usuario=${encodeURIComponent(val)}`; }, 700);
    });
  }

  // Gift "Presentear" buttons open the gift modal (catalog page)
  document.querySelectorAll('[data-gift-name]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-gift-name');
      const price = btn.getAttribute('data-gift-price');
      const modal = document.getElementById('giftModal');
      if (modal) {
        modal.querySelector('[data-gift-summary-name]').textContent = name;
        modal.querySelector('[data-gift-summary-price]').textContent = price;
        modal.classList.add('open');
      }
    });
  });
  const confirmGiftBtn = document.getElementById('confirmGiftBtn');
  if (confirmGiftBtn) {
    confirmGiftBtn.addEventListener('click', () => {
      const modal = document.getElementById('giftModal');
      const name = modal.querySelector('[data-gift-summary-name]').textContent;
      modal.classList.remove('open');
      showToast(`"${name}" enviado — demonstração, nenhum pagamento real foi feito.`);
    });
  }

  // Wallet demo actions — valida o valor antes de simular sucesso, para nenhuma ação ficar sem resposta.
  const WALLET_DEMO_BALANCE = 214; // mesmo saldo estático mostrado na tela, usado só para validar o formulário aqui.
  const confirmDeposit = document.getElementById('confirmDeposit');
  if (confirmDeposit) confirmDeposit.addEventListener('click', () => {
    const input = document.getElementById('depositAmountInput');
    const value = input ? parseFloat(input.value) : NaN;
    if (!value || value <= 0) { showToast('Digite um valor válido para depositar.'); return; }
    document.getElementById('depositModal').classList.remove('open');
    showToast('Depósito simulado com sucesso (demo).');
    if (input) input.value = '';
  });
  const confirmWithdraw = document.getElementById('confirmWithdraw');
  if (confirmWithdraw) confirmWithdraw.addEventListener('click', () => {
    const input = document.getElementById('withdrawAmountInput');
    const value = input ? parseFloat(input.value) : NaN;
    if (!value || value < 10) { showToast('O valor mínimo para saque é R$ 10,00.'); return; }
    if (value > WALLET_DEMO_BALANCE) { showToast('Saldo insuficiente para esse saque (demo).'); return; }
    document.getElementById('withdrawModal').classList.remove('open');
    // A velocidade escolhida (padrão/instantâneo) é lida direto do botão marcado como ativo,
    // em vez de depender de uma variável separada no script da própria página — evita que duas
    // mensagens de toast concorram entre si e uma acabe sobrescrevendo a outra.
    const activeSpeedBtn = document.querySelector('.speed-btn.border-purple-500');
    const isInstant = activeSpeedBtn && activeSpeedBtn.getAttribute('data-speed') === 'instant';
    showToast(isInstant
      ? 'Saque instantâneo simulado — caiu na hora, com taxa de 6% (demo).'
      : 'Solicitação de saque simulada (demo).');
    if (input) input.value = '';
  });

  // Add friend / share buttons (profile page) — demo feedback
  document.querySelectorAll('[data-demo-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.hasAttribute('data-requires-login') && !isLoggedIn()) { goToLoginFromHere(); return; }
      showToast(btn.getAttribute('data-demo-action'));
    });
  });

  // Botões "Copiar link" — copiam de verdade para a área de transferência antes de avisar que
  // copiou (antes disso, o botão só mostrava o toast "Link copiado!" sem copiar nada de fato).
  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback para navegadores sem suporte à Clipboard API
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch (e) { /* silencioso — melhor esforço */ }
    document.body.removeChild(textarea);
    return Promise.resolve();
  }
  document.querySelectorAll('[data-copy-target], [data-copy-value]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-copy-target');
      const text = targetId
        ? (document.getElementById(targetId)?.textContent || '').trim()
        : btn.getAttribute('data-copy-value');
      if (!text) return;
      const fullLink = text.startsWith('http') ? text : `https://${text}`;
      copyTextToClipboard(fullLink).then(() => {
        showToast(btn.getAttribute('data-copy-toast') || 'Link copiado! (demo)');
      });
    });
  });

  // Validação simples para uploads de imagem (avatar, capa, foto do BDAY, foto do presente):
  // bloqueia arquivos que não são imagem ou que são grandes demais, sempre com feedback —
  // antes disso, qualquer arquivo era aceito silenciosamente, mesmo um PDF ou uma foto de 40MB.
  window.validateImageFile = (file, maxMB = 8) => {
    if (!file.type || !file.type.startsWith('image/')) {
      showToast('Envie um arquivo de imagem (JPG, PNG ou GIF).');
      return false;
    }
    if (file.size > maxMB * 1024 * 1024) {
      showToast(`Imagem muito grande — envie um arquivo de até ${maxMB}MB.`);
      return false;
    }
    return true;
  };

  // Links/botões simples que exigem login e não usam modal nem toast (ex: "Presentear" no feed)
  document.querySelectorAll('[data-requires-login]:not([data-open-modal]):not([data-demo-action])').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!isLoggedIn()) { e.preventDefault(); goToLoginFromHere(); }
    });
  });

  // Carrossel horizontal genérico (ex: seção de benefícios) — botões de seta rolam a
  // faixa de cards por atributo data-scroll-prev / data-scroll-next apontando pro id da faixa.
  document.querySelectorAll('[data-scroll-prev]').forEach(btn => {
    btn.addEventListener('click', () => {
      const track = document.getElementById(btn.getAttribute('data-scroll-prev'));
      if (track) track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' });
    });
  });
  document.querySelectorAll('[data-scroll-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      const track = document.getElementById(btn.getAttribute('data-scroll-next'));
      if (track) track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' });
    });
  });

  // Bolinhas de paginação para carrosséis com data-dots apontando pro id do
  // container de dots. Cada filho direto da faixa vira um dot; clicar leva até
  // o item, e um IntersectionObserver mantém o dot ativo em sincronia com o scroll.
  document.querySelectorAll('[data-dots]').forEach(track => {
    const dotsWrap = document.getElementById(track.getAttribute('data-dots'));
    if (!dotsWrap) return;
    const cards = Array.from(track.children);
    if (!cards.length) return;
    dotsWrap.innerHTML = cards.map((_, i) => `<button type="button" class="carousel-dot${i === 0 ? ' active' : ''}" aria-label="Ir para item ${i + 1}"></button>`).join('');
    const dots = Array.from(dotsWrap.children);
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        cards[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      });
    });
    if ('IntersectionObserver' in window) {
      // rootMargin corta a metade direita da faixa: só o card mais à esquerda
      // conta como "atual", então o dot ativo acompanha a posição do scroll.
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const idx = cards.indexOf(entry.target);
          if (idx === -1 || !entry.isIntersecting) return;
          dots.forEach(d => d.classList.remove('active'));
          dots[idx].classList.add('active');
        });
      }, { root: track, rootMargin: '0px -55% 0px 0px', threshold: [0.5] });
      cards.forEach(c => io.observe(c));
    }
  });

  // Alguns navegadores só liberam autoplay se a propriedade muted for
  // reafirmada via JS (o atributo sozinho às vezes não basta após navegação).
  const heroVideo = document.querySelector('.hero-cine .hero-video');
  if (heroVideo) {
    heroVideo.muted = true;
    const p = heroVideo.play();
    if (p && p.catch) p.catch(() => {});
  }
});
