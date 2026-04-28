import { db } from "./firebase-config.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

export async function initPage() {
  const snap = await get(ref(db, "logs"));
  const logs = Object.values(snap.val() || {}).sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora))).slice(0, 300);
  document.getElementById("logsTable").innerHTML = `
    <thead><tr><th>Data</th><th>Tipo</th><th>Entidade</th><th>Usuário</th><th>Ação</th></tr></thead>
    <tbody>${logs.map((l) => `<tr><td>${l.dataHora ? new Date(l.dataHora).toLocaleString("pt-BR") : "-"}</td><td>${l.tipo || "-"}</td><td>${l.entidade || "-"}</td><td>${l.usuarioNome || "-"}</td><td>${l.acao || "-"}</td></tr>`).join("") || `<tr><td colspan="5" class="empty-state">Nenhum log registrado.</td></tr>`}</tbody>`;
}
