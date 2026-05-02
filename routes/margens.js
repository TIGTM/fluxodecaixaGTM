/**
 * routes/margens.js
 * GET /api/margens?meses=3
 *
 * Retorna faturamento, custo de MP e margem bruta POR FAMÍLIA DE PRODUTO
 * nos últimos N meses.
 *
 * Famílias: Tilápia, Salmão, Camarão, Merluza (+ Outros)
 * Fonte: TGFCAB JOIN TGFITE
 * CODCFOs:
 *   5101, 5102, 5124 → Vendas (receita)
 *   1201             → Devoluções (desconto na receita)
 *   2101, 1101, 1102 → Compras de MP (custo)
 */
import { Router } from 'express';
import { sql, inicioMes, hoje, dateParaSQL } from '../sankhya.js';

const router = Router();

// ─── Tabela de produtos → família (Tabela IND validada em memory.md) ─────────
const FAMILIA = {
  356: 'SALMÃO',   368: 'CAMARÃO',  370: 'CAMARÃO',  372: 'SALMÃO',
  374: 'SALMÃO',   381: 'TILÁPIA',  387: 'SALMÃO',   390: 'SALMÃO',
  391: 'TILÁPIA',  393: 'MERLUZA',  510: 'TILÁPIA',  517: 'SALMÃO',
  519: 'SALMÃO',   524: 'SALMÃO',   532: 'CAMARÃO',  539: 'CAMARÃO',
  547: 'CAMARÃO',  550: 'CAMARÃO',  582: 'TILÁPIA',  586: 'TILÁPIA',
  612: 'SALMÃO',   647: 'SALMÃO',   648: 'SALMÃO',   650: 'CAMARÃO',
  654: 'CAMARÃO',  655: 'CAMARÃO',  657: 'CAMARÃO',  661: 'CAMARÃO',
  664: 'CAMARÃO',  671: 'CAMARÃO',
  // MP conhecida (tilapia=581, camarão=335/334/336)
  581: 'TILÁPIA',  335: 'CAMARÃO',  334: 'CAMARÃO',  336: 'CAMARÃO',
  341: 'TILÁPIA',
};

function getFamilia(codprod) {
  return FAMILIA[Number(codprod)] || 'OUTROS';
}

