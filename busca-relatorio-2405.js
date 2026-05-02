/**
 * busca-relatorio-2405.js
 * Busca o SQL real do relatório "2405 - Entradas e Saídas Contábil" no banco Sankhya
 */
import 'dotenv/config';
import { sql } from './sankhya.js';

async function main() {
  console.log('=== Buscando SQL do relatório 2405 ===\n');

  // 1. Tentar na tabela TSIREL (Relatórios)
  try {
    console.log('--- TSIREL (relatórios cadastrados) ---');
    const r1 = await sql(`
      SELECT CODREL, DESCREL, SQLREL
      FROM TSIREL
      WHERE CODREL = 2405
    `);
    if (r1.registros.length > 0) {
      console.log(JSON.stringify(r1.registros, null, 2));
    } else {
      console.log('Nenhum registro em TSIREL com CODREL = 2405');
    }
  } catch (e) {
    console.log('TSIREL erro:', e.message);
  }

  // 2. Buscar por nome
  try {
    console.log('\n--- TSIREL por nome (Entradas/Saidas) ---');
    const r2 = await sql(`
      SELECT CODREL, DESCREL
      FROM TSIREL
      WHERE UPPER(DESCREL) LIKE '%ENTRADAS%'
        AND UPPER(DESCREL) LIKE '%SA%'
    `);
    console.log(JSON.stringify(r2.registros, null, 2));
  } catch (e) {
    console.log('TSIREL busca nome erro:', e.message);
  }

  // 3. Tentar TSISCV (views/scripts do sistema)
  try {
    console.log('\n--- TSISCV (scripts/views) ---');
    const r3 = await sql(`
      SELECT CODSCV, NOMSCV, SQLSCV
      FROM TSISCV
      WHERE UPPER(NOMSCV) LIKE '%ENTRADAS%'
        OR CODSCV = 2405
    `);
    console.log(JSON.stringify(r3.registros, null, 2));
  } catch (e) {
    console.log('TSISCV erro:', e.message);
  }

  // 4. Tentar TSICP (consultas personalizadas / painéis)
  try {
    console.log('\n--- TSICP (consultas personalizadas) ---');
    const r4 = await sql(`
      SELECT CODCP, DESCCP, SQLCP
      FROM TSICP
      WHERE CODCP = 2405
        OR UPPER(DESCCP) LIKE '%ENTRADAS%'
    `);
    console.log(JSON.stringify(r4.registros, null, 2));
  } catch (e) {
    console.log('TSICP erro:', e.message);
  }

  // 5. Tabelas do sistema disponíveis relacionadas a relatório
  try {
    console.log('\n--- Tabelas TSI disponíveis ---');
    const r5 = await sql(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE 'TSI%'
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);
    console.log(JSON.stringify(r5.registros, null, 2));
  } catch (e) {
    console.log('INFORMATION_SCHEMA erro:', e.message);
  }
}

main().catch(console.error);
