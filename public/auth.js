// bday.fm prototype — simulação de sessão/login (sem backend real)
// Guarda a sessão em localStorage + sessionStorage e também a propaga pela URL
// (?session=slug) como rede de segurança: quando o protótipo é aberto direto do
// arquivo (file://), alguns navegadores não compartilham o armazenamento entre
// páginas diferentes, então a URL garante que o login "atravesse" a navegação.

const AUTH_SESSION_KEY = 'bdayfm_session';

function authGetSession() {
  let raw = null;
  try { raw = localStorage.getItem(AUTH_SESSION_KEY); } catch (e) {}
  if (!raw) { try { raw = sessionStorage.getItem(AUTH_SESSION_KEY); } catch (e) {} }
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

function authSaveSession(session) {
  const raw = JSON.stringify(session);
  try { localStorage.setItem(AUTH_SESSION_KEY, raw); } catch (e) {}
  try { sessionStorage.setItem(AUTH_SESSION_KEY, raw); } catch (e) {}
}

function authLogin(slug, role) {
  authSaveSession({ slug, role: role || null, avatarDataUrl: null });
  // login explícito volta a permitir a restauração de sessão pela URL
  try { sessionStorage.removeItem('bdayfm_ignora_sessao_url'); } catch (e) {}
}

function authLogout() {
  // Encerra a sessão real no servidor (cookie httpOnly) — fire and forget
  try { fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  try { localStorage.removeItem(AUTH_SESSION_KEY); } catch (e) {}
  try { sessionStorage.removeItem(AUTH_SESSION_KEY); } catch (e) {}
  // depois de sair, ignora ?session= nas URLs — senão o logout "desfaz" sozinho
  try { sessionStorage.setItem('bdayfm_ignora_sessao_url', '1'); } catch (e) {}
}

// Atualiza a foto do usuário logado na sessão (chamado ao salvar o perfil em /perfil),
// para que o header em outras páginas reflita a foto escolhida.
function authSyncAvatar(slug, avatarDataUrl) {
  const session = authGetSession();
  if (session && session.slug === slug) {
    session.avatarDataUrl = avatarDataUrl || null;
    authSaveSession(session);
  }
}

// Restaura a sessão a partir de ?session=slug na URL, caso o armazenamento local
// não tenha "acompanhado" a navegação até esta página.
function authBootstrapFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    // ?enter=slug é uma entrada explícita (ex.: "Ver site" do painel admin, que
    // deve navegar já logado como uma conta de demonstração real) — diferente de
    // ?session=, que é só a "rede de segurança" propagada entre páginas e por
    // isso não deve sobrescrever uma sessão/logout já existentes.
    const enter = params.get('enter');
    if (enter) { authLogin(enter); return; }
    const slug = params.get('session');
    let ignorar = null;
    try { ignorar = sessionStorage.getItem('bdayfm_ignora_sessao_url'); } catch (e) {}
    if (slug && !authGetSession() && !ignorar) authSaveSession({ slug, avatarDataUrl: null });
  } catch (e) {}
}
authBootstrapFromUrl();

// Protege páginas que exigem login (ex: Carteira). Deve ser chamada o quanto antes,
// idealmente num <script> no <head>, para redirecionar antes que o conteúdo apareça.
function authRequireLogin(nextPage) {
  if (!authGetSession()) {
    window.location.replace(`/login?next=${encodeURIComponent(nextPage)}`);
    return false;
  }
  return true;
}

// Ícones (inline, sem dependência de icons.js — este arquivo roda em toda página)
const NOTIF_ICON_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
const NOTIF_ICON_GIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><rect x="3" y="8" width="18" height="4"/><path d="M12 8v13"/><path d="M19 12v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8"/><path d="M16.5 8a2.5 2.5 0 0 0 0-5C14 3 12 8 12 8"/></svg>';
const NOTIF_ICON_MSG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5z"/></svg>';
const NOTIF_ICON_SPARKLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>';

