// Anti-XSS: remove os caracteres < e > de qualquer texto digitado pelo usuário
// antes de salvar/exibir (nome, bio, posts, comentários, título/descrição do BDAY).
function bdaySanitize(str) {
  return String(str == null ? '' : str).replace(/[<>]/g, '').trim();
}

// bday.fm prototype — shared demo user data (fake, for illustration only)

// Usuários reais — carregados do servidor (banco de dados) na abertura da página.
// A antiga lista fictícia de demonstração foi removida: tudo aqui vem do cadastro real.
const USERS = {};
const USERS_ORDER = [];

// Converte o perfil público retornado pela API no formato que as páginas esperam.
function bdayRecordFromApi(u) {
  const slug = u.slug;
  const name = (u.name || slug).trim();
  const initial = (name[0] || '?').toUpperCase();
  const grads = ['bg-blue-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-rose-500', 'bg-cyan-500', 'bg-violet-500'];
  const grad = grads[Math.abs(hashCode(slug)) % grads.length];
  return {
    name, handle: slug, initial, grad, email: null, avatar: u.avatarUrl || null,
    status: u.bio || 'Bem-vindo(a) ao bday.fm',
    daysLabel: u.birthdayDayMonth || null,
    isToday: !!u.isToday,
    received: 0, friends: 0, friendsList: [], giftsCount: 0, goal: null,
    frame: u.frame || null, inBirthdayMonth: !!u.inBirthdayMonth,
    wonFrames: [], wonBadges: Array.isArray(u.badges) ? u.badges : [],
    accessory: u.accessory || null, wonAccessories: [],
    socials: u.socials || { instagram: null, tiktok: null, youtube: null, linkedin: null },
    gifts: [], groupGoal: null,
    recap: { year: 2025, totalReceived: 0, giftsReceived: 0, friendsParticipated: 0, topGifter: null, topGifterAmount: 0, topMessage: null, rankPercent: null },
    slug,
  };
}

// Popula USERS/USERS_ORDER com as contas reais. Síncrono de propósito: os scripts
// das páginas leem USERS logo em seguida, no mesmo tick.
(function bdayLoadRealUsers() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/users?limit=200', false);
    xhr.send(null);
    if (xhr.status !== 200) return;
    const data = JSON.parse(xhr.responseText || '{}');
    (data.users || []).forEach((u) => {
      if (!u || !u.slug) return;
      USERS[u.slug] = bdayRecordFromApi(u);
      USERS_ORDER.push(u.slug);
    });
  } catch (e) { /* sem rede (ex.: abrir o arquivo direto) — listas ficam vazias */ }
})();

// ===== Contas criadas pelo formulário de Cadastro (sem backend real) =====
// Como o protótipo não tem servidor/banco de dados, uma conta criada em "Criar conta
// grátis" é guardada no armazenamento local deste navegador. Isso resolve o bug de
// sempre abrir o perfil da Ana: quem se cadastra passa a ter o próprio perfil de
// verdade (mesmo que só "de mentira" neste navegador), e quem faz login volta a cair
// exatamente na própria conta, não em uma conta fixa de demonstração.



// ---- Selo de verificação (premium) — concedido/revogado no painel admin ----
// Estado em localStorage (bdayfm_verified: { slug: true/false }); alguns perfis
// de demonstração já nascem verificados por padrão.
const VERIFIED_DEFAULTS = [];
function getVerifiedMap() {
  try { return JSON.parse(localStorage.getItem('bdayfm_verified') || 'null') || {}; } catch (e) { return {}; }
}
function setUserVerified(slug, on) {
  const m = getVerifiedMap();
  m[slug] = !!on;
  try { localStorage.setItem('bdayfm_verified', JSON.stringify(m)); } catch (e) {}
}
function isUserVerified(slug) {
  const m = getVerifiedMap();
  if (slug in m) return !!m[slug];
  return VERIFIED_DEFAULTS.includes(slug);
}

// ---- Pontos de recompensa (ganhos enviando presentes na Loja; resgatados no perfil) ----
const PONTOS_POR_ENVIO = 40;
const PONTOS_BONUS_MISSAO = 80;   // ao completar 3 envios na semana
// Custo em pontos dos itens de personalização do perfil
const RESGATE_PONTOS = {
  frames: { cristal: 120, estelar: 160, aurora: 240, aurea: 400 },
  accessories: { confete: 80, laco: 120, balao: 120, vela: 200, coroa: 320 },
};
function pontosEnvios(slug) {
  try {
    let l = JSON.parse(localStorage.getItem('bdayfm_loja_envios_' + slug) || 'null');
    if (!l) {
      // migração: a primeira versão guardava os envios sem separar por usuário
      const antigo = JSON.parse(localStorage.getItem('bdayfm_loja_envios') || 'null');
      if (antigo && antigo.length) {
        l = antigo;
        localStorage.setItem('bdayfm_loja_envios_' + slug, JSON.stringify(l));
        localStorage.removeItem('bdayfm_loja_envios');
      }
    }
    return l || [];
  } catch (e) { return []; }
}
function pontosRegistrarEnvio(slug, nome) {
  if (!slug || !nome) return;
  const l = pontosEnvios(slug);
  l.push({ nome, ts: Date.now() });
  try { localStorage.setItem('bdayfm_loja_envios_' + slug, JSON.stringify(l)); } catch (e) {}
}
function pontosGastos(slug) {
  try { return JSON.parse(localStorage.getItem('bdayfm_pontos_gastos_' + slug) || '0') || 0; } catch (e) { return 0; }
}
function pontosGanhos(slug) {
  const envios = pontosEnvios(slug);
  const semana = envios.filter(e => Date.now() - e.ts < 7 * 86400000).length;
  return envios.length * PONTOS_POR_ENVIO + (semana >= 3 ? PONTOS_BONUS_MISSAO : 0);
}
function pontosSaldo(slug) { return Math.max(0, pontosGanhos(slug) - pontosGastos(slug)); }
function pontosGastar(slug, valor) {
  if (pontosSaldo(slug) < valor) return false;
  try { localStorage.setItem('bdayfm_pontos_gastos_' + slug, JSON.stringify(pontosGastos(slug) + valor)); } catch (e) { return false; }
  return true;
}

