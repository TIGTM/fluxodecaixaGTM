import { promises as fs } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '.data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ALLOWED_CPFS_FILE = path.resolve(__dirname, process.env.AUTH_ALLOWED_CPFS_FILE || path.join('.data', 'allowed-cpfs.json'));
const MIN_PASSWORD_LENGTH = Number(process.env.AUTH_MIN_PASSWORD_LENGTH || 8);
const REQUIRE_STRONG_PASSWORD = String(process.env.AUTH_REQUIRE_STRONG_PASSWORD || 'true').toLowerCase() !== 'false';
const REQUIRE_CPF_ALLOWLIST = String(process.env.AUTH_REQUIRE_CPF_ALLOWLIST || 'true').toLowerCase() !== 'false';

function normalizeCpf(cpf) {
  return String(cpf || '').replace(/\D+/g, '');
}

function cpfEhValido(cpfNorm) {
  if (!/^\d{11}$/.test(cpfNorm)) return false;
  if (/^(\d)\1{10}$/.test(cpfNorm)) return false;

  const calcDigito = (base, fatorInicial) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * (fatorInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const d1 = calcDigito(cpfNorm.slice(0, 9), 10);
  if (d1 !== Number(cpfNorm[9])) return false;

  const d2 = calcDigito(cpfNorm.slice(0, 10), 11);
  return d2 === Number(cpfNorm[10]);
}

function parseCpfList(value) {
  return String(value || '')
    .split(/[\s,;|]+/)
    .map(normalizeCpf)
    .filter(Boolean);
}

function parseCpfPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'string') return parseCpfList(payload);
  if (payload && Array.isArray(payload.cpfs)) return payload.cpfs;
  return [];
}

async function loadAllowedCpfSet() {
  const cpfs = new Set(parseCpfList(process.env.AUTH_ALLOWED_CPFS));

  try {
    const raw = await fs.readFile(ALLOWED_CPFS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const fromFile = parseCpfPayload(parsed)
      .map(normalizeCpf)
      .filter(Boolean);

    fromFile.forEach((cpf) => cpfs.add(cpf));
  } catch (e) {
    if (e?.code !== 'ENOENT') {
      console.warn('[auth] Falha ao carregar whitelist de CPF:', e.message);
    }
  }

  return cpfs;
}

function senhaEhForte(senha) {
  if (!REQUIRE_STRONG_PASSWORD) return true;
  const possuiLetra = /[A-Za-z]/.test(senha);
  const possuiNumero = /\d/.test(senha);
  return possuiLetra && possuiNumero;
}

function normalizeLogin(login) {
  return String(login || '').trim().toLowerCase();
}

function toPublicUser(user) {
  return {
    id: user.id,
    login: user.login,
    nome: user.nome,
    cpfFinal: user.cpfNorm ? user.cpfNorm.slice(-4) : undefined,
    criadoEm: user.criadoEm,
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHex] = String(storedHash || '').split(':');
  if (!salt || !expectedHex) return false;

  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;

  return crypto.timingSafeEqual(actual, expected);
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, '[]', 'utf8');
  }
}

async function readUsers() {
  await ensureStore();
  const raw = await fs.readFile(USERS_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

export async function cadastrarUsuarioLocal({ nome, login, senha, cpf }) {
  const loginRaw = String(login || '').trim();
  const senhaRaw = String(senha || '');
  const nomeRaw = String(nome || '').trim();
  const cpfNorm = normalizeCpf(cpf);

  if (!loginRaw || !senhaRaw || !cpfNorm) {
    return { ok: false, status: 400, erro: 'Informe nome, usuario, senha e CPF.' };
  }

  if (!cpfEhValido(cpfNorm)) {
    return { ok: false, status: 400, erro: 'CPF invalido.' };
  }

  if (senhaRaw.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      status: 400,
      erro: `Senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  if (!senhaEhForte(senhaRaw)) {
    return {
      ok: false,
      status: 400,
      erro: 'Senha deve conter pelo menos uma letra e um numero.',
    };
  }

  const users = await readUsers();
  const loginNorm = normalizeLogin(loginRaw);

  if (users.some(u => normalizeLogin(u.loginNorm || u.login) === loginNorm)) {
    return { ok: false, status: 409, erro: 'Usuario ja cadastrado.' };
  }

  if (users.some(u => normalizeCpf(u.cpfNorm || u.cpf) === cpfNorm)) {
    return { ok: false, status: 409, erro: 'CPF ja cadastrado.' };
  }

  if (REQUIRE_CPF_ALLOWLIST) {
    const allowedCpfSet = await loadAllowedCpfSet();
    if (!allowedCpfSet.size) {
      return {
        ok: false,
        status: 403,
        erro: 'Cadastro indisponivel. Contate o administrador.',
      };
    }

    if (!allowedCpfSet.has(cpfNorm)) {
      return {
        ok: false,
        status: 403,
        erro: 'Cadastro nao autorizado para este CPF.',
      };
    }
  }

  const novoUsuario = {
    id: crypto.randomUUID(),
    login: loginRaw,
    loginNorm,
    nome: nomeRaw || loginRaw,
    cpfNorm,
    senhaHash: hashPassword(senhaRaw),
    criadoEm: new Date().toISOString(),
  };

  users.push(novoUsuario);
  await writeUsers(users);

  return { ok: true, user: toPublicUser(novoUsuario) };
}

export async function autenticarUsuarioLocal(login, senha) {
  const loginRaw = String(login || '').trim();
  const senhaRaw = String(senha || '');

  if (!loginRaw || !senhaRaw) {
    return { ok: false, status: 400, erro: 'Informe usuario e senha.' };
  }

  const users = await readUsers();
  const loginNorm = normalizeLogin(loginRaw);
  const user = users.find(u => normalizeLogin(u.loginNorm || u.login) === loginNorm);

  if (!user || !verifyPassword(senhaRaw, user.senhaHash)) {
    return { ok: false, status: 401, erro: 'Usuario ou senha invalidos.' };
  }

  if (REQUIRE_CPF_ALLOWLIST) {
    const allowedCpfSet = await loadAllowedCpfSet();
    if (!allowedCpfSet.size) {
      return {
        ok: false,
        status: 403,
        erro: 'Login indisponivel. Contate o administrador.',
      };
    }

    const userCpfNorm = normalizeCpf(user.cpfNorm || user.cpf);
    if (!userCpfNorm) {
      return {
        ok: false,
        status: 403,
        erro: 'Usuario sem CPF autorizado. Contate o administrador.',
      };
    }

    if (!allowedCpfSet.has(userCpfNorm)) {
      return {
        ok: false,
        status: 403,
        erro: 'CPF sem permissao de acesso.',
      };
    }
  }

  return { ok: true, user: toPublicUser(user) };
}
