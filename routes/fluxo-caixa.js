/**
 * routes/fluxo-caixa.js
 * GET /api/fluxo/hoje
 * GET /api/fluxo/projecao?dtIni=YYYYMMDD&dtFim=YYYYMMDD
 */
import { Router } from 'express';
import { sql, hoje } from '../sankhya.js';

const router = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────
function strToDate(yyyymmdd) {
  const y = parseInt(yyyymmdd.substring(0, 4), 10);
  const m = parseInt(yyyymmdd.substring(4, 6), 10) - 1;
  const d = parseInt(yyyymmdd.substring(6, 8), 10);
  return new Date(y, m, d);
}

function dateToStr(dt) {
  return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
}

function dateFmt(s) {
  return `${s.substring(6, 8)}/${s.substring(4, 6)}/${s.substring(0, 4)}`;
}

function yyyymmddToIso(s) {
  return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
}

function addDias(yyyymmdd, n) {
  const dt = strToDate(yyyymmdd);
  dt.setDate(dt.getDate() + n);
  return dateToStr(dt);
}

function sanitize(s) {
  if (!s) return null;
  const c = String(s).replace(/-/g, '').trim().substring(0, 8);
  return /^\d{8}$/.test(c) ? c : null;
}

function money(v) {
  return +Number(v || 0).toFixed(2);
}

function inSql(values) {
  return values.map(v => `'${String(v)}'`).join(', ');
}

function parseEmpresasFiltro(codemp) {
  const c = parseInt(codemp, 10);
  if (Number.isInteger(c) && c > 0) return [c];
  return [1, 2, 3, 4, 5];
}

// Mesmo conjunto do gadget "FLUXO DE CAIXA GTM" capturado no Monitor de Consultas.
const CODNAT_IN = `
  '0', '1010101', '1010102', '1010103', '1010104', '1010105', '1010106', '1010107', '1010112',
  '1020200', '1030101', '2010101', '2020101', '3010101', '3010102', '3010301', '3010302',
  '3020101', '3020102', '3020103', '3020104', '3020105', '3020202', '3020203', '3020204',
  '3020205', '3020206', '3020207', '4010101', '4010102', '4010103', '4010104', '4010105',
  '4010107', '4010108', '4010109', '4010201', '4010202', '4010203', '4010205', '4010301',
  '4010302', '4010303', '4010304', '4010305', '4010306', '4010307', '4010308', '4010309',
  '4010310', '4010311', '4010312', '4010317', '4010319', '4020102', '4020103', '4020202',
  '4030106', '4030107', '4030201', '4030203', '4030204', '4030205', '4030302', '4030303',
  '4030304', '4030402', '4030404', '5010101', '5010102', '5010103', '5010104', '5010105',
  '5010106', '5010107', '5010108', '5010112', '5010113', '5010114', '5010116', '5010117',
  '5010118', '5010119', '5010120', '5010121', '5010122', '5010201', '5010204', '5010205',
  '5010206', '5010301', '5010302', '5010303', '5010401', '5010402', '5010403', '5010404',
  '5010405', '5010501', '5010502', '5010503', '5010504', '5010505', '5010508', '5010509',
  '5010601', '5010602', '5010603', '5010604', '5010607', '5010608', '5010609', '5010610',
  '5010611', '5010612', '5010613', '5010614', '5010615', '5010616', '5010617', '5010618',
  '5010623', '5010624', '5010626', '5010701', '5010702', '5010703', '5010801', '5010802',
  '5010803', '5010804', '6010102', '6010103', '6010105', '6010106', '6020101', '6020102',
  '7010101', '7010102', '7010105', '7010106', '7010108', '7010110', '7020101', '8010101',
  '8010103'
`;

const CODCTA_IN = `
  '0', '4', '5', '6', '7', '9', '10', '11', '14', '15', '16', '24', '27', '28', '30', '31',
  '32', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'
`;

