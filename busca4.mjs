import 'dotenv/config';
import { sql } from './sankhya.js';

// TSIBLG - log de atividades (pode ter SQLs executados)
try {
  const r = await sql(`SELECT * FROM TSIBLG WHERE 1=0`);
  console.log('TSIBLG colunas:', r.colunas);
} catch(e){ console.log('TSIBLG err:', e.message); }

// TSIEXT - relatórios externos
try {
  const r = await sql(`SELECT * FROM TSIEXT WHERE 1=0`);
  console.log('TSIEXT colunas:', r.colunas);
} catch(e){ console.log('TSIEXT err:', e.message); }

// TSIFOR - formulários / telas
try {
  const r = await sql(`
    SELECT * FROM TSIFOR
    WHERE UPPER(DESCRICAO) LIKE '%ENTRADA%'
       OR CODFOR = 2405
  `);
  console.log('TSIFOR:', JSON.stringify(r.registros.slice(0,5), null, 2));
} catch(e){ 
  console.log('TSIFOR err:', e.message);
  try {
    const r2 = await sql(`SELECT * FROM TSIFOR WHERE 1=0`);
    console.log('TSIFOR colunas:', r2.colunas);
  } catch(e2){ console.log('TSIFOR cols err:', e2.message); }
}

// TSIFIL - filtros de telas  
try {
  const r = await sql(`SELECT * FROM TSIFIL WHERE 1=0`);
  console.log('TSIFIL colunas:', r.colunas);
} catch(e){ console.log('TSIFIL err:', e.message); }

// TSINUS - buscar tela 2405
try {
  const r = await sql(`SELECT * FROM TSINUS WHERE NUREPORT = 2405 OR CODNUM = 2405`);
  console.log('TSINUS:', JSON.stringify(r.registros.slice(0,5), null, 2));
} catch(e){ 
  console.log('TSINUS err:', e.message);
  try {
    const r2 = await sql(`SELECT TOP(1) * FROM TSINUS`);
    console.log('TSINUS colunas:', r2.colunas);
  } catch(e2){ console.log('TSINUS cols err:', e2.message); }
}