const CUSTOM_USERS_KEY = 'bdayfm_custom_users';

function getCustomUsers() {
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOM_USERS_KEY) || '{}');
    // Migração: contas criadas antes da correção nasciam com uma meta automática
    // (R$ 200) sem o usuário nunca ter criado um BDAY. A meta só existe quando
    // vem de um BDAY — zera qualquer meta solta dessas contas antigas.
    let migrated = false;
    Object.values(all).forEach(u => {
      if (u && u.goal != null && !u.groupGoal) { u.goal = null; migrated = true; }
    });
    if (migrated) { try { localStorage.setItem(CUSTOM_USERS_KEY, JSON.stringify(all)); } catch (e) {} }
    return all;
  } catch (e) { return {}; }
}

function saveCustomUser(user) {
  const all = getCustomUsers();
  all[user.slug] = user;
  try { localStorage.setItem(CUSTOM_USERS_KEY, JSON.stringify(all)); } catch (e) {}
}

function isSlugTaken(slug) {
  return !!USERS[slug] || !!getCustomUsers()[slug];
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return hash;
}

// Gera um @ (nome de usuário) limpo a partir do texto digitado no cadastro — minúsculas,
// sem acento, só letras/números/ponto — e garante que não colida com um @ já existente
// (das contas de demonstração ou de outra conta já criada neste navegador).
function slugifyUsername(raw) {
  let base = (raw || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.]/g, '');
  if (!base) base = 'usuario';
  let slug = base;
  let i = 2;
  while (isSlugTaken(slug)) { slug = `${base}${i}`; i++; }
  return slug;
}

// Cria o registro de um novo usuário a partir dos dados do formulário de cadastro.
function createCustomUser({ name, slug, email, birthdate }) {
  const initial = (name.trim()[0] || '?').toUpperCase();
  const grads = ['bg-blue-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-rose-500', 'bg-cyan-500', 'bg-violet-500'];
  const grad = grads[Math.abs(hashCode(slug)) % grads.length];
  const user = {
    name: name.trim(), handle: slug, initial, grad, email, avatar: null,
    status: 'Bem-vindo(a) ao bday.fm', daysLabel: null, isToday: false,
    received: 0, friends: 0, friendsList: [], giftsCount: 0, goal: null,
    frame: null, inBirthdayMonth: false, wonFrames: [], wonBadges: [], accessory: null, wonAccessories: [],
    socials: { instagram: null, tiktok: null, youtube: null, linkedin: null },
    gifts: [], groupGoal: null,
    recap: { year: 2025, totalReceived: 0, giftsReceived: 0, friendsParticipated: 0, topGifter: null, topGifterAmount: 0, topMessage: null, rankPercent: null },
  };
  saveCustomUser({ ...user, slug });
  return { ...user, slug };
}

// Busca um usuário tanto nos perfis fixos de demonstração (USERS) quanto nos criados
// neste navegador via cadastro (localStorage) — usada por getUserFromQuery e pelo
// cabeçalho logado (auth.js), para que os dois "conheçam" contas criadas de verdade.
// Perfil da conta admin — não fica dentro de USERS (nem de USERS_ORDER) de propósito:
// assim ela não aparece em Explorar/Feed/ranking nem na lista de usuários do próprio
// painel admin, mas ainda resolve normalmente por findAnyUser() para o cabeçalho do
// site público mostrar "logado" ao navegar via "Ver site". Saldo alto de propósito
// (usado de verdade como saldo gastável na Loja de Personalização) para o admin poder
// testar qualquer fluxo sem ficar limitado por saldo.
const ADMIN_PROFILE = {
  name: "Admin", handle: "admin", initial: "A", grad: "grad-bg",
  status: "Conta administrativa", daysLabel: "—", isToday: false,
  received: 999999, friends: 0, friendsList: [], giftsCount: 0, goal: null,
  frame: null, inBirthdayMonth: false, wonFrames: [], wonBadges: [], accessory: null, wonAccessories: [],
  socials: { instagram: null, tiktok: null, youtube: null, linkedin: null },
  gifts: [], groupGoal: null,
  recap: { year: 2025, totalReceived: 0, giftsReceived: 0, friendsParticipated: 0, topGifter: null, topGifterAmount: 0, topMessage: null, rankPercent: 0 }
};


