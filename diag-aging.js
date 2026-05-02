import 'dotenv/config';
import { sql } from './sankhya.js';

// Campos com STATUS, BAIXA ou PROV na TGFFIN
const r0 = await sql(`
  SELECT COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'TGFFIN'
    AND (COLUMN_NAME LIKE '%STATUS%' OR COLUMN_NAME LIKE '%BAIXA%' OR COLUMN_NAME LIKE '%PROV%' OR COLUMN_NAME LIKE '%CANC%')
  ORDER BY COLUMN_NAME
`);
console.log('Campos relevantes:', r0.registros.map(c => c.COLUMN_NAME));

// Amostra de títulos abertos
const r2 = await sql(`
  SELECT TOP 20
    FIN.NUFIN, FIN.NUMNOTA,
    CONVERT(VARCHAR(10), FIN.DTVENC, 103) AS DTVENC_FMT,
    FIN.VLRDESDOB, FIN.VLRBAIXA,
    FIN.RECDESP, FIN.PROVISAO, FIN.BAIXAAPI,
    PAR.NOMEPARC
  FROM TGFFIN FIN
  JOIN TGFPAR PAR ON PAR.CODPARC = FIN.CODPARC
  WHERE FIN.RECDESP IN (1,-1)
    AND (FIN.VLRDESDOB - ISNULL(FIN.VLRBAIXA,0)) > 0
  ORDER BY FIN.DTVENC DESC
`);
console.log('\nAmostra títulos abertos:');
r2.registros.forEach(r => console.log(r));
