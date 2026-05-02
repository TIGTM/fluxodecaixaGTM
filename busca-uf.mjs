import 'dotenv/config';
import { sql } from './sankhya.js';

// Ver colunas da TSIUF
try {
  const r = await sql(`SELECT * FROM TSIUF WHERE 1=0`);
  console.log('TSIUF colunas:', r.colunas);
} catch(e){ console.log('TSIUF err:', e.message); }

// Ver alguns registros de TSIUF
try {
  const r = await sql(`SELECT * FROM TSIUF`);
  console.log('TSIUF registros:', JSON.stringify(r.registros.slice(0,5), null, 2));
} catch(e){ console.log('TSIUF data err:', e.message); }

// Ver colunas da TSICID para confirmar campo UF
try {
  const r = await sql(`SELECT * FROM TSICID WHERE 1=0`);
  console.log('TSICID colunas:', r.colunas);
} catch(e){ console.log('TSICID err:', e.message); }
