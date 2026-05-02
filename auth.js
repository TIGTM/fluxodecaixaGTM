/**
 * auth.js — Autenticação OAuth 2.0 Sankhya
 * GTM Alimentos / FluxoCaixaGTM
 */
import axios from 'axios';

const AUTH_URL       = 'https://api.sankhya.com.br/authenticate';
const RENOVAR_ANTES  = 290 * 1000; // renova 10s antes de expirar

let token    = null;
let tokenExp = null;
let authPromise = null;

async function autenticar() {
  const clientId     = process.env.SANKHYA_CLIENT_ID;
  const clientSecret = process.env.SANKHYA_CLIENT_SECRET;
  const appkey       = process.env.SANKHYA_APPKEY;

  if (!clientId || !clientSecret || !appkey) {
    throw new Error('Credenciais Sankhya não configuradas. Verifique o .env');
  }

  const corpo = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
  });

  const resp = await axios.post(AUTH_URL, corpo.toString(), {
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'X-Token':      appkey,
    },
  }).catch((err) => {
    const detalhe = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Falha OAuth (${err.response?.status ?? 'network'}): ${detalhe}`);
  });

  const { access_token } = resp.data;
  if (!access_token) throw new Error('Resposta OAuth sem access_token');

  token    = access_token;
  tokenExp = Date.now() + RENOVAR_ANTES;
  return token;
}

export async function obterToken() {
  const expirado = !token || !tokenExp || Date.now() >= tokenExp;
  if (expirado) {
    if (!authPromise) {
      authPromise = autenticar().finally(() => {
        authPromise = null;
      });
    }
    await authPromise;
  }
  return token;
}

export function invalidarToken() {
  token = null;
  tokenExp = null;
}