// Monta a lista de notificações a partir dos dados já existentes do usuário
// (presentes/torpedos recebidos), sem precisar de uma fonte de dados nova.
function buildNotifications(u) {
  const items = (u.gifts || []).map(g => ({
    icon: g.value ? NOTIF_ICON_GIFT : NOTIF_ICON_MSG,
    iconBg: g.value ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600',
    text: `<b>${g.who}</b> ${g.value ? 'enviou ' + g.item : 'enviou um Torpedo'}`,
    when: g.when,
  }));
  if (items.length === 0) {
    items.push({
      icon: NOTIF_ICON_SPARKLE,
      iconBg: 'bg-purple-100 text-purple-600',
      text: 'Sua conta está pronta! Compartilhe seu perfil para começar a receber presentes.',
      when: 'agora',
    });
  }
  return items;
}

function notifListHTML(items) {
  // Item clicável quando há um destino (href) — sem isso o sininho mostrava a
  // notificação mas não dava nenhum jeito de "abrir" (ex.: Torpedo recebido).
  return items.map(n => {
    const cls = `flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50 transition${n.unread ? ' bg-purple-50/40' : ''}`;
    const inner = `
      <div class="w-8 h-8 rounded-full ${n.iconBg} flex items-center justify-center shrink-0">${n.icon}</div>
      <div class="min-w-0">
        <div class="text-sm leading-snug">${n.text}</div>
        <div class="text-xs text-slate-400 mt-0.5">${n.when}</div>
      </div>`;
    if (n.href) return `<a href="${n.href}" class="${cls}">${inner}</a>`;
    return `<div class="${cls}">${inner}</div>`;
  }).join('');
}

// ---- Notificações REAIS (servidor) — sininho + página /atividades ----

const NOTIF_ICON_HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const NOTIF_ICON_USERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

// Tempo relativo em pt-BR ("agora", "há 5 min", "há 2 h", "ontem", "12/03").
function bdayTimeAgo(iso) {
  try {
    const d = new Date(iso);
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    if (s < 172800) return 'ontem';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch (e) { return ''; }
}

// Converte uma notificação da API no item visual do sininho/atividades.
function bdayNotifFormat(n) {
  const who = n.actor ? `<b>${bdaySanitizeText(n.actor.name)}</b>` : 'Alguém';
  const d = n.data || {};
  // Quem está vendo a notificação (destinatário) — presentes/torpedos aparecem
  // na lista de "Presentes e Torpedos recebidos" do PRÓPRIO perfil de quem
  // recebeu, não no perfil de quem enviou. Sem isso, clicar num Torpedo levava
  // pro perfil do remetente, onde a mensagem não aparece — parecia "quebrado".
  const own = (typeof authGetSession === 'function') ? authGetSession() : null;
  const ownHref = own && own.slug ? `/${own.slug}#presentes-recebidos` : null;
  const actorHref = n.actor ? `/${n.actor.slug}` : null;
  const excerpt = (t) => {
    if (!t) return '';
    const clean = bdaySanitizeText(t);
    const short = clean.length > 70 ? clean.slice(0, 70) + '…' : clean;
    return ` — <span class="text-slate-500">“${short}”</span>`;
  };
  const map = {
    FRIEND_REQUEST: { icon: NOTIF_ICON_USERS, bg: 'bg-emerald-100 text-emerald-600', text: `${who} quer ser seu amigo`, href: actorHref },
    FRIEND_REQUEST_SENT: { icon: NOTIF_ICON_USERS, bg: 'bg-slate-100 text-slate-500', text: `Você enviou um pedido de amizade para ${who}`, href: actorHref },
    FRIEND_ACCEPT: { icon: NOTIF_ICON_USERS, bg: 'bg-emerald-100 text-emerald-600', text: `${who} aceitou seu pedido de amizade`, href: actorHref },
    FRIEND_ACCEPTED_BY_YOU: { icon: NOTIF_ICON_USERS, bg: 'bg-emerald-100 text-emerald-600', text: `Você e ${who} agora são amigos`, href: actorHref },
    GIFT: { icon: NOTIF_ICON_GIFT, bg: 'bg-purple-100 text-purple-600', text: `${who} te enviou ${d.gift ? bdaySanitizeText(d.gift) : 'um presente'}${d.emoji ? ' ' + d.emoji : ''}${excerpt(d.message)}`, href: ownHref },
    TORPEDO: { icon: NOTIF_ICON_MSG, bg: 'bg-blue-100 text-blue-600', text: `${who} te enviou um Torpedo 💌${excerpt(d.message)}`, href: ownHref },
    GOAL_CONTRIBUTION: { icon: NOTIF_ICON_SPARKLE, bg: 'bg-amber-100 text-amber-600', text: `${who} contribuiu no seu BDAY${d.amount ? ` (R$ ${Number(d.amount).toFixed(2).replace('.', ',')})` : ''}`, href: ownHref },
    POST_LIKE: { icon: NOTIF_ICON_HEART, bg: 'bg-pink-100 text-pink-600', text: `${who} curtiu sua publicação`, href: '/feed' },
    POST_COMMENT: { icon: NOTIF_ICON_MSG, bg: 'bg-blue-100 text-blue-600', text: `${who} comentou na sua publicação${d.excerpt ? `: “${bdaySanitizeText(d.excerpt)}”` : ''}`, href: '/feed' },
  };
  const m = map[n.type] || { icon: NOTIF_ICON_SPARKLE, bg: 'bg-purple-100 text-purple-600', text: 'Nova atividade', href: null };
  return { icon: m.icon, iconBg: m.bg, text: m.text, when: bdayTimeAgo(n.createdAt), unread: !n.read, actorSlug: n.actor ? n.actor.slug : null, href: m.href };
}
function bdaySanitizeText(s) { return String(s == null ? '' : s).replace(/[<>]/g, ''); }
window.bdayNotifFormat = bdayNotifFormat;
window.bdayTimeAgo = bdayTimeAgo;

// Busca as notificações reais (síncrono, mesmo padrão do users.js).
function bdayFetchNotifications(perPage) {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/notifications?page=1&perPage=' + (perPage || 8), false);
    xhr.send(null);
    if (xhr.status !== 200) return null;
    return JSON.parse(xhr.responseText || 'null');
  } catch (e) { return null; }
}

