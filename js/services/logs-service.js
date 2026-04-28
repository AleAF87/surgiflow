import { db } from "../firebase-config.js";
import { push, ref, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

export async function registrarLog({
  tipo,
  entidade,
  entidadeId,
  usuarioId,
  usuarioNome,
  acao,
  dadosAntes = null,
  dadosDepois = null
}) {
  const logRef = push(ref(db, "logs"));
  await set(logRef, {
    id: logRef.key,
    tipo,
    entidade,
    entidadeId,
    usuarioId: usuarioId || "sistema",
    usuarioNome: usuarioNome || "Sistema",
    dataHora: new Date().toISOString(),
    acao,
    dadosAntes: sanitizarParaFirebase(dadosAntes),
    dadosDepois: sanitizarParaFirebase(dadosDepois)
  });
  return logRef.key;
}

function sanitizarParaFirebase(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizarParaFirebase);
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    String(key).replace(/[.#$/[\]]/g, "_"),
    sanitizarParaFirebase(item)
  ]));
}

export function obterCamposAlterados(antes = {}, depois = {}) {
  const dadosAntes = {};
  const dadosDepois = {};
  const chaves = new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})]);
  chaves.forEach((chave) => {
    const valorAntes = JSON.stringify(antes?.[chave] ?? null);
    const valorDepois = JSON.stringify(depois?.[chave] ?? null);
    if (valorAntes !== valorDepois) {
      dadosAntes[chave] = antes?.[chave] ?? null;
      dadosDepois[chave] = depois?.[chave] ?? null;
    }
  });
  return { dadosAntes, dadosDepois };
}