// ─── GET /api/margens ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const meses  = Math.min(parseInt(req.query.meses || '3', 10), 12);
    const dtIni  = inicioMes(meses - 1);
    const dtFim  = hoje();

    // VENDAS e DEVOLUÇÕES
    const qVendas = `
      SELECT
        i.CODPROD,
        i.CODCFO,
        SUM(i.QTDNEG)  AS QTDKG,
        SUM(i.VLRTOT)  AS VLRTOT,
        CONVERT(VARCHAR(6), c.DTNEG, 112) AS MES_ANO
      FROM TGFCAB c
      JOIN TGFITE i ON i.NUNOTA = c.NUNOTA
      WHERE c.CODEMP = 2
        AND c.DTNEG >= '${dtIni}'
        AND c.DTNEG <= '${dtFim}'
        AND i.CODCFO IN (5101, 5102, 5124, 1201)
        AND i.SEQUENCIA > 0
      GROUP BY i.CODPROD, i.CODCFO, CONVERT(VARCHAR(6), c.DTNEG, 112)
    `;

    // COMPRAS DE MP
    const qCompras = `
      SELECT
        i.CODPROD,
        SUM(i.QTDNEG)  AS QTDKG,
        SUM(i.VLRTOT)  AS VLRTOT,
        CONVERT(VARCHAR(6), c.DTNEG, 112) AS MES_ANO
      FROM TGFCAB c
      JOIN TGFITE i ON i.NUNOTA = c.NUNOTA
      WHERE c.CODEMP = 2
        AND c.DTNEG >= '${dtIni}'
        AND c.DTNEG <= '${dtFim}'
        AND i.CODCFO IN (2101, 1101, 1102)
        AND i.SEQUENCIA > 0
      GROUP BY i.CODPROD, CONVERT(VARCHAR(6), c.DTNEG, 112)
    `;

    const [resVendas, resCompras] = await Promise.all([
      sql(qVendas),
      sql(qCompras),
    ]);

    // ── Agrega por família ───────────────────────────────────────────────────
    const familias = {};
    const garantirFamilia = (f) => {
      if (!familias[f]) familias[f] = { receita: 0, devolucoes: 0, custo_mp: 0, kg_vendido: 0, kg_comprado: 0 };
    };

    for (const row of resVendas.registros) {
      const f = getFamilia(row.CODPROD);
      garantirFamilia(f);
      const val = Number(row.VLRTOT || 0);
      const qtd = Number(row.QTDKG  || 0);
      if (Number(row.CODCFO) === 1201) {
        familias[f].devolucoes += val;
      } else {
        familias[f].receita    += val;
        familias[f].kg_vendido += qtd;
      }
    }

    for (const row of resCompras.registros) {
      const f = getFamilia(row.CODPROD);
      garantirFamilia(f);
      familias[f].custo_mp    += Number(row.VLRTOT || 0);
      familias[f].kg_comprado += Number(row.QTDKG  || 0);
    }

    // ── Monta resposta ───────────────────────────────────────────────────────
    const resultado = Object.entries(familias).map(([familia, v]) => {
      const receita_liq = v.receita - v.devolucoes;
      const margem_bruta = receita_liq - v.custo_mp;
      const margem_pct   = receita_liq > 0 ? (margem_bruta / receita_liq) * 100 : 0;
      const rendimento   = v.kg_comprado > 0 ? (v.kg_vendido / v.kg_comprado) * 100 : 0;
      return {
        familia,
        receita_bruta:  +v.receita.toFixed(2),
        devolucoes:     +v.devolucoes.toFixed(2),
        receita_liq:    +receita_liq.toFixed(2),
        custo_mp:       +v.custo_mp.toFixed(2),
        margem_bruta:   +margem_bruta.toFixed(2),
        margem_pct:     +margem_pct.toFixed(1),
        kg_vendido:     +v.kg_vendido.toFixed(0),
        kg_comprado:    +v.kg_comprado.toFixed(0),
        rendimento_pct: +rendimento.toFixed(1),
      };
    }).sort((a, b) => b.receita_liq - a.receita_liq);

    const totalReceita = resultado.reduce((s, r) => s + r.receita_liq, 0);
    const totalCusto   = resultado.reduce((s, r) => s + r.custo_mp,   0);
    const totalMargem  = totalReceita - totalCusto;

    // ── Evolução mensal ──────────────────────────────────────────────────────
    const mensal = {};
    for (const row of resVendas.registros) {
      const m = row.MES_ANO || '';
      const f = getFamilia(row.CODPROD);
      if (!mensal[m]) mensal[m] = {};
      if (!mensal[m][f]) mensal[m][f] = { receita: 0, custo_mp: 0 };
      if (Number(row.CODCFO) !== 1201) {
        mensal[m][f].receita += Number(row.VLRTOT || 0);
      }
    }
    for (const row of resCompras.registros) {
      const m = row.MES_ANO || '';
      const f = getFamilia(row.CODPROD);
      if (!mensal[m]) mensal[m] = {};
      if (!mensal[m][f]) mensal[m][f] = { receita: 0, custo_mp: 0 };
      mensal[m][f].custo_mp += Number(row.VLRTOT || 0);
    }

    // Converte MES_ANO YYYYMM → "MM/YYYY"
    const mesesOrdenados = Object.keys(mensal).sort();
    const evolucao = mesesOrdenados.map(m => ({
      mes:     `${m.substring(4,6)}/${m.substring(0,4)}`,
      mes_key: m,
      dados:   mensal[m],
    }));

    res.json({
      ok: true,
      periodo: { de: dtIni, ate: dtFim, meses },
      totais: {
        receita_liq: +totalReceita.toFixed(2),
        custo_mp:    +totalCusto.toFixed(2),
        margem_bruta:+totalMargem.toFixed(2),
        margem_pct:  +(totalReceita > 0 ? (totalMargem / totalReceita) * 100 : 0).toFixed(1),
      },
      por_familia: resultado,
      evolucao,
    });
  } catch (err) {
    console.error('[margens]', err.message);
    res.status(500).json({ ok: false, erro: err.message });
  }
});

export default router;
