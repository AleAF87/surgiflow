import { db } from "./firebase-config.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { usuarioEhAdmin, usuarioEhMedico } from "./services/auth-service.js";
import { buscarIdsCirurgiasPorMedico } from "./services/indexes-service.js";
import { registrarLog } from "./services/logs-service.js";

let appRef = null;
let usuarioAtual = null;
let pacientes = {};
let medicos = {};
let cirurgias = [];

export async function initPage({ usuario, app }) {
  appRef = app;
  usuarioAtual = usuario;

  const [pacientesSnap, medicosSnap, cirurgiasSnap] = await Promise.all([get(ref(db, "pacientes")), get(ref(db, "medicos")), get(ref(db, "cirurgias"))]);
  pacientes = pacientesSnap.val() || {};
  medicos = medicosSnap.val() || {};
  cirurgias = Object.values(cirurgiasSnap.val() || {});

  if (usuarioEhMedico(usuario) && !usuarioEhAdmin(usuario)) {
    cirurgias = await buscarIdsCirurgiasPorMedico(usuario.medicoId || usuario.id);
  }

  document.getElementById("filtroStatusCirurgia")?.addEventListener("change", renderizarTabela);
  document.getElementById("arquivarCirurgiaForm")?.addEventListener("submit", arquivarCirurgia);
  renderizarTabela();
}

function renderizarTabela() {
  const filtroStatus = document.getElementById("filtroStatusCirurgia")?.value || "";
  const cirurgiasFiltradas = cirurgias
    .filter((cirurgia) => !cirurgia.arquivada)
    .filter((cirurgia) => !filtroStatus || String(cirurgia.status || "") === filtroStatus)
    .sort((a, b) => String(a.dataCirurgia || "").localeCompare(String(b.dataCirurgia || "")));

  document.getElementById("cirurgiasTable").innerHTML = `
    <thead><tr><th>Data</th><th>Paciente</th><th>Médico</th><th>Procedimento</th><th>Status</th><th class="text-end">Ações</th></tr></thead>
    <tbody>${cirurgiasFiltradas.map((c) => `
      <tr>
        <td>${c.dataCirurgia || "-"}</td>
        <td>${pacientes[c.pacienteId]?.nome || "-"}</td>
        <td>${medicos[c.medicoId]?.nome || "-"}</td>
        <td>${c.tipoProcedimento || "-"}</td>
        <td><span class="badge badge-soft">${formatarStatus(c.status)}</span></td>
        <td class="text-end">
          <div class="action-buttons">
            <button class="btn btn-sm btn-outline-primary" data-edit-cirurgia="${c.id}"><i class="fa-solid fa-pen me-1"></i>Editar</button>
            <button class="btn btn-sm btn-outline-danger" data-arquivar-cirurgia="${c.id}"><i class="fa-solid fa-box-archive me-1"></i>Arquivar</button>
          </div>
        </td>
      </tr>`).join("") || `<tr><td colspan="6" class="empty-state">Nenhuma cirurgia encontrada.</td></tr>`}</tbody>`;

  document.querySelectorAll("[data-edit-cirurgia]").forEach((button) => button.addEventListener("click", () => {
    sessionStorage.setItem("surgiflowCirurgiaEdicaoId", button.dataset.editCirurgia);
    appRef.loadPage("pages/cirurgia-form.html");
  }));

  document.querySelectorAll("[data-arquivar-cirurgia]").forEach((button) => button.addEventListener("click", () => abrirModalArquivar(button.dataset.arquivarCirurgia)));
}

function abrirModalArquivar(cirurgiaId) {
  const form = document.getElementById("arquivarCirurgiaForm");
  form.reset();
  form.elements.cirurgiaId.value = cirurgiaId;
  bootstrap.Modal.getOrCreateInstance(document.getElementById("arquivarCirurgiaModal")).show();
}

async function arquivarCirurgia(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const cirurgiaId = form.elements.cirurgiaId.value;
  const justificativa = form.elements.justificativa.value.trim();
  const cirurgia = cirurgias.find((item) => item.id === cirurgiaId);
  if (!cirurgia || !justificativa) return;

  const dadosArquivamento = {
    arquivada: true,
    arquivadaEm: new Date().toISOString(),
    arquivadaPor: usuarioAtual?.id || "",
    arquivadaPorNome: usuarioAtual?.nome || "",
    justificativaArquivamento: justificativa,
    statusAnteriorArquivamento: cirurgia.status || ""
  };

  await update(ref(db, `cirurgias/${cirurgiaId}`), dadosArquivamento);
  await registrarLog({
    tipo: "cirurgia.arquivada",
    entidade: "cirurgias",
    entidadeId: cirurgiaId,
    usuarioId: usuarioAtual?.id,
    usuarioNome: usuarioAtual?.nome,
    acao: "Arquivamento de cirurgia",
    dadosAntes: { arquivada: Boolean(cirurgia.arquivada), justificativaArquivamento: cirurgia.justificativaArquivamento || null },
    dadosDepois: dadosArquivamento
  });

  Object.assign(cirurgia, dadosArquivamento);
  bootstrap.Modal.getInstance(document.getElementById("arquivarCirurgiaModal"))?.hide();
  renderizarTabela();
}

function formatarStatus(status) {
  if (!status) return "-";
  return String(status).replace(/_/g, " ").replace(/\b\p{L}/gu, (letra) => letra.toLocaleUpperCase("pt-BR"));
}