// Busca o usuário REAL no servidor (conta criada de verdade via cadastro/login) e
// grava uma cópia local no formato que as páginas do site esperam. Usa XHR síncrono
// de propósito: o fluxo de renderização das páginas é todo síncrono, e esta consulta
// acontece no máximo uma vez por slug (depois fica em cache via saveCustomUser).
function fetchRealUser(slug) {
  try { if (sessionStorage.getItem('bdayfm_miss_' + slug)) return null; } catch (e) {}
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/users/' + encodeURIComponent(slug), false); // síncrono
    xhr.send(null);
    if (xhr.status !== 200) {
      try { sessionStorage.setItem('bdayfm_miss_' + slug, '1'); } catch (e) {}
      return null;
    }
    const data = JSON.parse(xhr.responseText || '{}');
    const u = data && data.user;
    if (!u) return null;
    const name = (u.name || slug).trim();
    const initial = (name[0] || '?').toUpperCase();
    const grads = ['bg-blue-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-rose-500', 'bg-cyan-500', 'bg-violet-500'];
    const grad = grads[Math.abs(hashCode(slug)) % grads.length];
    const record = {
      name, handle: u.slug || slug, initial, grad, email: null, avatar: u.avatarUrl || null,
      status: u.bio || 'Bem-vindo(a) ao bday.fm', daysLabel: null, isToday: false,
      received: 0, friends: 0, friendsList: [], giftsCount: 0, goal: null,
      frame: u.frame || null, inBirthdayMonth: false, wonFrames: [], wonBadges: Array.isArray(u.badges) ? u.badges : [],
      accessory: u.accessory || null, wonAccessories: [],
      socials: u.socials || { instagram: null, tiktok: null, youtube: null, linkedin: null },
      gifts: [], groupGoal: null,
      recap: { year: 2025, totalReceived: 0, giftsReceived: 0, friendsParticipated: 0, topGifter: null, topGifterAmount: 0, topMessage: null, rankPercent: null },
      slug: u.slug || slug,
    };
    saveCustomUser(record);
    return record;
  } catch (e) { return null; }
}

function findAnyUser(slug) {
  if (!slug) return null;
  // Contas fixas de demonstração (ana, rafael... e a admin) começam só como objeto
  // em memória — mas qualquer edição feita nelas (perfil, moldura, acessório, emblema,
  // compras na loja) é gravada em getCustomUsers() do mesmo jeito que uma conta criada
  // pelo cadastro (ver persistIfCustomUser em perfil.html e persistirConquistas em
  // loja.html). Por isso o registro customizado tem PRIORIDADE aqui: se existir, ele é
  // mesclado por cima do perfil fixo (que serve de base — amigos, presentes, recap etc.
  // continuam vindo do fixo, só o que foi de fato alterado é sobrescrito).
  const base = slug === 'admin' ? ADMIN_PROFILE : (USERS[slug] || null);
  const custom = getCustomUsers();
  if (custom[slug]) {
    const cu = { ...(base || {}), ...custom[slug], slug };
    // Contas criadas antes da mensagem de boas-vindas existir ficaram com o texto
    // antigo "Conta criada recentemente" salvo no navegador — normaliza aqui na
    // leitura, sem precisar que a pessoa edite o perfil pra corrigir.
    if (cu.status === 'Conta criada recentemente') cu.status = 'Bem-vindo(a) ao bday.fm';
    return cu;
  }
  if (base) return { ...base, slug };
  // Não está nos perfis de demonstração nem nos criados neste navegador:
  // procura a conta REAL no servidor antes de desistir.
  return fetchRealUser(slug);
}

function getUserFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('user');
  const found = findAnyUser(slug);
  if (found) return found;
  // Sem ?user= válido na URL: se houver alguém logado, abre o perfil de quem está
  // logado — em vez de sempre cair no perfil fixo da Ana.
  const session = (typeof authGetSession === 'function') ? authGetSession() : null;
  const ownProfile = session && findAnyUser(session.slug);
  if (ownProfile) return ownProfile;
  // Nenhuma conta válida: volta para o login (não existe mais perfil fictício padrão).
  try { window.location.href = 'login.html'; } catch (e) {}
  return { name: '', handle: '', initial: '?', grad: 'bg-slate-400', avatar: null,
    status: '', daysLabel: null, isToday: false, received: 0, friends: 0, friendsList: [],
    giftsCount: 0, goal: null, frame: null, inBirthdayMonth: false, wonFrames: [], wonBadges: [],
    accessory: null, wonAccessories: [], socials: {}, gifts: [], groupGoal: null,
    recap: { year: 2025, totalReceived: 0, giftsReceived: 0, friendsParticipated: 0, topGifter: null, topGifterAmount: 0, topMessage: null, rankPercent: null }, slug: '' };
}