const CODCENCUS_IN = `
  '0', '10101', '10201', '10202', '10203', '10204', '10205', '10206', '10208', '10301',
  '10302', '10303', '10401', '20101', '20102', '20103', '20104', '20105', '20107', '20108',
  '20201', '20203', '20204', '20301', '20302', '20303', '20304', '20401', '20501', '30000',
  '40100', '40101', '40204', '40205', '40206', '40207', '90102'
`;

function fromResumoSankhya() {
  return `
    FROM  DUAL
      ,TGFPAR PAR
      ,TSIEMP EMP
      ,TGFTIT TIT
      ,TGFFIN FIN
      LEFT JOIN TGFNAT NAT ON NAT.CODNAT = FIN.CODNAT
      LEFT JOIN TSICTA CTA ON CTA.CODCTABCOINT = FIN.CODCTABCOINT
      LEFT JOIN TSICUS CUS ON CUS.CODCENCUS = FIN.CODCENCUS
      LEFT JOIN VGFFIN ON (FIN.NUFIN = VGFFIN.NUFIN)
  `;
}

function whereResumoSankhya({ empresas, recdesp, dtIso, operador }) {
  const empIn = inSql(empresas);
  const recFiltro = Array.isArray(recdesp)
    ? `FIN.RECDESP IN (${recdesp.join(', ')})`
    : `FIN.RECDESP = ${recdesp}`;

  return `
    WHERE CAST(FIN.DTVENC AS DATE) ${operador} CAST('${dtIso}' AS DATE)
      AND FIN.CODTIPTIT = TIT.CODTIPTIT
      AND ${recFiltro}
      AND FIN.DHBAIXA IS NULL
      AND FIN.PROVISAO = 'N'
      AND PAR.CODPARC = FIN.CODPARC
      AND FIN.CODEMP = EMP.CODEMP
      AND FIN.CODEMP IN (${empIn})
      AND FIN.CODNAT IN (${CODNAT_IN})
      AND (CTA.ATIVA IN ('S') OR (CTA.CODCTABCOINT IS NULL))
      AND ISNULL(CTA.CODCTABCOINT,0) IN (${CODCTA_IN})
      AND FIN.CODCENCUS IN (${CODCENCUS_IN})
      AND CTA.CODEMP IN (${empIn})
  `;
}

async function totalResumo({ empresas, recdesp, dtIso, operador }) {
  return sql(`
    SELECT
      SUM(FIN.VLRDESDOB)      AS VALOR,
      SUM(VGFFIN.VLRLIQUIDO)  AS VALORLIQ
    ${fromResumoSankhya()}
    ${whereResumoSankhya({ empresas, recdesp, dtIso, operador })}
  `);
}

async function qtdHoje({ empresas, recdesp, dtIso }) {
  const { registros } = await sql(`
    SELECT COUNT(*) AS QTD
    ${fromResumoSankhya()}
    ${whereResumoSankhya({ empresas, recdesp, dtIso, operador: '=' })}
  `);
  return Number(registros[0]?.QTD || 0);
}

async function topPagarHoje({ empresas, dtIso }) {
  const { registros } = await sql(`
    SELECT TOP 5
      RTRIM(PAR.NOMEPARC) AS NOMEPARC,
      SUM(FIN.VLRDESDOB)  AS VALOR
    ${fromResumoSankhya()}
    ${whereResumoSankhya({ empresas, recdesp: -1, dtIso, operador: '=' })}
    GROUP BY PAR.NOMEPARC
    ORDER BY VALOR DESC
  `);
  return registros;
}

async function atrasosTopReceber({ empresas, dtIso }) {
  const { registros } = await sql(`
    SELECT TOP 5
      RTRIM(PAR.NOMEPARC) AS NOMEPARC,
      CONVERT(VARCHAR(8), MIN(CAST(FIN.DTVENC AS DATE)), 112) AS DT_VENC,
      SUM(FIN.VLRDESDOB) AS VALOR
    ${fromResumoSankhya()}
    ${whereResumoSankhya({ empresas, recdesp: 1, dtIso, operador: '<' })}
    GROUP BY PAR.NOMEPARC
    ORDER BY VALOR DESC
  `);
  return registros;
}

