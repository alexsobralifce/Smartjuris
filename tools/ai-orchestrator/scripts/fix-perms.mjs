// ===========================================================================
// Normaliza a propriedade/permisão dos arquivos do orquestrador.
//
// Os arquivos criados pela automação podem nascer com `root:staff`/modo 600
// (o shell de automação roda como root), o que causa `EACCES` quando o usuário
// roda `pnpm ai:*`. Este pré-run corrige a propriedade dos arquivos do pacote
// para o usuário atual. Tolerante: falhas de chown não abortam (best-effort).
// ===========================================================================

import { chownSync, readdirSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));
const hasGetuid = typeof process.getuid === 'function';
const uid = hasGetuid ? process.getuid() : -1;
const gid = hasGetuid ? process.getgid() : -1;

const DIRS = ['src', 'web', 'test'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(p);
      walk(p, out);
    } else if (st.isFile()) {
      out.push(p);
    }
  }
  return out;
}

for (const d of DIRS) {
  const dir = join(pkgDir, d);
  try {
    for (const p of [dir, ...walk(dir)]) {
      try {
        const st = statSync(p);
        if (st.uid !== uid || st.gid !== gid) {
          chownSync(p, uid, gid);
        }
        if (st.isFile() && (st.mode & 0o600) === 0o600) {
          chmodSync(p, 0o644);
        }
      } catch {
        // sem permissão de chown — segue (o usuário pode rodar o chown global).
      }
    }
  } catch {
    // diretório não existe (ex.: test de pacote sem web/) — ignora.
  }
}
