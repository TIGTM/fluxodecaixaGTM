import 'dotenv/config';
import { sql } from './sankhya.js';

for (const tab of ['TSIGUF', 'TSIIUF', 'TSIUFA', 'TSIUFI', 'TSIUFS', 'TSIUFU']) {
  try {
    const r = await sql(`SELECT * FROM ${tab} WHERE 1=0`);
    console.log(`\n${tab} colunas:`, r.colunas);
    // Se tiver poucas colunas, mostra os dados
    if (r.colunas.length <= 8) {
      const r2 = await sql(`SELECT * FROM ${tab} ORDER BY ${r.colunas[0]}`);
      console.log(`${tab} dados:`, JSON.stringify(r2.registros.slice(0, 5), null, 2));
    }
  } catch(e){ console.log(`${tab}: ${e.message}`); }
}
