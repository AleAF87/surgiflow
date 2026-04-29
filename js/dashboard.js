import { db } from "./firebase-config.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { usuarioEhAdmin, usuarioEhMedico, usuarioEhSecretaria } from "./services/auth-service.js";
import { buscarIdsCirurgiasPorMedico } from "./services/indexes-service.js";

let dadosDashboard = {};
let proximasCirurgias = [];
let ordenacaoDashboard = { campo: "dataHora", direcao: "asc" };

export async function initPage({ usuario }) {
  const paths = ["pacientes", "medicos", "hospitais", "cirurgias", "usuarios"];
  dadosDashboard = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, (await get(ref(db, path))).val() || {}])));
  const cirurgiasVisiveis = await filtrarCirurgiasVisiveis(usuario, Object.values(dadosDashboard.cirurgias || {}).filter((cirurgia) => !cirurgia.arquivada));
  const cirurgiasAtivas = Object.fromEntries(cirurgiasVisiveis.map((cirurgia) => [cirurgia.id, cirurgia]));
  renderizarAvisoUsuariosPendentes(usuario);

  document.getElementById("dashboardStats").innerHTML = [
    ["Pacientes", dadosDashboard.pacientes, "fa-user-injured"],
    ["Médicos", dadosDashboard.medicos, "fa-user-doctor"],
    ["Hospitais", dadosDashboard.hospitais, "fa-hospital"],
    ["Cirurgias", cirurgiasAtivas, "fa-calendar-check"]
  ].map(([label, obj, icon]) => `<div class="sf-card stat-card"><span><i class="fa-solid ${icon} me-1"></i>${label}</span><strong>${Object.keys(obj).length}</strong></div>`).join("");

  proximasCirurgias = Object.values(cirurgiasAtivas);
  document.getElementById("proximasCirurgias")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort-dashboard]");
    if (!button) return;
    alterarOrdenacaoDashboard(button.dataset.sortDashboard);
  });
  renderizarProximasCirurgias();
}

function renderizarAvisoUsuariosPendentes(usuario) {
  const container = document.getElementById("usuariosPendentesAviso");
  if (!container) return;
  if (!usuarioEhAdmin(usuario)) {
    container.innerHTML = "";
    return;
  }
  const pendentes = Object.values(dadosDashboard.usuarios || {}).filter((usuarioItem) => String(usuarioItem.status || "").toLowerCase() === "pendente");
  container.innerHTML = pendentes.length ? `
    <div class="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2">
      <span><strong>${pendentes.length}</strong> usuário(s) aguardando aprovação de acesso.</span>
      <a class="btn btn-sm btn-outline-primary" href="pages/usuarios.html"><i class="fa-solid fa-users-gear me-1"></i>Revisar usuários</a>
    </div>` : "";
}

async function filtrarCirurgiasVisiveis(usuario, lista) {
  if (usuarioEhAdmin(usuario)) return lista;
  if (usuarioEhMedico(usuario)) return buscarCirurgiasDoMedico(usuario, lista);
  if (usuarioEhSecretaria(usuario)) {
    const snapshot = await get(ref(db, `permissoes_secretarias_medicos/${usuario.id}`));
    const permissoes = snapshot.val() || {};
    return lista.filter((cirurgia) => permissoes[cirurgia.medicoId]?.visualizar || permissoes[cirurgia.medicoId]?.movimentar);
  }
  return [];
}

async function buscarCirurgiasDoMedico(usuario, fallbackLista) {
  const idsBusca = [...new Set([usuario.medicoId, usuario.id].filter(Boolean))];
  const listas = await Promise.all(idsBusca.map((medicoId) => buscarIdsCirurgiasPorMedico(medicoId)));
  const porIndice = Object.values(Object.fromEntries(listas.flat().filter(Boolean).map((cirurgia) => [cirurgia.id, cirurgia])));
  if (porIndice.length) return porIndice.filter((cirurgia) => !cirurgia.arquivada);
  return fallbackLista.filter((cirurgia) => idsBusca.includes(cirurgia.medicoId));
}