// Marca tudo como lido no servidor (não bloqueia a interface).
function bdayMarkNotificationsRead() {
  try {
    fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  } catch (e) {}
}

// Preenche a área de autenticação do header (desktop #authArea + mobile #authAreaMobile)
// mostrando a foto/nome do usuário e um menu (Meu perfil / Minha carteira / Sair) quando logado.
function authRenderHeader() {
  const session = authGetSession();
  const desktopArea = document.getElementById('authArea');
  const mobileArea = document.getElementById('authAreaMobile');
  if (!desktopArea && !mobileArea) return;
  // Usa findAnyUser (definida em users.js) em vez de olhar só o objeto fixo USERS,
  // para que o cabeçalho reconheça também contas criadas pelo cadastro (guardadas
  // no armazenamento local deste navegador), não só os perfis de demonstração.
  const u = (typeof findAnyUser === 'function') ? findAnyUser(session && session.slug) : (session && typeof USERS !== 'undefined' ? USERS[session.slug] : null);
  if (!session || !u) return;
  // "Carteira" só deve aparecer no menu para quem está logado — o link vem
  // oculto por padrão no HTML (class="hidden") e só é revelado aqui.
  const navCarteiraD = document.getElementById('navCarteiraD');
  const navCarteiraM = document.getElementById('navCarteiraM');
  if (navCarteiraD) navCarteiraD.classList.remove('hidden');
  if (navCarteiraM) navCarteiraM.classList.remove('hidden');
  const firstName = u.name.split(' ')[0];
  // Prioriza a foto salva no perfil (u.avatar, persiste entre sessões/recarregamentos);
  // cai para a foto só-da-sessão (session.avatarDataUrl) como respaldo.
  const photo = u.avatar || session.avatarDataUrl;
  const hasPhoto = !!photo;
  const avatarClass = hasPhoto ? 'bg-cover bg-center' : u.grad;
  const avatarStyle = hasPhoto ? ` style="background-image:url('${photo}')"` : '';
  const avatarInner = hasPhoto ? '' : u.initial;
  const profileHref = `/${session.slug}`;
  const walletHref = `/carteira`;

  // Notificações reais do servidor; se indisponíveis (ex.: sem cookie), cai no
  // resumo derivado dos presentes como antes.
  const notifData = bdayFetchNotifications(8);
  const notifItems = notifData
    ? (notifData.notifications.length ? notifData.notifications.map(bdayNotifFormat) : buildNotifications(u))
    : ((typeof USERS !== 'undefined') ? buildNotifications(u) : []);
  const notifCount = notifData ? notifData.unreadCount : notifItems.length;
  const NOTIF_SEE_ALL = '<a href="/atividades" class="block text-center text-sm font-semibold text-purple-600 py-2.5 border-t border-gray-50 hover:bg-purple-50">Ver todas as atividades</a>';

  if (desktopArea) {
    desktopArea.innerHTML = `
      <div class="relative">
        <button id="notifBtn" type="button" title="Notificações" class="relative w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-purple-600 transition">
          ${NOTIF_ICON_BELL}
          <span id="notifBadge" class="${notifCount > 0 ? '' : 'hidden'} absolute top-1 right-1.5 w-2 h-2 rounded-full bg-pink-500 border border-white"></span>
        </button>
        <div id="notifDropdown" class="hidden absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-gray-100 rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto">
          <div class="px-4 py-2.5 flex items-center justify-between border-b border-gray-50 sticky top-0 bg-white">
            <span class="font-bold text-sm">Notificações</span>
            <button id="notifMarkAllBtn" type="button" class="text-xs font-semibold text-purple-600 hover:underline">Marcar como lidas</button>
          </div>
          <div id="notifList">${notifListHTML(notifItems)}</div>
          ${NOTIF_SEE_ALL}
        </div>
      </div>
      <div class="relative">
        <button id="userMenuBtn" type="button" class="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full hover:bg-slate-50 border border-transparent hover:border-gray-200 transition">
          <div class="w-8 h-8 rounded-full ${avatarClass} flex items-center justify-center text-white text-xs font-bold shrink-0"${avatarStyle}>${avatarInner}</div>
          <span class="text-sm font-semibold">${firstName}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-slate-400"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div id="userMenuDropdown" class="hidden absolute right-0 mt-2 w-52 bg-white border border-gray-100 rounded-xl shadow-lg py-2 z-50">
          ${session.slug === 'admin' ? '<a href="/admin" class="block px-4 py-2 text-sm font-bold text-purple-700 hover:bg-purple-50">Painel do administrador</a>' : ''}
          <a href="${profileHref}" class="block px-4 py-2 text-sm hover:bg-slate-50">Meu perfil</a>
          <a href="${walletHref}" class="block px-4 py-2 text-sm hover:bg-slate-50">Minha carteira</a>
          <button id="logoutBtn" type="button" class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Sair</button>
        </div>
      </div>`;
    const btn = document.getElementById('userMenuBtn');
    const dropdown = document.getElementById('userMenuDropdown');
    btn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('hidden'); document.getElementById('notifDropdown').classList.add('hidden'); });
    document.addEventListener('click', () => dropdown.classList.add('hidden'));
    document.getElementById('logoutBtn').addEventListener('click', () => {
      authLogout();
      window.location.href = '/';
    });

    const notifBtn = document.getElementById('notifBtn');
    const notifDropdown = document.getElementById('notifDropdown');
    const notifBadge = document.getElementById('notifBadge');
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle('hidden');
      dropdown.classList.add('hidden');
      if (!notifDropdown.classList.contains('hidden')) { bdayMarkNotificationsRead(); notifBadge.classList.add('hidden'); }
    });
    document.addEventListener('click', () => notifDropdown.classList.add('hidden'));
    notifDropdown.addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('notifMarkAllBtn').addEventListener('click', () => { bdayMarkNotificationsRead(); notifBadge.classList.add('hidden'); });
  }

  if (mobileArea) {
    mobileArea.innerHTML = `
      <div class="flex items-center gap-2.5 py-1">
        <div class="w-9 h-9 rounded-full ${avatarClass} flex items-center justify-center text-white text-sm font-bold shrink-0"${avatarStyle}>${avatarInner}</div>
        <div class="font-semibold text-sm">${u.name}</div>
      </div>
      <button id="notifBtnMobile" type="button" class="btn-secondary px-4 py-2 rounded-xl text-sm text-center inline-flex items-center justify-center gap-1.5 relative">
        ${NOTIF_ICON_BELL}
        Notificações
        <span id="notifBadgeMobile" class="${notifCount > 0 ? '' : 'hidden'} w-2 h-2 rounded-full bg-pink-500"></span>
      </button>
      <div id="notifListMobile" class="hidden rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">${notifListHTML(notifItems)}${NOTIF_SEE_ALL}</div>
      ${session.slug === 'admin' ? '<a href="/admin" class="btn-primary px-4 py-2 rounded-xl text-sm text-center font-bold">Painel do administrador</a>' : ''}
      <a href="${profileHref}" class="btn-secondary px-4 py-2 rounded-xl text-sm text-center">Meu perfil</a>
      <a href="${walletHref}" class="btn-secondary px-4 py-2 rounded-xl text-sm text-center">Minha carteira</a>
      <button id="logoutBtnMobile" type="button" class="text-sm font-semibold text-red-600 text-left">Sair</button>`;
    document.getElementById('logoutBtnMobile').addEventListener('click', () => {
      authLogout();
      window.location.href = '/';
    });
    document.getElementById('notifBtnMobile').addEventListener('click', () => {
      const list = document.getElementById('notifListMobile');
      list.classList.toggle('hidden');
      if (!list.classList.contains('hidden')) bdayMarkNotificationsRead();
      document.getElementById('notifBadgeMobile').classList.add('hidden');
    });
  }

  // Sino de notificações na barra do topo (só no mobile, só logado) — fica ao
  // lado do botão ≡. O ml-auto absorve o espaço livre do justify-between do
  // header, mantendo o sino colado no hambúrguer.
  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn && !document.getElementById('notifBtnTop')) {
    const wrap = document.createElement('div');
    wrap.className = 'relative md:hidden ml-auto mr-1';
    wrap.innerHTML = `
      <button id="notifBtnTop" type="button" title="Notificações" class="relative w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-purple-600 transition">
        ${NOTIF_ICON_BELL}
        <span id="notifBadgeTop" class="${notifCount > 0 ? '' : 'hidden'} absolute top-1 right-1.5 w-2 h-2 rounded-full bg-pink-500 border border-white"></span>
      </button>
      <div id="notifDropdownTop" class="hidden absolute right-0 mt-2 w-80 max-w-[calc(100vw-24px)] bg-white border border-gray-100 rounded-xl shadow-lg z-50 max-h-[70vh] overflow-y-auto">
        <div class="px-4 py-2.5 flex items-center justify-between border-b border-gray-50 sticky top-0 bg-white">
          <span class="font-bold text-sm">Notificações</span>
          <button id="notifMarkAllTopBtn" type="button" class="text-xs font-semibold text-purple-600 hover:underline">Marcar como lidas</button>
        </div>
        <div>${notifListHTML(notifItems)}</div>
        ${NOTIF_SEE_ALL}
      </div>`;
    menuBtn.parentElement.insertBefore(wrap, menuBtn);
    const bTop = document.getElementById('notifBtnTop');
    const ddTop = document.getElementById('notifDropdownTop');
    const badgeTop = document.getElementById('notifBadgeTop');
    bTop.addEventListener('click', (e) => {
      e.stopPropagation();
      ddTop.classList.toggle('hidden');
      if (!ddTop.classList.contains('hidden')) { bdayMarkNotificationsRead(); badgeTop.classList.add('hidden'); }
    });
    document.addEventListener('click', () => ddTop.classList.add('hidden'));
    ddTop.addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('notifMarkAllTopBtn').addEventListener('click', () => { bdayMarkNotificationsRead(); badgeTop.classList.add('hidden'); });
  }
}

// Propaga a sessão pelos links internos da página (acrescenta ?session=slug),
// para o login "atravessar" a navegação mesmo se o armazenamento não for
// compartilhado entre arquivos (comum ao abrir o protótipo via file://).
function authCarrySessionInLinks() {
  // Só é necessária ao abrir o protótipo direto do disco (file://), onde não há
  // cookies/localStorage compartilhados. No site real as URLs ficam limpas.
  if (window.location.protocol !== 'file:') return;
  const session = authGetSession();
  if (!session) return;
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || !/^\/[a-zA-Z0-9_\-]/.test(href)) return;
    const hashIdx = href.indexOf('#');
    const hash = hashIdx >= 0 ? href.slice(hashIdx) : '';
    const pathAndQuery = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    const qIdx = pathAndQuery.indexOf('?');
    const file = qIdx >= 0 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
    const params = new URLSearchParams(qIdx >= 0 ? pathAndQuery.slice(qIdx + 1) : '');
    params.set('session', session.slug);
    a.setAttribute('href', `${file}?${params.toString()}${hash}`);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  authRenderHeader();
  authCarrySessionInLinks();
});
