import 'dotenv/config';
import { sql } from './sankhya.js';

// TSIDBQUERY
try {
  const r = await sql(`SELECT * FROM TSIDBQUERY WHERE 1=0`);
  console.log('TSIDBQUERY colunas:', r.colunas);
} catch(e){ console.log('TSIDBQUERY err:', e.message); }

// TSIDAS colunas
try {
  const r = await sql(`SELECT * FROM TSIDAS WHERE 1=0`);
  console.log('TSIDAS colunas:', r.colunas);
} catch(e){ console.log('TSIDAS err:', e.message); }

// TSICVIEWS colunas
try {
  const r = await sql(`SELECT * FROM TSICVIEWS WHERE 1=0`);
  console.log('TSICVIEWS colunas:', r.colunas);
} catch(e){ console.log('TSICVIEWS err:', e.message); }

// TSICTRES colunas (poderia ser templates de relatório)
try {
  const r = await sql(`SELECT * FROM TSICTRES WHERE 1=0`);
  console.log('TSICTRES colunas:', r.colunas);
} catch(e){ console.log('TSICTRES err:', e.message); }

// TSICMD colunas (módulos/comandos?)
try {
  const r = await sql(`SELECT * FROM TSICMD WHERE 1=0`);
  console.log('TSICMD colunas:', r.colunas);
} catch(e){ console.log('TSICMD err:', e.message); }