function renderizarProximasCirurgias() {
  const lista = proximasCirurgias.slice().sort(compararCirurgias).slice(0, 8);
  document.getElementById("proximasCirurgias").innerHTML = `
    <thead><tr>
      <th>${botaoOrdenacao("Data", "dataHora")}</th>
      <th>${botaoOrdenacao("Início", "inicio")}</th>
      <th>${botaoOrdenacao("Término", "termino")}</th>
      <th>${botaoOrdenacao("Procedimento", "procedimento")}</th>
      <th>${botaoOrdenacao("Paciente", "paciente")}</th>
      <th>${botaoOrdenacao("Médico", "medico")}</th>
      <th>${botaoOrdenacao("Status", "status")}</th>
    </tr></thead>
    <tbody>${lista.map((c) => `<tr><td>${c.dataCirurgia || "-"}</td><td>${formatarHorario(c.horarioInicial)}</td><td>${formatarHorario(c.horarioFinalPrevisto)}</td><td>${c.tipoProcedimento || "-"}</td><td>${dadosDashboard.pacientes[c.pacienteId]?.nome || c.pacienteId || "-"}</td><td>${nomeMedico(c.medicoId)}</td><td><span class="badge badge-soft">${formatarStatus(c.status)}</span></td></tr>`).join("") || `<tr><td colspan="7" class="empty-state">Nenhuma cirurgia cadastrada.</td></tr>`}</tbody>`;
}

function alterarOrdenacaoDashboard(campo) {
  ordenacaoDashboard = {
    campo,
    direcao: ordenacaoDashboard.campo === campo && ordenacaoDashboard.direcao === "asc" ? "desc" : "asc"
  };
  renderizarProximasCirurgias();
}

function botaoOrdenacao(label, campo) {
  const ativo = ordenacaoDashboard.campo === campo;
  const icone = ativo ? (ordenacaoDashboard.direcao === "asc" ? "fa-sort-up" : "fa-sort-down") : "fa-sort";
  return `<button class="sort-btn ${ativo ? "active" : ""}" type="button" data-sort-dashboard="${campo}">${label}<i class="fa-solid ${icone}"></i></button>`;
}

function compararCirurgias(a, b) {
  const direcao = ordenacaoDashboard.direcao === "desc" ? -1 : 1;
  const campo = ordenacaoDashboard.campo;
  const comparadores = {
    dataHora: () => compararDataHora(a, b),
    inicio: () => compararHorario(a.horarioInicial, b.horarioInicial) || compararDataHora(a, b),
    termino: () => compararHorario(a.horarioFinalPrevisto, b.horarioFinalPrevisto) || compararDataHora(a, b),
    paciente: () => compararTexto(dadosDashboard.pacientes[a.pacienteId]?.nome, dadosDashboard.pacientes[b.pacienteId]?.nome) || compararDataHora(a, b),
    medico: () => compararTexto(nomeMedico(a.medicoId), nomeMedico(b.medicoId)) || compararDataHora(a, b),
    procedimento: () => compararTexto(a.tipoProcedimento, b.tipoProcedimento) || compararDataHora(a, b),
    status: () => compararTexto(a.status, b.status) || compararDataHora(a, b)
  };
  return (comparadores[campo]?.() || compararDataHora(a, b)) * direcao;
}

function formatarStatus(status) {
  if (!status) return "-";
  return String(status).replace(/_/g, " ").replace(/\b\p{L}/gu, (letra) => letra.toLocaleUpperCase("pt-BR"));
}

function nomeMedico(medicoId) {
  if (!medicoId) return "-";
  const usuario = dadosDashboard.usuarios?.[medicoId];
  return dadosDashboard.medicos?.[medicoId]?.nome || dadosDashboard.medicos?.[usuario?.medicoId]?.nome || usuario?.nome || "-";
}

function formatarHorario(horario) {
  if (!horario) return "-";
  return String(horario).slice(0, 5);
}

function compararDataHora(a, b) {
  return String(`${a.dataCirurgia || ""}T${a.horarioInicial || "00:00"}`).localeCompare(String(`${b.dataCirurgia || ""}T${b.horarioInicial || "00:00"}`));
}

function compararHorario(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function compararTexto(a, b) {
  return String(a || "").localeCompare(String(b || ""), "pt-BR", { sensitivity: "base" });
}
