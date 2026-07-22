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
// Funciona tanto para a listagem (/api/users) quanto para o perfil completo
// (/api/users/<slug>) — os agregados que faltarem chegam zerados.
function bdayGradFor(slug) {
  const grads = ['bg-blue-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-rose-500', 'bg-cyan-500', 'bg-violet-500'];
  return grads[Math.abs(hashCode(slug || '?')) % grads.length];
}
function bdayRecordFromApi(u) {
  const slug = u.slug;
  const name = (u.name || slug).trim();
  const initial = (name[0] || '?').toUpperCase();
  const grad = bdayGradFor(slug);
  const friendsList = Array.isArray(u.friendsList) ? u.friendsList.map(function (f) {
    return {
      slug: f.slug, name: f.name,
      initial: ((f.name || '?')[0] || '?').toUpperCase(),
      grad: bdayGradFor(f.slug || f.name),
      avatar: f.avatarUrl || null,
    };
  }) : [];
  const gifts = Array.isArray(u.gifts) ? u.gifts.map(function (g) {
    return { who: g.who, whoSlug: g.whoSlug || null, item: g.item, value: g.value || 0, msg: g.msg || '', when: g.when || '' };
  }) : [];
  const gg = u.groupGoal || null;
  const groupGoal = gg ? {
    id: gg.id || null, title: gg.title, target: gg.target, current: gg.current || 0,
    description: gg.description || '', category: gg.category || '', date: gg.date || '',
    image: gg.image || null,
    contributors: (gg.contributors || []).map(function (c) {
      return {
        name: c.name, slug: c.slug || null, amount: c.amount,
        initial: ((c.name || '?')[0] || '?').toUpperCase(),
        grad: bdayGradFor(c.slug || c.name),
      };
    }),
  } : null;
  return {
    name, handle: slug, initial, grad, email: null, avatar: u.avatarUrl || null,
    cover: u.coverUrl || null,
    status: u.bio || 'Bem-vindo(a) ao bday.fm',
    daysLabel: u.birthdayDayMonth || null,
    isToday: !!u.isToday,
    received: u.received || 0,
    friends: (typeof u.friends === 'number') ? u.friends : friendsList.length,
    friendsList: friendsList,
    giftsCount: u.giftsCount || 0,
    goal: groupGoal ? groupGoal.target : null,
    frame: u.frame || null, inBirthdayMonth: !!u.inBirthdayMonth,
    badge: u.badge || null,
    verified: !!u.verified,
    points: (typeof u.points === 'number') ? u.points : null,
    wonFrames: Array.isArray(u.wonFrames) ? u.wonFrames : [],
    wonBadges: Array.isArray(u.badges) ? u.badges : [],
    accessory: u.accessory || null,
    wonAccessories: Array.isArray(u.wonAccessories) ? u.wonAccessories : [],
    socials: u.socials || { instagram: null, tiktok: null, youtube: null, linkedin: null },
    gifts: gifts, groupGoal: groupGoal,
    recap: u.recap || { year: new Date().getFullYear(), totalReceived: 0, giftsReceived: 0, friendsParticipated: 0, topGifter: null, topGifterAmount: 0, topMessage: null, rankPercent: null },
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

// ---- Catálogo da Loja de Personalização (produto, não dado fictício) ----
// Cosmetic frames purchasable in the "Loja de Personalização" using wallet balance (or won for free via gifts)
const FRAMES = [
  { id: "aurora", name: "Moldura Aurora", price: 40, frameClass: "frame-aurora", desc: "Um anel de gradiente colorido girando ao redor do seu avatar." },
  { id: "estelar", name: "Moldura Estelar", price: 35, frameClass: "frame-estelar", desc: "Um brilho dourado pulsante, como uma constelação de estrelas." },
  { id: "aurea", name: "Moldura Áurea", price: 60, frameClass: "frame-aurea", desc: "Status vip com uma luz dourada passando pela moldura." },
  { id: "cristal", name: "Moldura Cristal", price: 30, frameClass: "frame-cristal", desc: "Um halo gelado, translúcido e moderno." },
];

// Emblemas conquistados ao receber presentes especiais (não são comprados, só ganhos)
// "icon" referencia uma chave de ICONS (icons.js) — nunca emoji.
const BADGES = [
  { id: "querido", name: "Querido(a)", icon: "heart", desc: "Recebeu presentes de pelo menos 5 amigos diferentes." },
  { id: "popular", name: "Popular", icon: "star", desc: "Recebeu mais de R$ 100 em presentes em um único mês." },
  { id: "veterano", name: "Veterano(a)", icon: "medal", desc: "Já comemorou 2 aniversários no bday.fm." },
];

// Acessórios de festa que ficam sobre o avatar — ganhos em presentes (wonAccessories) OU
// comprados na loja com o saldo da carteira (preço em "price", entre R$1 e R$5).
// Ilustração colorida "cheia" (sem contorno de linha, sem bolha de fundo), encostando direto
// no avatar — "style" é a posição/tamanho em % (relativos ao container do avatar) e "svg" é a
// ilustração em si. Desenho próprio, não copiado de nenhuma marca.
const ACCESSORIES = [
  {
    id: "confete", name: "Chuva de Confete", price: 1,
    desc: "Confete comemorativo flutuando sobre o seu avatar.",
    style: "top:-18%; left:50%; width:82%; height:60%; transform:translateX(-50%);",
    svg: `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect x="6" y="22" width="13" height="7" rx="2" fill="#7C3AED" stroke="#fff" stroke-width="1.5" transform="rotate(25 12 25)"/><rect x="74" y="8" width="11" height="7" rx="2" fill="#EC4899" stroke="#fff" stroke-width="1.5" transform="rotate(-20 79 11)"/><circle cx="50" cy="12" r="5.5" fill="#F59E0B" stroke="#fff" stroke-width="1.5"/><rect x="30" y="46" width="11" height="7" rx="2" fill="#10B981" stroke="#fff" stroke-width="1.5" transform="rotate(15 35 49)"/><circle cx="82" cy="50" r="4.5" fill="#0EA5E9" stroke="#fff" stroke-width="1.5"/><rect x="55" y="66" width="11" height="7" rx="2" fill="#F43F5E" stroke="#fff" stroke-width="1.5" transform="rotate(-30 60 69)"/><circle cx="14" cy="60" r="4.5" fill="#A78BFA" stroke="#fff" stroke-width="1.5"/><circle cx="64" cy="30" r="4" fill="#10B981" stroke="#fff" stroke-width="1.5"/></svg>`
  },
  {
    id: "laco", name: "Laço de Festa", price: 2,
    desc: "Um laço colorido decorando o seu avatar.",
    style: "bottom:-16%; left:50%; width:48%; height:34%; transform:translateX(-50%);",
    svg: `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M48 30 L14 9 Q4 6 7 21 L21 30 L7 39 Q4 54 14 51 Z" fill="#EC4899" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M52 30 L86 9 Q96 6 93 21 L79 30 L93 39 Q96 54 86 51 Z" fill="#EC4899" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="30" r="10" fill="#F43F5E" stroke="#fff" stroke-width="2"/></svg>`
  },
  {
    id: "balao", name: "Balão de Festa", price: 2,
    desc: "Um balãozinho colorido do lado do seu avatar.",
    style: "top:-46%; right:-16%; width:42%; height:60%; transform:rotate(8deg);",
    svg: `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><ellipse cx="50" cy="46" rx="36" ry="42" fill="#0EA5E9" stroke="#fff" stroke-width="2"/><ellipse cx="37" cy="30" rx="10" ry="14" fill="#fff" opacity="0.3"/><path d="M40 86 Q50 93 60 86 L55 102 L45 102 Z" fill="#0EA5E9" stroke="#fff" stroke-width="2"/><path d="M50 102 Q39 116 50 126 Q61 136 50 140" stroke="#94A3B8" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`
  },
  {
    id: "vela", name: "Velinha de Aniversário", price: 3,
    desc: "Uma velinha de bolo em cima do seu avatar.",
    style: "top:-30%; left:50%; width:26%; height:52%; transform:translateX(-50%) rotate(-4deg);",
    svg: `<svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><ellipse cx="30" cy="13" rx="9" ry="13" fill="#FDBA74"/><ellipse cx="30" cy="16" rx="5" ry="8" fill="#F59E0B"/><rect x="19" y="28" width="22" height="62" rx="5" fill="#EC4899" stroke="#fff" stroke-width="2"/><rect x="19" y="45" width="22" height="9" fill="#fff"/><rect x="19" y="66" width="22" height="9" fill="#fff"/></svg>`
  },
  {
    id: "chapeu-festa", name: "Chapéu de Festa", price: 4,
    desc: "Um chapeuzinho de festa em cima do seu avatar.",
    style: "top:-24%; left:50%; width:56%; height:56%; transform:translateX(-50%) rotate(-6deg);",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M50 6 L80 84 L20 84 Z" fill="#7C3AED" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M50 6 L61 36 L39 36 Z" fill="#EC4899"/><path d="M43 52 L57 52 L63 68 L37 68 Z" fill="#F59E0B"/><circle cx="45" cy="44" r="3.5" fill="#fff"/><circle cx="58" cy="60" r="3.5" fill="#fff"/><circle cx="39" cy="76" r="3.5" fill="#fff"/><ellipse cx="50" cy="84" rx="32" ry="7" fill="#EC4899" stroke="#fff" stroke-width="2"/><circle cx="50" cy="7" r="8" fill="#FDE68A" stroke="#fff" stroke-width="2"/></svg>`
  },
  {
    id: "coroa", name: "Coroa de Aniversariante", price: 5,
    desc: "Uma coroinha dourada para o rei ou rainha do dia.",
    style: "top:-22%; left:50%; width:60%; height:42%; transform:translateX(-50%);",
    svg: `<svg viewBox="0 0 100 76" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M12 50 L22 16 L38 38 L50 12 L62 38 L78 16 L88 50 Z" fill="#FBBF24" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><rect x="12" y="50" width="76" height="18" rx="4" fill="#F59E0B" stroke="#fff" stroke-width="2"/><circle cx="22" cy="16" r="4.5" fill="#fff"/><circle cx="50" cy="12" r="4.5" fill="#fff"/><circle cx="78" cy="16" r="4.5" fill="#fff"/><circle cx="34" cy="59" r="4" fill="#EC4899"/><circle cx="50" cy="59" r="4" fill="#0EA5E9"/><circle cx="66" cy="59" r="4" fill="#10B981"/></svg>`
  },
];



// ===== Contas criadas pelo formulário de Cadastro (sem backend real) =====
// Como o protótipo não tem servidor/banco de dados, uma conta criada em "Criar conta
// grátis" é guardada no armazenamento local deste navegador. Isso resolve o bug de
// sempre abrir o perfil da Ana: quem se cadastra passa a ter o próprio perfil de
// verdade (mesmo que só "de mentira" neste navegador), e quem faz login volta a cair
// exatamente na própria conta, não em uma conta fixa de demonstração.



// ---- Selo de verificação (premium) — concedido/revogado no painel admin ----
// Fonte da verdade: banco de dados (campo verified do usuário, via API).
const VERIFIED_DEFAULTS = [];
function getVerifiedMap() {
  try { return JSON.parse(localStorage.getItem('bdayfm_verified') || 'null') || {}; } catch (e) { return {}; }
}
function setUserVerified(slug, on) {
  // Persistência real acontece via PATCH /api/admin/users/<slug>; aqui só o cache local.
  if (USERS[slug]) USERS[slug].verified = !!on;
  const m = getVerifiedMap();
  m[slug] = !!on;
  try { localStorage.setItem('bdayfm_verified', JSON.stringify(m)); } catch (e) {}
}
function isUserVerified(slug) {
  const u = USERS[slug];
  if (u && typeof u.verified === 'boolean') return u.verified;
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
function pontosSaldo(slug) {
  // Fonte da verdade: servidor (ledger PointEntry). Cai no cálculo local só
  // quando o servidor não retornou pontos (ex.: sem rede).
  const u = (typeof USERS === 'object' && USERS[slug]) ? USERS[slug] : null;
  if (u && typeof u.points === 'number') return Math.max(0, u.points);
  const fetched = (typeof fetchRealUser === 'function') ? fetchRealUser(slug) : null;
  if (fetched && typeof fetched.points === 'number') return Math.max(0, fetched.points);
  return Math.max(0, pontosGanhos(slug) - pontosGastos(slug));
}
function pontosGastar(slug, valor) {
  // Gasto real acontece via POST /api/store/purchase (payWith: "points").
  if (pontosSaldo(slug) < valor) return false;
  if (USERS[slug] && typeof USERS[slug].points === 'number') {
    USERS[slug].points = Math.max(0, USERS[slug].points - valor);
    return true;
  }
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
// Cache em memória dos perfis completos buscados um a um (evita repetir o XHR).
const BDAY_FETCHED = {};
function fetchRealUser(slug) {
  if (BDAY_FETCHED[slug]) return BDAY_FETCHED[slug];
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
    const record = bdayRecordFromApi(u);
    BDAY_FETCHED[slug] = record;
    // Atualiza também o cache global usado pelas páginas.
    if (USERS[slug]) Object.assign(USERS[slug], record);
    return record;
  } catch (e) { return null; }
}

function findAnyUser(slug) {
  if (!slug) return null;
  // Fonte da verdade: o SERVIDOR (banco de dados). O perfil completo (amigos,
  // presentes, meta, recap, pontos) vem de /api/users/<slug>; a listagem
  // (/api/users) serve de base rápida. O localStorage é só um resquício de
  // compatibilidade para contas antigas puramente locais — nunca sobrescreve
  // dados reais do servidor.
  if (slug === 'admin') return { ...ADMIN_PROFILE, slug };
  const fetched = fetchRealUser(slug);
  if (fetched) return { ...fetched, slug };
  if (USERS[slug]) return { ...USERS[slug], slug };
  const custom = getCustomUsers();
  if (custom[slug]) {
    const cu = { ...custom[slug], slug };
    if (cu.status === 'Conta criada recentemente') cu.status = 'Bem-vindo(a) ao bday.fm';
    return cu;
  }
  return null;
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
  try { window.location.href = '/login'; } catch (e) {}
  return { name: '', handle: '', initial: '?', grad: 'bg-slate-400', avatar: null,
    status: '', daysLabel: null, isToday: false, received: 0, friends: 0, friendsList: [],
    giftsCount: 0, goal: null, frame: null, inBirthdayMonth: false, wonFrames: [], wonBadges: [],
    accessory: null, wonAccessories: [], socials: {}, gifts: [], groupGoal: null,
    recap: { year: 2025, totalReceived: 0, giftsReceived: 0, friendsParticipated: 0, topGifter: null, topGifterAmount: 0, topMessage: null, rankPercent: null }, slug: '' };
}
