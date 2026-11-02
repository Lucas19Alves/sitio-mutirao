// Gera a migration com o catálogo usado pelo servidor a partir de src/data.
// Rode após qualquer mudança no catálogo e aplique o arquivo (upsert idempotente).
import { writeFileSync } from 'node:fs';
import { serverCatalog } from '../src/data/catalog.ts';

const json = JSON.stringify(serverCatalog());
const sql = `-- GERADO por scripts/gen-catalog-sql.mjs — não edite à mão.
insert into game.catalog (id, data) values (1, $catalog$${json}$catalog$::jsonb)
on conflict (id) do update set data = excluded.data;
`;
writeFileSync(new URL('../supabase/migrations/20261102000003_catalog.sql', import.meta.url), sql);
console.log(`catálogo do servidor: ${(json.length / 1024).toFixed(1)} KB`);