async function sparkProximosDias({ empresas, dtIniIso, dtFimIso }) {
  const empIn = inSql(empresas);
  const { registros } = await sql(`
    SELECT
      CONVERT(VARCHAR(8), CAST(FIN.DTVENC AS DATE), 112) AS DT_SQL,
      FIN.RECDESP,
      SUM(FIN.VLRDESDOB) AS VALOR
    ${fromResumoSankhya()}
    WHERE CAST(FIN.DTVENC AS DATE) >= CAST('${dtIniIso}' AS DATE)
      AND CAST(FIN.DTVENC AS DATE) <= CAST('${dtFimIso}' AS DATE)
      AND FIN.CODTIPTIT = TIT.CODTIPTIT
      AND FIN.RECDESP IN (1, -1)
      AND FIN.DHBAIXA IS NULL
      AND FIN.PROVISAO = 'N'
      AND PAR.CODPARC = FIN.CODPARC
      AND FIN.CODEMP = EMP.CODEMP
      AND FIN.CODEMP IN (${empIn})
      AND FIN.CODNAT IN (${CODNAT_IN})
      AND (CTA.ATIVA IN ('S') OR (CTA.CODCTABCOINT IS NULL))
      AND ISNULL(CTA.CODCTABCOINT,0) IN (${CODCTA_IN})
      AND FIN.CODCENCUS IN (${CODCENCUS_IN})
      AND CTA.CODEMP IN (${empIn})
    GROUP BY CONVERT(VARCHAR(8), CAST(FIN.DTVENC AS DATE), 112), FIN.RECDESP
    ORDER BY DT_SQL
  `);
  return registros;
}

async function saldoInicialSankhya({ empresas, dtIniIso }) {
  const empIn = inSql(empresas);

  return sql(`
    SELECT ISNULL(SUM(TEMP.VALOR), 0) AS SALDO
    FROM (
      SELECT
        T1.SALDOREAL
        + ISNULL(
          (
            SELECT SUM(T7.VLRLANC * T7.RECDESP)
            FROM TGFMBC T7
            INNER JOIN TSICTA CTA2
              ON T7.CODCTABCOINT = CTA2.CODCTABCOINT
             AND CTA2.CODEMP IN (${empIn})
            WHERE T1.CODCTABCOINT = T7.CODCTABCOINT
              AND CAST(T7.DTLANC AS DATE) >= CAST(T1.REFERENCIA AS DATE)
              AND CTA2.ATIVA IN ('S')
              AND CAST(T7.DTLANC AS DATE) < CAST('${dtIniIso}' AS DATE)
          ), 0
        ) AS VALOR
      FROM TGFSBC T1
      INNER JOIN TSICTA CTA
        ON T1.CODCTABCOINT = CTA.CODCTABCOINT
       AND CTA.CODEMP IN (${empIn})
      WHERE T1.CODCTABCOINT IN (${CODCTA_IN})
        AND T1.REFERENCIA = (
          SELECT MAX(T2.REFERENCIA)
          FROM TGFSBC T2
          WHERE T2.CODCTABCOINT = T1.CODCTABCOINT
            AND CTA.ATIVA IN ('S')
            AND CAST(T2.REFERENCIA AS DATE) < CAST('${dtIniIso}' AS DATE)
        )
    ) TEMP
  `);
}

function dataFinanceiraExpr() {
  return `
    CASE
      WHEN FIN.RECDESP = 1 THEN
        CASE
          WHEN CAST(FIN.DHBAIXA AS DATE) IS NULL THEN
            CASE ISNULL(TIT.CONSDIASUTEIS, 'N')
              WHEN 'S' THEN SANKHYA.SOMA_DIA_UTIL(CAST(FIN.DTVENC AS DATE), ISNULL(TIT.CARENCIA, 0), FIN.CODEMP)
              ELSE CAST(FIN.DTVENC + ISNULL(TIT.CARENCIA, 0) AS DATE)
            END
          WHEN CAST(FIN.DTVENC + ISNULL(TIT.CARENCIA, 0) AS DATE) <> CAST(FIN.DHBAIXA + ISNULL(TIT.CARENCIA, 0) AS DATE) THEN CAST(FIN.DHBAIXA AS DATE)
          ELSE CAST(FIN.DHBAIXA AS DATE)
        END
      ELSE
        CASE
          WHEN CAST(FIN.DHBAIXA AS DATE) IS NULL THEN CAST(FIN.DTVENC AS DATE)
          ELSE CAST(FIN.DHBAIXA AS DATE)
        END
    END
  `;
}

