import 'dotenv/config';
import { sql } from './sankhya.js';

// TSIEXT - extrações/relatórios com SQL
try {
  const r = await sql(`
    SELECT CODEXTRACAO, DESCRICAO, CATEGORIA, CONSULTA
    FROM TSIEXT
    WHERE UPPER(DESCRICAO) LIKE '%ENTRADA%'
       OR UPPER(DESCRICAO) LIKE '%SAIDA%'
       OR UPPER(DESCRICAO) LIKE '%2405%'
       OR UPPER(CATEGORIA) LIKE '%FISCAL%'
  `);
  console.log('TSIEXT matches:', r.total);
  console.log(JSON.stringify(r.registros, null, 2));
} catch(e){ console.log('TSIEXT busca err:', e.message); }

// Listar todas categorias disponíveis
try {
  const r = await sql(`
    SELECT DISTINCT CATEGORIA
    FROM TSIEXT
    ORDER BY CATEGORIA
  `);
  console.log('\nCategorias TSIEXT:', r.registros.map(x => x.CATEGORIA));
} catch(e){ console.log('TSIEXT categorias err:', e.message); }

// TSIEXT - todas descrições
try {
  const r = await sql(`
    SELECT CODEXTRACAO, DESCRICAO, CATEGORIA
    FROM TSIEXT
    ORDER BY CODEXTRACAO
  `);
  console.log('\nTodas TSIEXT:');
  r.registros.forEach(x => console.log(`[${x.CODEXTRACAO}] ${x.DESCRICAO} (${x.CATEGORIA})`));
} catch(e){ console.log('TSIEXT list err:', e.message); }
