import 'dotenv/config';
import { sql } from './sankhya.js';

// TSICVIEWS - buscar por nome/descrição
try {
  const r = await sql(`
    SELECT NUVIEW, NOME, DESCRICAO, SELECTVIEW
    FROM TSICVIEWS
    WHERE UPPER(NOME) LIKE '%ENTRADA%'
       OR UPPER(DESCRICAO) LIKE '%ENTRADA%'
       OR UPPER(NOME) LIKE '%SAIDA%'
       OR UPPER(NOME) LIKE '%2405%'
  `);
  console.log('TSICVIEWS matches:', r.total);
  console.log(JSON.stringify(r.registros, null, 2));
} catch(e){ console.log('TSICVIEWS err:', e.message); }

// TSIDBQUERY - buscar
try {
  const r = await sql(`
    SELECT NUQUERY, TITULOQUERY, TEXTOQUERY
    FROM TSIDBQUERY
    WHERE UPPER(TITULOQUERY) LIKE '%ENTRADA%'
       OR UPPER(TITULOQUERY) LIKE '%SAIDA%'
       OR UPPER(TITULOQUERY) LIKE '%2405%'
  `);
  console.log('\nTSIDBQUERY matches:', r.total);
  console.log(JSON.stringify(r.registros, null, 2));
} catch(e){ console.log('TSIDBQUERY err:', e.message); }

// TSICVIEWS - listar todos nomes para ver o que existe
try {
  const r = await sql(`SELECT NUVIEW, NOME, DESCRICAO FROM TSICVIEWS ORDER BY NUVIEW`);
  console.log('\nTodas TSICVIEWS:');
  r.registros.forEach(v => console.log(`[${v.NUVIEW}] ${v.NOME} - ${v.DESCRICAO}`));
} catch(e){ console.log('TSICVIEWS list err:', e.message); }