async function fluxoDiarioSankhya({ empresas, dtIniIso, dtFimIso }) {
  const empIn = inSql(empresas);
  const dataExpr = dataFinanceiraExpr();

  return sql(`
    SELECT
      CONVERT(VARCHAR(8), BASE.DATA, 112) AS DT_SQL,
      SUM(BASE.RECEBIDOS) AS RECEBIDOS,
      SUM(BASE.ARECEBER) AS ARECEBER,
      SUM(BASE.PAGOS)    AS PAGOS,
      SUM(BASE.APAGAR)   AS APAGAR
    FROM (
      SELECT
        ${dataExpr} AS DATA,
        CASE
          WHEN FIN.RECDESP = 1 AND FIN.PROVISAO = 'N' AND CAST(FIN.DHBAIXA AS DATE) IS NOT NULL THEN FIN.VLRBAIXA
          ELSE 0
        END AS RECEBIDOS,
        CASE
          WHEN FIN.RECDESP = 1 AND CAST(FIN.DHBAIXA AS DATE) IS NULL THEN CASE WHEN 'N' = 'S' THEN VGFFIN.VLRLIQUIDO ELSE FIN.VLRDESDOB END
          ELSE 0
        END AS ARECEBER,
        CASE
          WHEN FIN.RECDESP = -1 AND FIN.PROVISAO = 'N' AND CAST(FIN.DHBAIXA AS DATE) IS NOT NULL THEN FIN.RECDESP * FIN.VLRBAIXA
          ELSE 0
        END AS PAGOS,
        CASE
          WHEN FIN.RECDESP = -1 AND FIN.PROVISAO = 'N' AND CAST(FIN.DHBAIXA AS DATE) IS NULL THEN CASE WHEN 'N' = 'S' THEN FIN.RECDESP * VGFFIN.VLRLIQUIDO ELSE FIN.RECDESP * FIN.VLRDESDOB END
          ELSE 0
        END AS APAGAR
      FROM TGFFIN FIN
      INNER JOIN TGFPAR PAR ON PAR.CODPARC = FIN.CODPARC
      LEFT JOIN TGFTIT TIT ON TIT.CODTIPTIT = FIN.CODTIPTIT
      LEFT JOIN TSICTA CTA ON CTA.CODCTABCOINT = FIN.CODCTABCOINT AND CTA.CODEMP IN (${empIn})
      LEFT JOIN TGFNAT NAT ON NAT.CODNAT = FIN.CODNAT
      LEFT JOIN TSICUS CUS ON CUS.CODCENCUS = FIN.CODCENCUS
      LEFT JOIN VGFFIN ON (FIN.NUFIN = VGFFIN.NUFIN)
      WHERE ${dataExpr} >= CAST('${dtIniIso}' AS DATE)
        AND ${dataExpr} <= CAST('${dtFimIso}' AS DATE)
        AND (
          CASE
            WHEN FIN.RECDESP = 1 AND EXISTS (
              SELECT 1 FROM TGFANB ANB
               WHERE ANB.STATUSANT IN ('A', 'B')
                 AND ANB.NUFINTITORI = FIN.NUFIN
            ) THEN 'S'
            WHEN FIN.RECDESP = -1 AND EXISTS (
              SELECT 1 FROM TGFANB ANB
               WHERE ANB.STATUSANT IN ('A', 'B')
                 AND ANB.NUFINTITOBR = FIN.NUFIN
            ) THEN 'S'
            ELSE 'N'
          END
        ) = 'N'
        AND FIN.RECDESP <> 0
        AND FIN.CODEMP IN (${empIn})
        AND FIN.CODNAT IN (${CODNAT_IN})
        AND (CTA.ATIVA IN ('S') OR (CTA.CODCTABCOINT IS NULL))
        AND ISNULL(CTA.CODCTABCOINT, 0) IN (${CODCTA_IN})
        AND FIN.CODCENCUS IN (${CODCENCUS_IN})
        AND CTA.CODEMP IN (${empIn})
    ) BASE
    GROUP BY BASE.DATA
    ORDER BY BASE.DATA
  `);
}

