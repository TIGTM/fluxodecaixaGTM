/**
 * routes/ops.js
 * GET /api/ops/abertas — OPs em andamento com previsão de faturamento
 * GET /api/ops/resumo  — Contadores por status
 *
 * Fonte: TPRIPROC (cabeçalho do processo) + TPRIPA (produto acabado)
 * Campos validados em GTM_ALIMENTOS_CONTEXTO_COMPLETO.md
 */
import { Router } from 'express';
import { sql } from '../sankhya.js';

const router = Router();

// Status legíveis
const STATUS_LABELS = {
  'A': 'Aberta',
  'E': 'Em Produção',
  'C': 'Concluída',
  'P': 'Planejada',
  'I': 'Iniciada',
  'F': 'Finalizada',
};

// Mapa CODPROD → nome (dos 30 produtos PA conhecidos)
const PROD_LABEL = {
  356: 'Filé Salmão CG Granel',       368: 'Camarão CZ 100-120 PCT 200g',
  370: 'Camarão CZ 71-90 PCT 200g',   372: 'Filé Salmão Salar 1500/2000g',
  374: 'Filé Salmão Coho 1500/2000g', 381: 'Filé Tilápia PCT 800g MG',
  387: 'Pedaço Filé Salmão PCT 500g', 390: 'Pedaço Filé Salmão Vácuo',
  391: 'Filé Tilápia PCT 800g QP',    393: 'Filé Merluza PCT 500g',
  510: 'Filé Tilápia PCT 400g QP',    517: 'Filé Salmão PC',
  519: 'Filé Salmão CG Granel QP',    524: 'Filé Salmão Coho Granel',
  532: 'Camarão CZ SC COZ PCT 200g',  539: 'Camarão CZ SC COZ PCT 400g',
  547: 'Camarão CZ INT COZ PCT 200g', 550: 'Camarão CZ INT COZ PCT 400g',
  582: 'Tilápia Inteira Glaceada',    586: 'Filé Tilápia Granel',
  612: 'Filé Salmão Coho Vácuo',      647: 'Salmão Defumado Fatiado',
  648: 'Salmão Defumado Inteiro',     650: 'Camarão VAN 41-50',
  654: 'Camarão VAN 26-30',           655: 'Camarão VAN 21-25',
  657: 'Camarão VAN 16-20',           661: 'Camarão VAN 13-15',
  664: 'Camarão VAN 11-13',           671: 'Camarão VAN 8-12',
};

// GET /api/ops/abertas
router.get('/abertas', async (req, res) => {
  try {
    const query = `
      SELECT TOP 100
        I.IDIPROC,
        I.NROLOTE,
        I.STATUSPROC,
        CONVERT(VARCHAR(10), I.DTPREVENT, 103) AS DTPREVENT_FMT,
        CONVERT(VARCHAR(8),  I.DTPREVENT, 112) AS DTPREVENT_SQL,
        A.CODPRODPA,
        A.QTDPRODUZIR,
        A.CONCLUIDO,
        CONVERT(VARCHAR(10), A.DTVAL, 103) AS DTVAL_FMT,
        CONVERT(VARCHAR(10), A.DTFAB, 103) AS DTFAB_FMT
      FROM TPRIPROC I
      JOIN TPRIPA   A ON A.IDIPROC = I.IDIPROC
      WHERE I.STATUSPROC NOT IN ('C', 'F')
      ORDER BY I.IDIPROC DESC
    `;

    const { registros } = await sql(query);

    const ops = registros.map(row => ({
      idiproc:       row.IDIPROC,
      lote:          row.NROLOTE || '-',
      status:        STATUS_LABELS[row.STATUSPROC] || row.STATUSPROC || '-',
      status_cod:    row.STATUSPROC,
      prev_entrega:  row.DTPREVENT_FMT || '-',
      produto_cod:   Number(row.CODPRODPA),
      produto_nome:  PROD_LABEL[Number(row.CODPRODPA)] || `Produto ${row.CODPRODPA}`,
      qtd_produzir:  Number(row.QTDPRODUZIR || 0),
      concluido:     row.CONCLUIDO === 'S',
      dt_val:        row.DTVAL_FMT || '-',
      dt_fab:        row.DTFAB_FMT || '-',
    }));

    // Totais por status
    const porStatus = {};
    for (const op of ops) {
      const s = op.status;
      if (!porStatus[s]) porStatus[s] = { count: 0, kg_total: 0 };
      porStatus[s].count++;
      porStatus[s].kg_total += op.qtd_produzir;
    }

    // Totais por família
    const FAMILIA = {
      356:'SALMÃO',372:'SALMÃO',374:'SALMÃO',387:'SALMÃO',390:'SALMÃO',517:'SALMÃO',519:'SALMÃO',524:'SALMÃO',612:'SALMÃO',647:'SALMÃO',648:'SALMÃO',
      381:'TILÁPIA',391:'TILÁPIA',510:'TILÁPIA',582:'TILÁPIA',586:'TILÁPIA',341:'TILÁPIA',581:'TILÁPIA',
      368:'CAMARÃO',370:'CAMARÃO',532:'CAMARÃO',539:'CAMARÃO',547:'CAMARÃO',550:'CAMARÃO',650:'CAMARÃO',654:'CAMARÃO',655:'CAMARÃO',657:'CAMARÃO',661:'CAMARÃO',664:'CAMARÃO',671:'CAMARÃO',
      393:'MERLUZA',
    };
    const porFamilia = {};
    for (const op of ops) {
      const f = FAMILIA[op.produto_cod] || 'OUTROS';
      if (!porFamilia[f]) porFamilia[f] = { count: 0, kg_total: 0 };
      porFamilia[f].count++;
      porFamilia[f].kg_total += op.qtd_produzir;
    }

    res.json({
      ok:          true,
      total:       ops.length,
      por_status:  porStatus,
      por_familia: porFamilia,
      ops,
    });
  } catch (err) {
    console.error('[ops/abertas]', err.message);
    res.status(500).json({ ok: false, erro: err.message });
  }
});

export default router;
