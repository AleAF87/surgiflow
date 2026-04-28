import { db } from "./firebase-config.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { confirmarAção } from "./app-core.js";
import { registrarLog } from "./services/logs-service.js";

let usuarioAtual = null;
let pacientes = {};
let medicos = {};
let cirurgiasArquivadas = [];

export async function initPage({ usuario }) {
  usuarioAtual = usuario;
  await carregarDados();
  renderizarTabela();
}

async function carregarDados() {
  const [pacientesSnap, medicosSnap, cirurgiasSnap] = await Promise.all([get(ref(db, "pacientes")), get(ref(db, "medicos")), get(ref(db, "cirurgias"))]);
  pacientes = pacientesSnap.val() || {};
  medicos = medicosSnap.val() || {};
  cirurgiasArquivadas = Object.values(cirurgiasSnap.val() || {})
    .filter((cirurgia) => cirurgia.arquivada)
    .sort((a, b) => String(b.arquivadaEm || "").localeCompare(String(a.arquivadaEm || "")));
}

function renderizarTabela() {
  document.getElementById("cirurgiasArquivadasTable").innerHTML = `
    <thead><tr><th>Data</th><th>Paciente</th><th>Médico</th><th>Procedimento</th><th>Status</th><th>Arquivada em</th><th>Justificativa</th><th class="text-end">Ações</th></tr></thead>
    <tbody>${cirurgiasArquivadas.map((c) => `
      <tr>
        <td>${c.dataCirurgia || "-"}</td>
        <td>${pacientes[c.pacienteId]?.nome || "-"}</td>
        <td>${medicos[c.medicoId]?.nome || "-"}</td>
        <td>${c.tipoProcedimento || "-"}</td>
        <td><span class="badge badge-soft">${formatarStatus(c.status)}</span></td>
        <td>${formatarDataHora(c.arquivadaEm)}</td>
        <td>${c.justificativaArquivamento || "-"}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-reativar-cirurgia="${c.id}"><i class="fa-solid fa-rotate-left me-1"></i>Reativar</button></td>
      </tr>`).join("") || `<tr><td colspan="8" class="empty-state">Nenhuma cirurgia arquivada.</td></tr>`}</tbody>`;

  document.querySelectorAll("[data-reativar-cirurgia]").forEach((button) => button.addEventListener("click", () => reativarCirurgia(button.dataset.reativarCirurgia)));
}

async function reativarCirurgia(cirurgiaId) {
  const cirurgia = cirurgiasArquivadas.find((item) => item.id === cirurgiaId);
  if (!cirurgia) return;

  const confirmado = await confirmarAção({
    titulo: "Reativar cirurgia",
    mensagem: "Deseja devolver esta cirurgia para a lista ativa?",
    textoConfirmar: "Reativar"
  });
  if (!confirmado) return;

  const dadosReativacao = {
    arquivada: false,
    reativadaEm: new Date().toISOString(),
    reativadaPor: usuarioAtual?.id || "",
    reativadaPorNome: usuarioAtual?.nome || ""
  };

  await update(ref(db, `cirurgias/${cirurgiaId}`), dadosReativacao);
  await registrarLog({
    tipo: "cirurgia.reativada",
    entidade: "cirurgias",
    entidadeId: cirurgiaId,
    usuarioId: usuarioAtual?.id,
    usuarioNome: usuarioAtual?.nome,
    acao: "Reativação de cirurgia arquivada",
    dadosAntes: { arquivada: true, justificativaArquivamento: cirurgia.justificativaArquivamento || null },
    dadosDepois: dadosReativacao
  });

  cirurgiasArquivadas = cirurgiasArquivadas.filter((item) => item.id !== cirurgiaId);
  renderizarTabela();
}

function formatarStatus(status) {
  if (!status) return "-";
  return String(status).replace(/_/g, " ").replace(/\b\p{L}/gu, (letra) => letra.toLocaleUpperCase("pt-BR"));
}

function formatarDataHora(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