// ─── GET /api/fluxo/hoje ──────────────────────────────────────────────────────
router.get('/hoje', async (req, res) => {
  try {
    const dtHoje = hoje();
    const dtHojeIso = yyyymmddToIso(dtHoje);
    const dt10 = addDias(dtHoje, 10);
    const dt10Iso = yyyymmddToIso(dt10);
    const empresas = parseEmpresasFiltro(req.query.codemp);

    // Sankhya pode cancelar consultas simultâneas na mesma sessão HTTP.
    // Por isso, aqui as leituras são feitas em sequência.
    const rReceberHoje = await totalResumo({ empresas, recdesp: 1, dtIso: dtHojeIso, operador: '=' });
    const rPagarHoje = await totalResumo({ empresas, recdesp: -1, dtIso: dtHojeIso, operador: '=' });
    const rReceberAtraso = await totalResumo({ empresas, recdesp: 1, dtIso: dtHojeIso, operador: '<' });
    const rPagarAtraso = await totalResumo({ empresas, recdesp: -1, dtIso: dtHojeIso, operador: '<' });
    const qtdReceberHoje = await qtdHoje({ empresas, recdesp: 1, dtIso: dtHojeIso });
    const qtdPagarHoje = await qtdHoje({ empresas, recdesp: -1, dtIso: dtHojeIso });
    const topPagar = await topPagarHoje({ empresas, dtIso: dtHojeIso });
    const topAtrasos = await atrasosTopReceber({ empresas, dtIso: dtHojeIso });
    const rSparkFluxo = await fluxoDiarioSankhya({ empresas, dtIniIso: dtHojeIso, dtFimIso: dt10Iso });
    const rSparkSaldoIni = await saldoInicialSankhya({ empresas, dtIniIso: dtHojeIso });

    const receberHojeValor = money(rReceberHoje.registros?.[0]?.VALOR);
    const pagarHojeValor = money(rPagarHoje.registros?.[0]?.VALOR);
    const receitasAtrasoValor = money(rReceberAtraso.registros?.[0]?.VALOR);
    const despesasAtrasoValor = money(rPagarAtraso.registros?.[0]?.VALOR);

    const top5pagar = topPagar.map(r => ({
      nome: (r.NOMEPARC || '').trim(),
      valor: money(r.VALOR),
    }));
    const outros = Math.max(0, money(pagarHojeValor - top5pagar.reduce((s, t) => s + t.valor, 0)));

    const hojeJs = new Date();
    hojeJs.setHours(0, 0, 0, 0);
    const atrasos = topAtrasos.map(r => {
      const dtSql = (r.DT_VENC || '').trim();
      const dtFmt = dtSql.length === 8
        ? `${dtSql.substring(6, 8)}/${dtSql.substring(4, 6)}/${dtSql.substring(0, 4)}`
        : '-';
      const dtVenc = dtSql.length === 8
        ? new Date(`${dtSql.substring(0, 4)}-${dtSql.substring(4, 6)}-${dtSql.substring(6, 8)}T00:00:00`)
        : null;

      return {
        parceiro: (r.NOMEPARC || '').trim(),
        vencimento: dtFmt,
        valor: money(r.VALOR),
        dias_atraso: dtVenc ? Math.max(0, Math.floor((hojeJs - dtVenc) / 86400000)) : 0,
      };
    });

    const porData = {};
    for (const r of rSparkFluxo.registros) {
      const dt = (r.DT_SQL || '').trim();
      porData[dt] = {
        recebidos: money(r.RECEBIDOS),
        areceber: money(r.ARECEBER),
        pagos: money(r.PAGOS),
        apagar: money(r.APAGAR),
      };
    }

    const saldoInicialSpark = money(rSparkSaldoIni.registros?.[0]?.SALDO);
    let saldo = saldoInicialSpark;
    const sparkline = [];
    for (let i = 0; i <= 10; i++) {
      const dt = addDias(dtHoje, i);
      const comp = porData[dt] || { recebidos: 0, areceber: 0, pagos: 0, apagar: 0 };

      const recebidos = money(comp.recebidos);
      const areceber = money(comp.areceber);
      const pagos = money(comp.pagos);
      const apagar = money(comp.apagar);

      const pagosAbs = money(Math.abs(pagos));
      const apagarAbs = money(Math.abs(apagar));
      const entradas = money(recebidos + areceber);
      const saidas = money(pagosAbs + apagarAbs);

      saldo = money(saldo + entradas - saidas);

      sparkline.push({
        data: `${dt.substring(6, 8)}/${dt.substring(4, 6)}`,
        recebidos,
        areceber,
        pagos,
        apagar,
        pagos_abs: pagosAbs,
        apagar_abs: apagarAbs,
        entradas,
        saidas,
        saldo_inicial: i === 0 ? saldoInicialSpark : null,
        saldo_esperado: saldo,
        saldo_acum: saldo,
      });
    }

    res.json({
      ok: true,
      resumo_sankhya: {
        receber_hoje: receberHojeValor,
        pagar_hoje: pagarHojeValor,
        receitas_atraso: receitasAtrasoValor,
        despesas_atraso: despesasAtrasoValor,
      },
      pagar: {
        qtd: qtdPagarHoje,
        valor: pagarHojeValor,
        atraso: despesasAtrasoValor,
        top5: top5pagar,
        outros,
      },
      receber: {
        qtd: qtdReceberHoje,
        valor: receberHojeValor,
        atraso: receitasAtrasoValor,
      },
      atrasos,
      sparkline,
    });
  } catch (err) {
    console.error('[fluxo/hoje]', err.message);
    res.status(500).json({ ok: false, erro: err.message });
  }
});

