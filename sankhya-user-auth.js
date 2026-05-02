import axios from 'axios';

const MGE_BASE_URL = (process.env.SANKHYA_MGE_URL || 'http://gtm.nuvemdatacom.com.br:9745').trim().replace(/\/+$/, '');
const OAUTH_AUTH_URL = 'https://api.sankhya.com.br/authenticate';
const LOGIN_TIMEOUT_MS = Number(process.env.SANKHYA_LOGIN_TIMEOUT_MS || 20000);

function text(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return String(node).trim();
  }
  if (typeof node === 'object' && '$' in node) {
    return String(node.$ || '').trim();
  }
  return '';
}

function sanitizeCData(value) {
  return String(value || '').replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function decodeMaybeBase64(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const compact = raw.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(compact) || compact.length % 4 !== 0) {
    return raw;
  }

  try {
    const buffer = Buffer.from(compact, 'base64');
    const utf8 = buffer.toString('utf8').replace(/\0/g, '').trim();
    const latin1 = buffer.toString('latin1').replace(/\0/g, '').trim();

    if (utf8.includes('�') && !latin1.includes('�') && /[A-Za-zÀ-ÿ]/.test(latin1)) {
      return latin1;
    }
    if (/[A-Za-zÀ-ÿ]/.test(utf8)) return utf8;
    if (/[A-Za-zÀ-ÿ]/.test(latin1)) return latin1;

    return raw;
  } catch {
    return raw;
  }
}

function extractXmlTag(xml, tagName) {
  const xmlText = String(xml || '');
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlText.match(regex);
  if (!match) return '';

  const value = String(match[1] || '').trim();
  const cdata = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return cdata ? cdata[1] : value;
}

function parseXmlLoginResponse(xmlBody) {
  const xml = String(xmlBody || '');
  const statusMatch = xml.match(/<serviceResponse\b[^>]*\bstatus="([^"]+)"/i);
  const status = String(statusMatch?.[1] || '0');

  const statusMessageRaw = extractXmlTag(xml, 'statusMessage');
  const statusMessage = text(decodeMaybeBase64(statusMessageRaw));

  const nome =
    text(extractXmlTag(xml, 'NOMEUSU')) ||
    text(extractXmlTag(xml, 'NOMUSU')) ||
    text(extractXmlTag(xml, 'nomeusu'));

  return {
    status,
    statusMessage: statusMessage || 'Usuario ou senha invalidos.',
    nome,
  };
}

function parseJsonLoginResponse(payload) {
  const data = payload || {};
  const sr = data?.serviceResponse || data;

  const status = String(sr?.status || data?.status || '0');
  const statusMessage =
    text(sr?.statusMessage) ||
    text(data?.statusMessage) ||
    text(sr?.responseBody?.tsException?.message) ||
    'Usuario ou senha invalidos.';

  const nome =
    text(sr?.responseBody?.NOMEUSU) ||
    text(sr?.responseBody?.NOMUSU) ||
    text(sr?.responseBody?.nomeusu) ||
    text(sr?.NOMEUSU) ||
    text(sr?.NOMUSU) ||
    text(sr?.nomeusu);

  return { status, statusMessage, nome };
}

function erroResposta(statusMessage) {
  return statusMessage || 'Usuario ou senha invalidos.';
}

function deveTentarJson(message) {
  return /formato de envio.*xml|requisi..o http/i.test(String(message || '').toLowerCase());
}

async function tentarLoginOAuthPassword(usuario, senhaTexto) {
  const clientId = process.env.SANKHYA_CLIENT_ID;
  const clientSecret = process.env.SANKHYA_CLIENT_SECRET;
  const appkey = process.env.SANKHYA_APPKEY;

  if (!clientId || !clientSecret || !appkey) {
    return { suportado: false };
  }

  const corpo = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username: usuario,
    password: senhaTexto,
  });

  try {
    const response = await axios.post(OAUTH_AUTH_URL, corpo.toString(), {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'X-Token': appkey,
      },
      timeout: LOGIN_TIMEOUT_MS,
      validateStatus: () => true,
    });

    const data = response.data || {};
    if (response.status === 200 && data.access_token) {
      return {
        suportado: true,
        ok: true,
        usuario,
        nome: usuario,
      };
    }

    const code = String(data.error || '').toLowerCase();
    const descricao = text(data.error_description) || text(data.message);

    if (code === 'unsupported_grant_type') {
      return { suportado: false };
    }

    if (code === 'invalid_grant') {
      return {
        suportado: true,
        ok: false,
        status: 401,
        erro: 'Usuário/Senha inválido.',
      };
    }

    return {
      suportado: true,
      ok: false,
      status: 502,
      erro: `Falha ao validar login no OAuth Sankhya: ${descricao || `HTTP ${response.status}`}`,
    };
  } catch (error) {
    return {
      suportado: true,
      ok: false,
      status: 502,
      erro: `Falha ao validar login no OAuth Sankhya: ${error.message}`,
    };
  }
}

