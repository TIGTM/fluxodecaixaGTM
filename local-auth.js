import { promises as fs } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '.data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MIN_PASSWORD_LENGTH = Number(process.env.AUTH_MIN_PASSWORD_LENGTH || 4);

function normalizeLogin(login) {
  return String(login || '').trim().toLowerCase();
}

function toPublicUser(user) {
  return {
    id: user.id,
    login: user.login,
    nome: user.nome,
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

export async function cadastrarUsuarioLocal({ nome, login, senha }) {
  const loginRaw = String(login || '').trim();
  const senhaRaw = String(senha || '');
  const nomeRaw = String(nome || '').trim();

  if (!loginRaw || !senhaRaw) {
    return { ok: false, status: 400, erro: 'Informe usuario e senha.' };
  }
  if (senhaRaw.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      status: 400,
      erro: `Senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  const users = await readUsers();
  const loginNorm = normalizeLogin(loginRaw);
  if (users.some(u => normalizeLogin(u.loginNorm || u.login) === loginNorm)) {
    return { ok: false, status: 409, erro: 'Usuario ja cadastrado.' };
  }

  const novoUsuario = {
    id: crypto.randomUUID(),
    login: loginRaw,
    loginNorm,
    nome: nomeRaw || loginRaw,
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

  return { ok: true, user: toPublicUser(user) };
}