// ─── GET /api/fluxo/projecao ──────────────────────────────────────────────────
router.get('/projecao', async (req, res) => {
  try {
    const dtHoje = hoje();
    const empresas = parseEmpresasFiltro(req.query.codemp);

    let dtIni = sanitize(req.query.dtIni) || dtHoje;
    let dtFim = sanitize(req.query.dtFim);
    if (!dtFim) {
      const dias = Math.min(parseInt(req.query.dias || '90', 10), 365);
      dtFim = addDias(dtIni, dias);
    }

    // limite de seguranca
    if (dtFim > addDias(dtIni, 365)) dtFim = addDias(dtIni, 365);

    // garante periodo consistente
    if (strToDate(dtFim) < strToDate(dtIni)) {
      const tmp = dtIni;
      dtIni = dtFim;
      dtFim = tmp;
    }

    const dtIniIso = yyyymmddToIso(dtIni);
    const dtFimIso = yyyymmddToIso(dtFim);

    const rFluxo = await fluxoDiarioSankhya({ empresas, dtIniIso, dtFimIso });
    const rSaldoIni = await saldoInicialSankhya({ empresas, dtIniIso });

    const porData = {};
    for (const r of rFluxo.registros) {
      const dt = (r.DT_SQL || '').trim();
      porData[dt] = {
        recebidos: money(r.RECEBIDOS),
        areceber: money(r.ARECEBER),
        pagos: money(r.PAGOS),
        apagar: money(r.APAGAR),
      };
    }

    const saldoInicial = money(rSaldoIni.registros?.[0]?.SALDO);

    const serie = [];
    let saldo = saldoInicial;
    let cur = strToDate(dtIni);
    const end = strToDate(dtFim);
    while (cur <= end) {
      const dtKey = dateToStr(cur);
      const dtFmt = `${String(cur.getDate()).padStart(2, '0')}/${String(cur.getMonth() + 1).padStart(2, '0')}/${cur.getFullYear()}`;

      const comp = porData[dtKey] || { recebidos: 0, areceber: 0, pagos: 0, apagar: 0 };

      const recebidos = money(comp.recebidos);
      const areceber = money(comp.areceber);
      const pagos = money(comp.pagos);
      const apagar = money(comp.apagar);

      const pagosAbs = money(Math.abs(pagos));
      const apagarAbs = money(Math.abs(apagar));
      const entradas = money(recebidos + areceber);
      const saidas = money(pagosAbs + apagarAbs);
      const liquido = money(entradas - saidas);

      saldo = money(saldo + liquido);

      serie.push({
        data: dtFmt,
        dt_sql: dtKey,
        recebidos,
        areceber,
        pagos,
        apagar,
        pagos_abs: pagosAbs,
        apagar_abs: apagarAbs,
        entradas,
        saidas,
        liquido,
        saldo_inicial: dtKey === dtIni ? saldoInicial : null,
        saldo_esperado: saldo,
        saldo_acum: saldo,
      });

      cur.setDate(cur.getDate() + 1);
    }

    const totalEnt = money(serie.reduce((s, r) => s + r.entradas, 0));
    const totalSai = money(serie.reduce((s, r) => s + r.saidas, 0));
    const saldoFinal = serie.length ? serie[serie.length - 1].saldo_esperado : saldoInicial;

    res.json({
      ok: true,
      periodo: { de: dtIni, ate: dtFim, de_fmt: dateFmt(dtIni), ate_fmt: dateFmt(dtFim) },
      totais: {
        entradas: totalEnt,
        saidas: totalSai,
        liquido: money(totalEnt - totalSai),
        saldo_inicial: saldoInicial,
        saldo_final: saldoFinal,
      },
      serie,
    });
  } catch (err) {
    console.error('[fluxo/projecao]', err.message);
    res.status(500).json({ ok: false, erro: err.message });
  }
});

