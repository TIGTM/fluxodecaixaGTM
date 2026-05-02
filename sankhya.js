/**
 * sankhya.js — Camada de acesso SQL direto ao Sankhya
 * Usa DbExplorerSP.executeQuery via Gateway OAuth 2.0
 *
 * Banco: SQL Server
 * Datas no WHERE: YYYYMMDD sem separador (ex: '20260401')
 * Retorno de datas: DDMMYYYY HH:MM:SS (ex: "01042026 00:00:00")
 */
import axios from 'axios';
import { invalidarToken, obterToken } from './auth.js';

const URL_GATEWAY = 'https://api.sankhya.com.br/gateway/v1/mge/service.sbr';

/**
 * Executa SQL direto via DbExplorerSP.executeQuery
 * @param {string} sql - SQL Server syntax
 * @returns {Promise<{colunas: string[], registros: object[], total: number}>}
 */
function ehNaoAutorizado(msg) {
  const s = String(msg || '');
  return /n[aã]o autorizado|unauthorized/i.test(s);
}

function erroNaoAutorizado() {
  const e = new Error('[sql] Não autorizado.');
  e.code = 'UNAUTHORIZED';
  return e;
}

async function executarSqlComToken(query, token) {

  let resposta;
  try {
    resposta = await axios.post(
      URL_GATEWAY,
      { serviceName: 'DbExplorerSP.executeQuery', requestBody: { sql: query } },
      {
        params:  { serviceName: 'DbExplorerSP.executeQuery', outputType: 'json' },
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );
  } catch (err) {
    const detalhe =
      err.response?.data?.statusMessage ||
      err.response?.data?.responseBody?.tsException?.message ||
      err.message;
    if (err.response?.status === 401 || err.response?.status === 403 || ehNaoAutorizado(detalhe)) {
      throw erroNaoAutorizado();
    }
    throw new Error(`[sql] HTTP error: ${detalhe}`);
  }

  const dados = resposta.data;
  const body  = dados?.responseBody;

  if (!body || (!body.rows && !body.fieldsMetadata)) {
    const msg = dados?.statusMessage || dados?.responseBody?.tsException?.message || 'Sem dados';
    if (ehNaoAutorizado(msg)) throw erroNaoAutorizado();
    throw new Error(`[sql] ${msg}`);
  }

  const colunas   = (body.fieldsMetadata ?? []).map(f => f.name);
  const rows      = Array.isArray(body.rows) ? body.rows : [];
  const registros = rows.map(row =>
    Array.isArray(row)
      ? Object.fromEntries(colunas.map((col, i) => [col, row[i] ?? null]))
      : row
  );

  return { colunas, registros, total: rows.length };
}

export async function sql(query) {
  try {
    const token = await obterToken();
    return await executarSqlComToken(query, token);
  } catch (err) {
    if (err?.code !== 'UNAUTHORIZED') throw err;

    // Token pode ter expirado no gateway; força nova autenticacao e tenta 1 vez.
    invalidarToken();
    const novoToken = await obterToken();
    return executarSqlComToken(query, novoToken);
  }
}

// ─── Utilitários de data ──────────────────────────────────────────────────────

/** Hoje como string YYYYMMDD para uso em WHERE SQL */
export function hoje()      { return dateParaSQL(new Date()); }

/** N dias a partir de hoje como string YYYYMMDD */
export function diasApos(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dateParaSQL(d);
}

/** Primeiro dia do mês atual YYYYMMDD */
export function inicioMes(mesesAtras = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - mesesAtras);
  return dateParaSQL(d);
}

/** Converte Date → YYYYMMDD */
export function dateParaSQL(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const d2 = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${d2}`;
}

/**
 * Parse data Sankhya: "DDMMYYYY HH:MM:SS" → Date
 * Retorna null se inválida.
 */
export function parseDateSankhya(str) {
  if (!str || str === 'null' || str.trim() === '') return null;
  const s = str.trim();
  // Formato DDMMYYYY HH:MM:SS
  if (s.length >= 8) {
    const dia = s.substring(0, 2);
    const mes = s.substring(2, 4);
    const ano = s.substring(4, 8);
    return new Date(`${ano}-${mes}-${dia}T00:00:00`);
  }
  return null;
}

/** Formata Date → DD/MM/YYYY */
export function fmtData(d) {
  if (!d) return '-';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
