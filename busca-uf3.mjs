import 'dotenv/config';
import { sql } from './sankhya.js';

// Buscar tabela que mapeia código IBGE de UF para sigla/nome
// Candidatas: TSIEST, TSIUFE, TSIUF, TGFEST
const tabelas = ['TSIEST', 'TSIUFE', 'TGFEST', 'TSIESTADO', 'TSIESTAD'];

for (const tab of tabelas) {
  try {
    const r = await sql(`SELECT * FROM ${tab} WHERE 1=0`);
    console.log(`${tab} colunas:`, r.colunas);
  } catch(e){ console.log(`${tab}: não existe`); }
}

// Buscar nas tabelas TSI que contenham "EST" ou "UF" no nome
try {
  const r = await sql(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
      AND (TABLE_NAME LIKE 'TSI%EST%'
        OR TABLE_NAME LIKE 'TSI%UF%'
        OR TABLE_NAME LIKE 'TSI%IBGE%'
        OR TABLE_NAME LIKE 'TSI%ESTAD%')
    ORDER BY TABLE_NAME
  `);
  console.log('\nTabelas com EST/UF/IBGE:', r.registros.map(x => x.TABLE_NAME));
} catch(e){ console.log('err:', e.message); }