export default router;

// ─── GET /api/fluxo/saldos ────────────────────────────────────────────────────
// Retorna saldo das contas no mesmo critério do gadget Sankhya:
// saldo base TGFSBC + movimentos TGFMBC até a data de referência.
// Filtros: codemp (opcional), dtRef (opcional, YYYYMMDD)
const _saldoRouter = Router();

_saldoRouter.get('/saldos', async (req, res) => {
  try {
    const empresas = parseEmpresasFiltro(req.query.codemp);
    const dtRef = sanitize(req.query.dtRef) || hoje();
    const dtRefIso = yyyymmddToIso(dtRef);
    const empIn = inSql(empresas);

    const { registros } = await sql(`
      WITH REF AS (
        SELECT
          T1.CODCTABCOINT,
          T1.REFERENCIA,
          T1.SALDOREAL,
          ROW_NUMBER() OVER (PARTITION BY T1.CODCTABCOINT ORDER BY T1.REFERENCIA DESC) AS RN
        FROM TGFSBC T1
        INNER JOIN TSICTA CTAF ON CTAF.CODCTABCOINT = T1.CODCTABCOINT
        WHERE T1.CODCTABCOINT IN (${CODCTA_IN})
          AND CTAF.CODEMP IN (${empIn})
          AND CTAF.ATIVA IN ('S')
          AND CAST(T1.REFERENCIA AS DATE) < CAST('${dtRefIso}' AS DATE)
      )
      SELECT
        CTA.CODCTABCOINT,
        RTRIM(CTA.DESCRICAO) AS DESCRICAO,
        CTA.CODEMP,
        RTRIM(EMP.NOMEFANTASIA) AS EMPRESA,
        CTA.CLASSE,
        RTRIM(ISNULL(BCO.NOMEBCO, '')) AS BANCO,
        CTA.DTALTER,
        CONVERT(VARCHAR(8), CAST(REF.REFERENCIA AS DATE), 112) AS REFERENCIA,
        REF.SALDOREAL + ISNULL(MOV.VALOR, 0) AS SALDOREAL
      FROM REF
      INNER JOIN TSICTA CTA ON CTA.CODCTABCOINT = REF.CODCTABCOINT
      INNER JOIN TSIEMP EMP ON EMP.CODEMP = CTA.CODEMP
      LEFT JOIN TSIBCO BCO ON BCO.CODBCO = CTA.CODBCO
      OUTER APPLY (
        SELECT SUM(T7.VLRLANC * T7.RECDESP) AS VALOR
        FROM TGFMBC T7
        WHERE T7.CODCTABCOINT = REF.CODCTABCOINT
          AND CAST(T7.DTLANC AS DATE) >= CAST(REF.REFERENCIA AS DATE)
          AND CAST(T7.DTLANC AS DATE) < CAST('${dtRefIso}' AS DATE)
      ) MOV
      WHERE REF.RN = 1
      ORDER BY CTA.CODEMP, CTA.CODCTABCOINT
    `);

    const classeLabel = { C: 'Conta Corrente', A: 'Aplicação', X: 'Caixa' };

    // Formata data "DDMMYYYY HH:MM:SS" → "DD/MM/YYYY"
    const fmtDt = raw => {
      if (!raw) return null;
      const s = String(raw).trim();
      // formato Sankhya: "31032026 00:00:00" → dia=31, mes=03, ano=2026
      if (s.length >= 8) return `${s.substring(0,2)}/${s.substring(2,4)}/${s.substring(4,8)}`;
      return null;
    };

    // Converte DDMMYYYY em YYYYMMDD para comparação correta de datas
    const toSortKey = raw => {
      if (!raw) return '';
      const s = String(raw).trim();
      if (s.length < 8) return '';
      return `${s.substring(4,8)}${s.substring(2,4)}${s.substring(0,2)}`;
    };

    // Agrupa por empresa
    const porEmpresa = {};
    let ultimaConcil = null;

    for (const r of registros) {
      const emp  = r.CODEMP;
      const dtAl = fmtDt(r.DTALTER);
      if (!porEmpresa[emp]) {
        porEmpresa[emp] = {
          codemp:   emp,
          empresa:  (r.EMPRESA || '').trim(),
          total:    0,
          contas:   [],
          ultima_conciliacao: null,
        };
      }
      const saldo = +Number(r.SALDOREAL).toFixed(2);
      porEmpresa[emp].total += saldo;
      porEmpresa[emp].contas.push({
        cod:        r.CODCTABCOINT,
        descricao:  (r.DESCRICAO || '').trim(),
        classe:     r.CLASSE,
        tipo:       classeLabel[r.CLASSE] || `Classe ${r.CLASSE || '-'}`,
        banco:      (r.BANCO || '').trim(),
        saldo_real: saldo,
        ultima_conciliacao: dtAl,
        referencia_saldo: r.REFERENCIA || null,
      });
      // última conciliação geral = mais recente
      if (r.DTALTER) {
        if (!ultimaConcil || toSortKey(r.DTALTER) > toSortKey(ultimaConcil)) ultimaConcil = r.DTALTER;
      }
      // última conciliação da empresa = mais recente
      if (r.DTALTER) {
        if (!porEmpresa[emp].ultima_conciliacao || toSortKey(r.DTALTER) > toSortKey(porEmpresa[emp].ultima_conciliacao)) {
          porEmpresa[emp].ultima_conciliacao = r.DTALTER;
        }
      }
    }

    // Converte datas brutas → formatadas
    const empresasList = Object.values(porEmpresa).map(e => ({
      ...e,
      total: +e.total.toFixed(2),
      ultima_conciliacao: fmtDt(e.ultima_conciliacao),
    }));

    const totalReal = +empresasList.reduce((s, e) => s + e.total, 0).toFixed(2);

    res.json({
      ok: true,
      total_real: totalReal,
      data_referencia: dateFmt(dtRef),
      ultima_conciliacao: fmtDt(ultimaConcil),
      empresas: empresasList,
    });
  } catch (err) {
    console.error('[fluxo/saldos]', err.message);
    res.status(500).json({ ok: false, erro: err.message });
  }
});

export { _saldoRouter };

