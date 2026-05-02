/**
 * server.js — GTM Alimentos | Dashboard Financeiro
 * Porta padrão: 3400
 */
import 'dotenv/config';
import express    from 'express';
import cors       from 'cors';
import session    from 'express-session';
import rateLimit  from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path       from 'path';

import rotaFluxo, { _saldoRouter } from './routes/fluxo-caixa.js';
import rotaAging  from './routes/aging.js';
import rotaMargens from './routes/margens.js';
import rotaOps    from './routes/ops.js';
import { autenticarUsuarioLocal, cadastrarUsuarioLocal } from './local-auth.js';
import { sql }    from './sankhya.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
const PORT      = process.env.PORT || 3400;
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'fluxo-caixa-dev-change-me';

if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || SESSION_SECRET === 'fluxo-caixa-dev-change-me')) {
  throw new Error('SESSION_SECRET deve ser definido em producao com valor forte.');
}

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  const isHttps = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

app.use(session({
  name: 'fluxo.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
  },
}));

// Retorna JSON consistente quando body vier com JSON malformado.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ ok: false, erro: 'JSON invalido na requisicao.' });
  }
  return next(err);
});

// Rate limit: 120 req/min por IP
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max:      120,
  standardHeaders: true,
  legacyHeaders:   false,
}));

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 12,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, erro: 'Muitas tentativas de login. Aguarde alguns minutos.' },
});

const registerLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, erro: 'Muitas tentativas de cadastro. Tente novamente mais tarde.' },
});

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rotas de autenticação ───────────────────────────────────────────────────
function iniciarSessao(req, res, user, statusCode = 200) {
  req.session.regenerate((err) => {
    if (err) {
      console.error('[auth] Erro ao regenerar sessao:', err.message);
      return res.status(500).json({ ok: false, erro: 'Falha ao iniciar sessao.' });
    }

    req.session.user = {
      id: user.id,
      login: user.login,
      nome: user.nome,
      autenticadoEm: new Date().toISOString(),
    };

    return res.status(statusCode).json({ ok: true, user: req.session.user });
  });
}

app.post('/api/auth/register', registerLimiter, async (req, res) => {
  try {
    const { nome, login, senha, cpf } = req.body || {};
    const resultado = await cadastrarUsuarioLocal({ nome, login, senha, cpf });

    if (!resultado.ok) {
      return res.status(resultado.status || 400).json({ ok: false, erro: resultado.erro });
    }

    return iniciarSessao(req, res, resultado.user, 201);
  } catch (e) {
    return res.status(500).json({ ok: false, erro: e.message });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { login, senha } = req.body || {};
    const resultado = await autenticarUsuarioLocal(login, senha);

    if (!resultado.ok) {
      return res.status(resultado.status || 401).json({ ok: false, erro: resultado.erro });
    }

    return iniciarSessao(req, res, resultado.user);
  } catch (e) {
    return res.status(500).json({ ok: false, erro: e.message });
  }
});

app.get('/api/auth/session', (req, res) => {
  if (!req.session?.user) {
    return res.json({ ok: true, authenticated: false });
  }
  return res.json({ ok: true, authenticated: true, user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(() => {
    res.clearCookie('fluxo.sid');
    res.json({ ok: true });
  });
});

function exigirAutenticacaoApi(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/health') return next();
  if (req.path.startsWith('/auth/')) return next();
  if (req.session?.user?.login) return next();
  return res.status(401).json({ ok: false, erro: 'Nao autenticado.' });
}

app.use('/api', exigirAutenticacaoApi);

// ─── Rotas API ────────────────────────────────────────────────────────────────
app.use('/api/fluxo',   rotaFluxo);
app.use('/api/fluxo',   _saldoRouter);
app.use('/api/aging',   rotaAging);
app.use('/api/margens', rotaMargens);
app.use('/api/ops',     rotaOps);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), version: '1.0.0' });
});

// Empresas disponíveis (cache simples)
let _empresasCache = null;
app.get('/api/empresas', async (req, res) => {
  try {
    if (_empresasCache) return res.json({ ok: true, empresas: _empresasCache });
    const { registros } = await sql(
      `SELECT DISTINCT FIN.CODEMP, EMP.NOMEFANTASIA
       FROM TGFFIN FIN JOIN TSIEMP EMP ON EMP.CODEMP = FIN.CODEMP
       ORDER BY FIN.CODEMP`
    );
    _empresasCache = registros.map(r => ({
      codemp: r.CODEMP,
      nome:   (r.NOMEFANTASIA || '').trim(),
    }));
    res.json({ ok: true, empresas: _empresasCache });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// API desconhecida -> 404 JSON
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, erro: 'Rota de API nao encontrada.' });
});

// SPA fallback apenas para GET
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).send('Not Found');
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  GTM Alimentos — Dashboard Financeiro            ║`);
  console.log(`║  http://localhost:${PORT}                          ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
});
