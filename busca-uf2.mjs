import 'dotenv/config';
import { sql } from './sankhya.js';

// Ver valores distintos de UF na TSICID
try {
  const r = await sql(`
    SELECT DISTINCT UF
    FROM TSICID
    ORDER BY UF
  `);
  console.log('Valores distintos de UF em TSICID:');
  console.log(r.registros.map(x => x.UF));
} catch(e){ console.log('err:', e.message); }
