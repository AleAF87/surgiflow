import { db } from "./firebase-config.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

export async function initPage() {
  const paths = ["pacientes", "medicos", "hospitais", "cirurgias"];
  const dados = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, (await get(ref(db, path))).val() || {}])));
  const cirurgiasAtivas = Object.fromEntries(Object.entries(dados.cirurgias).filter(([, cirurgia]) => !cirurgia.arquivada));

  document.getElementById("dashboardStats").innerHTML = [
    ["Pacientes", dados.pacientes, "fa-user-injured"],
    ["Médicos", dados.medicos, "fa-user-doctor"],
    ["Hospitais", dados.hospitais, "fa-hospital"],
    ["Cirurgias", cirurgiasAtivas, "fa-calendar-check"]
  ].map(([label, obj, icon]) => `<div class="sf-card stat-card"><span><i class="fa-solid ${icon} me-1"></i>${label}</span><strong>${Object.keys(obj).length}</strong></div>`).join("");

  const proximas = Object.values(cirurgiasAtivas).sort((a, b) => String(a.dataCirurgia).localeCompare(String(b.dataCirurgia))).slice(0, 8);
  document.getElementById("proximasCirurgias").innerHTML = `
    <thead><tr><th>Data</th><th>Procedimento</th><th>Paciente</th><th>Médico</th><th>Status</th></tr></thead>
    <tbody>${proximas.map((c) => `<tr><td>${c.dataCirurgia || "-"}</td><td>${c.tipoProcedimento || "-"}</td><td>${dados.pacientes[c.pacienteId]?.nome || c.pacienteId || "-"}</td><td>${dados.medicos[c.medicoId]?.nome || c.medicoId || "-"}</td><td><span class="badge badge-soft">${formatarStatus(c.status)}</span></td></tr>`).join("") || `<tr><td colspan="5" class="empty-state">Nenhuma cirurgia cadastrada.</td></tr>`}</tbody>`;
}

function formatarStatus(status) {
  if (!status) return "-";
  return String(status).replace(/_/g, " ").replace(/\b\p{L}/gu, (letra) => letra.toLocaleUpperCase("pt-BR"));
}
