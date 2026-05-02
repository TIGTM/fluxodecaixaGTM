/**
 * routes/aging.js
 * GET /api/aging?tipo=R|P|ambos&dtIni=YYYYMMDD&dtFim=YYYYMMDD
 *
 * Retorna aging (vencimento) de títulos em aberto, agrupado em faixas:
 *   Vencido +60d | Vencido 31-60 | Vencido 1-30 | A vencer 0-30 | A vencer +30
 *
 * Além das faixas: retorna lista detalhada por parceiro (top 20).
 * Fonte: TGFFIN JOIN TGFPAR
 */
import { Router } from 'express';
import { sql, hoje, dateParaSQL } from '../sankhya.js';

function sanitize(s) {
  if (!s) return null;
  const c = s.replace(/-/g,'').trim().substring(0,8);
  return /^\d{8}$/.test(c) ? c : null;
}

const router = Router();

function empFiltro(codemp) {
  const c = parseInt(codemp, 10);
  return Number.isInteger(c) && c > 0 ? `AND FIN.CODEMP = ${c}` : '';
}

// ─── GET /api/aging ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const tipo = (req.query.tipo || 'ambos').toUpperCase();
    const filtroTipo = tipo === 'R' ? 'AND FIN.RECDESP = 1'
                     : tipo === 'P' ? 'AND FIN.RECDESP = -1'
                     : 'AND FIN.RECDESP IN (1, -1)';
    const emp = empFiltro(req.query.codemp);
    const dtHoje = hoje(); // YYYYMMDD

    // Filtro de período opcional — restringe DTVENC ao intervalo
    const dtIni = sanitize(req.query.dtIni);
    const dtFim = sanitize(req.query.dtFim);
    const filtroPeriodo = dtIni && dtFim
      ? `AND FIN.DTVENC >= '${dtIni}' AND FIN.DTVENC <= '${dtFim}'`
      : dtIni
      ? `AND FIN.DTVENC >= '${dtIni}'`
      : dtFim
      ? `AND FIN.DTVENC <= '${dtFim}'`
      : '';

    const query = `
      SELECT TOP 500
        PAR.NOMEPARC,
        FIN.RECDESP,
        CONVERT(VARCHAR(8), FIN.DTVENC, 112) AS DT_VENC,
        SUM(FIN.VLRDESDOB - ISNULL(FIN.VLRBAIXA, 0)) AS VALOR_PENDENTE,
        COUNT(*) AS QTD_TITULOS
      FROM TGFFIN FIN
      JOIN TGFPAR PAR ON PAR.CODPARC = FIN.CODPARC
      WHERE (FIN.VLRDESDOB - ISNULL(FIN.VLRBAIXA, 0)) > 0
        AND FIN.PROVISAO = 'N'
        AND FIN.DHBAIXA IS NULL
        ${filtroTipo} ${emp} ${filtroPeriodo}
      GROUP BY PAR.NOMEPARC, FIN.RECDESP, CONVERT(VARCHAR(8), FIN.DTVENC, 112)
      ORDER BY DT_VENC
    `;

    const { registros } = await sql(query);

    const hoje_dt = new Date();
    hoje_dt.setHours(0, 0, 0, 0);

    // Classifica cada registro em faixas
    const faixas = {
      vencido_mais60: 0,
      vencido_31_60:  0,
      vencido_1_30:   0,
      a_vencer_0_30:  0,
      a_vencer_mais30:0,
    };

    // Mapa por parceiro → { recpag, faixas }
    const porParceiro = {};

    for (const row of registros) {
      const valor = Number(row.VALOR_PENDENTE || 0);
      if (valor <= 0) continue;

      const dtStr = (row.DT_VENC || '').trim();
      // DT_VENC está no formato YYYYMMDD (CONVERT varchar 112)
      let dtVenc = null;
      if (dtStr.length === 8) {
        dtVenc = new Date(`${dtStr.substring(0,4)}-${dtStr.substring(4,6)}-${dtStr.substring(6,8)}T00:00:00`);
      }

      let diasAtraso = 0;
      if (dtVenc) {
        diasAtraso = Math.floor((hoje_dt - dtVenc) / (1000 * 60 * 60 * 24));
      }

      // Classifica em faixa
      let faixa;
      if (diasAtraso > 60)       faixa = 'vencido_mais60';
      else if (diasAtraso > 30)  faixa = 'vencido_31_60';
      else if (diasAtraso > 0)   faixa = 'vencido_1_30';
      else if (diasAtraso >= -30) faixa = 'a_vencer_0_30';
      else                        faixa = 'a_vencer_mais30';

      faixas[faixa] += valor;

      // Por parceiro
      const nome = (row.NOMEPARC || 'Desconhecido').trim();
      const rp   = Number(row.RECDESP) === 1 ? 'R' : 'P';
      const key  = `${nome}|${rp}`;
      if (!porParceiro[key]) {
        porParceiro[key] = {
          nome,
          recpag:          rp,
          vencido_mais60:  0,
          vencido_31_60:   0,
          vencido_1_30:    0,
          a_vencer_0_30:   0,
          a_vencer_mais30: 0,
          total:           0,
        };
      }
      porParceiro[key][faixa] += valor;
      porParceiro[key].total  += valor;
    }

    // Top 20 parceiros por valor total
    const listaParceiros = Object.values(porParceiro)
      .sort((a, b) => b.total - a.total)
      .slice(0, 20)
      .map(p => ({
        ...p,
        vencido_mais60:  +p.vencido_mais60.toFixed(2),
        vencido_31_60:   +p.vencido_31_60.toFixed(2),
        vencido_1_30:    +p.vencido_1_30.toFixed(2),
        a_vencer_0_30:   +p.a_vencer_0_30.toFixed(2),
        a_vencer_mais30: +p.a_vencer_mais30.toFixed(2),
        total:           +p.total.toFixed(2),
      }));

    // Arredonda faixas
    Object.keys(faixas).forEach(k => { faixas[k] = +faixas[k].toFixed(2); });

    const totalGeral = Object.values(faixas).reduce((s, v) => s + v, 0);

    res.json({
      ok: true,
      tipo,
      data_referencia: hoje_dt.toLocaleDateString('pt-BR'),
      dtIni: dtIni || null,
      dtFim: dtFim || null,
      faixas,
      total: +totalGeral.toFixed(2),
      por_parceiro: listaParceiros,
    });
  } catch (err) {
    console.error('[aging]', err.message);
    res.status(500).json({ ok: false, erro: err.message });
  }
});