async function tentarLoginXml(url, usuario, senhaTexto, interno = '0') {
  const payloadXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<serviceRequest serviceName="MobileLoginSP.login">` +
    `<requestBody>` +
    `<NOMUSU><![CDATA[${sanitizeCData(usuario)}]]></NOMUSU>` +
    `<SENHA><![CDATA[${sanitizeCData(senhaTexto)}]]></SENHA>` +
    `<KEEPCONNECTED><![CDATA[S]]></KEEPCONNECTED>` +
    `<INTERNO><![CDATA[${sanitizeCData(interno)}]]></INTERNO>` +
    `</requestBody>` +
    `</serviceRequest>`;

  const response = await axios.post(url, payloadXml, {
    params: { serviceName: 'MobileLoginSP.login' },
    headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
    timeout: LOGIN_TIMEOUT_MS,
    transformResponse: [raw => raw],
    validateStatus: () => true,
  });

  const parsed = parseXmlLoginResponse(response.data);
  return {
    httpStatus: Number(response.status || 0),
    status: parsed.status,
    statusMessage: parsed.statusMessage,
    nome: parsed.nome,
  };
}

async function tentarLoginJson(url, usuario, senhaTexto, interno = '0') {
  const payload = {
    serviceRequest: {
      serviceName: 'MobileLoginSP.login',
      requestBody: {
        NOMUSU: { $: usuario },
        INTERNO: { $: interno },
        SENHA: { $: senhaTexto },
        KEEPCONNECTED: { $: 'S' },
      },
    },
  };

  const response = await axios.post(url, payload, {
    params: { serviceName: 'MobileLoginSP.login', outputType: 'json' },
    headers: { 'Content-Type': 'application/json' },
    timeout: LOGIN_TIMEOUT_MS,
    validateStatus: () => true,
  });

  const parsed = parseJsonLoginResponse(response.data);
  return {
    httpStatus: Number(response.status || 0),
    status: parsed.status,
    statusMessage: parsed.statusMessage,
    nome: parsed.nome,
  };
}

async function autenticarComUsuario(url, usuario, senhaTexto) {
  try {
    let ultimoErro = { ok: false, status: 401, erro: 'Usuario ou senha invalidos.' };

    for (const interno of ['0', '1']) {
      const xmlAttempt = await tentarLoginXml(url, usuario, senhaTexto, interno);
      if (xmlAttempt.status === '1') {
        return {
          ok: true,
          usuario,
          nome: xmlAttempt.nome || usuario,
        };
      }

      if (!deveTentarJson(xmlAttempt.statusMessage)) {
        ultimoErro = {
          ok: false,
          status: 401,
          erro: erroResposta(xmlAttempt.statusMessage),
        };
        continue;
      }

      const jsonAttempt = await tentarLoginJson(url, usuario, senhaTexto, interno);
      if (jsonAttempt.status === '1') {
        return {
          ok: true,
          usuario,
          nome: jsonAttempt.nome || usuario,
        };
      }

      ultimoErro = {
        ok: false,
        status: 401,
        erro: erroResposta(jsonAttempt.statusMessage),
      };
    }

    return ultimoErro;
  } catch (error) {
    const detalhe =
      text(error?.response?.data?.statusMessage) ||
      text(error?.response?.data?.message) ||
      error.message;

    return {
      ok: false,
      status: 502,
      erro: `Falha ao validar login no Sankhya: ${detalhe}`,
    };
  }
}

export async function autenticarUsuarioSankhya(login, senha) {
  const usuario = String(login || '').trim();
  const senhaTexto = String(senha || '');

  if (!usuario || !senhaTexto) {
    return { ok: false, status: 400, erro: 'Informe usuario e senha.' };
  }

  let ultimoErro = { ok: false, status: 401, erro: 'Usuario ou senha invalidos.' };

  // Tentativa 1: OAuth password grant (canal oficial da API Sankhya Cloud).
  const oauth = await tentarLoginOAuthPassword(usuario, senhaTexto);
  if (oauth.suportado) {
    if (oauth.ok) return oauth;
    ultimoErro = { ok: false, status: oauth.status || 401, erro: oauth.erro || ultimoErro.erro };
    if ((oauth.status || 401) !== 401) return ultimoErro;
  }

  // Tentativa 2: MobileLoginSP direto no MGE (fallback para ambientes legados/on-prem).
  const url = `${MGE_BASE_URL}/mge/service.sbr`;
  const candidatos = [usuario];
  const usuarioMaiusculo = usuario.toUpperCase();
  if (usuarioMaiusculo !== usuario) candidatos.push(usuarioMaiusculo);

  for (const candidato of candidatos) {
    const resultado = await autenticarComUsuario(url, candidato, senhaTexto);
    if (resultado.ok) return resultado;

    ultimoErro = resultado;
    if (resultado.status !== 401) return resultado;
  }

  return ultimoErro;
}