// ─── GET /api/aging/detalhe ───────────────────────────────────────────────────
// Retorna títulos individuais de uma faixa específica para drill-down
router.get('/detalhe', async (req, res) => {
  try {
    const tipo  = (req.query.tipo  || 'ambos').toUpperCase();
    const faixa = (req.query.faixa || '').toLowerCase();
    const emp   = empFiltro(req.query.codemp);

    const filtroTipo = tipo === 'R' ? 'AND FIN.RECDESP = 1'
                     : tipo === 'P' ? 'AND FIN.RECDESP = -1'
                     : 'AND FIN.RECDESP IN (1, -1)';

    // Calcula datas no Node e passa como string YYYYMMDD
    const hoje_dt = new Date();
    hoje_dt.setHours(0, 0, 0, 0);

    const toSQL = d => {
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      return `${y}${m}${day}`;
    };

    const addDias = n => {
      const d = new Date(hoje_dt);
      d.setDate(d.getDate() + n);
      return d;
    };

    let filtroDatas;
    switch (faixa) {
      case 'vencido_mais60':
        filtroDatas = `AND FIN.DTVENC < '${toSQL(addDias(-60))}'`;
        break;
      case 'vencido_31_60':
        filtroDatas = `AND FIN.DTVENC >= '${toSQL(addDias(-60))}' AND FIN.DTVENC < '${toSQL(addDias(-30))}'`;
        break;
      case 'vencido_1_30':
        filtroDatas = `AND FIN.DTVENC >= '${toSQL(addDias(-30))}' AND FIN.DTVENC < '${toSQL(hoje_dt)}'`;
        break;
      case 'a_vencer_0_30':
        filtroDatas = `AND FIN.DTVENC >= '${toSQL(hoje_dt)}' AND FIN.DTVENC <= '${toSQL(addDias(30))}'`;
        break;
      case 'a_vencer_mais30':
        filtroDatas = `AND FIN.DTVENC > '${toSQL(addDias(30))}'`;
        break;
      case 'vencido_todos':
        filtroDatas = `AND FIN.DTVENC < '${toSQL(hoje_dt)}'`;
        break;
      default:
        return res.status(400).json({ ok: false, erro: `Faixa inválida: ${faixa}` });
    }

    const query = `
      SELECT TOP 300
        FIN.NUFIN,
        FIN.NUMNOTA,
        PAR.NOMEPARC,
        FIN.RECDESP,
        CONVERT(VARCHAR(10), FIN.DTVENC, 103) AS DT_VENC_FMT,
        FIN.VLRDESDOB,
        ISNULL(FIN.VLRBAIXA, 0) AS VLRBAIXA,
        (FIN.VLRDESDOB - ISNULL(FIN.VLRBAIXA, 0)) AS VLRPENDENTE,
        FIN.DESDOBRAMENTO,
        FIN.CODTIPTIT AS TIPO_TITULO
      FROM TGFFIN FIN
      JOIN TGFPAR PAR ON PAR.CODPARC = FIN.CODPARC
      WHERE (FIN.VLRDESDOB - ISNULL(FIN.VLRBAIXA, 0)) > 0
        AND FIN.PROVISAO = 'N'
        AND FIN.DHBAIXA IS NULL
        ${filtroTipo}
        ${filtroDatas} ${emp}
      ORDER BY FIN.DTVENC ASC, PAR.NOMEPARC
    `;

    const { registros } = await sql(query);

    const titulos = registros.map(r => ({
      nufin:       r.NUFIN,
      numnota:     r.NUMNOTA,
      parceiro:    (r.NOMEPARC || '').trim(),
      tipo:        Number(r.RECDESP) === 1 ? 'Receber' : 'Pagar',
      vencimento:  (r.DT_VENC_FMT || '').trim(),
      valor:       +Number(r.VLRDESDOB   || 0).toFixed(2),
      baixado:     +Number(r.VLRBAIXA    || 0).toFixed(2),
      pendente:    +Number(r.VLRPENDENTE || 0).toFixed(2),
      desdobramento: r.DESDOBRAMENTO,
      tipo_titulo: (r.TIPO_TITULO || '').trim(),
    }));

    const totalPendente = titulos.reduce((s, t) => s + t.pendente, 0);

    res.json({
      ok: true,
      faixa,
      tipo,
      total_titulos: titulos.length,
      total_pendente: +totalPendente.toFixed(2),
      titulos,
    });
  } catch (err) {
    console.error('[aging/detalhe]', err.message);
    res.status(500).json({ ok: false, erro: err.message });
  }
});

export default router;

