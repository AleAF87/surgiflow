import { db } from "./firebase-config.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { usuarioEhAdmin, usuarioEhMedico, usuarioEhSecretaria } from "./services/auth-service.js";
import { buscarIdsCirurgiasPorMedico } from "./services/indexes-service.js";
import { registrarLog } from "./services/logs-service.js";

let appRef = null;
let usuarioAtual = null;
let pacientes = {};
let medicos = {};
let usuarios = {};
let cirurgias = [];
let ordenacaoCirurgias = { campo: "dataHora", direcao: "asc" };

export async function initPage({ usuario, app }) {
  appRef = app;
  usuarioAtual = usuario;

  const [pacientesSnap, medicosSnap, usuariosSnap, cirurgiasSnap] = await Promise.all([get(ref(db, "pacientes")), get(ref(db, "medicos")), get(ref(db, "usuarios")), get(ref(db, "cirurgias"))]);
  pacientes = pacientesSnap.val() || {};
  medicos = medicosSnap.val() || {};
  usuarios = usuariosSnap.val() || {};
  cirurgias = Object.values(cirurgiasSnap.val() || {});

  if (usuarioEhMedico(usuario) && !usuarioEhAdmin(usuario)) {
    cirurgias = await buscarCirurgiasDoMedico(usuario);
  } else if (usuarioEhSecretaria(usuario)) {
    cirurgias = await filtrarCirurgiasSecretaria(usuario, cirurgias);
  } else if (!usuarioEhAdmin(usuario)) {
    cirurgias = [];
  }

  document.getElementById("filtroStatusCirurgia")?.addEventListener("change", renderizarTabela);
  document.getElementById("arquivarCirurgiaForm")?.addEventListener("submit", arquivarCirurgia);
  document.getElementById("cirurgiasTable")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    alterarOrdenacao(button.dataset.sort);
  });
  renderizarTabela();
}

function renderizarTabela() {
  const filtroStatus = document.getElementById("filtroStatusCirurgia")?.value || "";
  const cirurgiasFiltradas = cirurgias
    .filter((cirurgia) => !cirurgia.arquivada)
    .filter((cirurgia) => !filtroStatus || String(cirurgia.status || "") === filtroStatus)
    .sort(compararCirurgias);

  document.getElementById("cirurgiasTable").innerHTML = `
    <thead><tr>
      <th>${botaoOrdenacao("Data", "dataHora")}</th>
      <th>${botaoOrdenacao("Início", "inicio")}</th>
      <th>${botaoOrdenacao("Término", "termino")}</th>
      <th>${botaoOrdenacao("Paciente", "paciente")}</th>
      <th>${botaoOrdenacao("Médico", "medico")}</th>
      <th>${botaoOrdenacao("Procedimento", "procedimento")}</th>
      <th>${botaoOrdenacao("Status", "status")}</th>
      <th class="text-end">Ações</th>
    </tr></thead>
    <tbody>${cirurgiasFiltradas.map((c) => `
      <tr>
        <td>${c.dataCirurgia || "-"}</td>
        <td>${formatarHorario(c.horarioInicial)}</td>
        <td>${formatarHorario(c.horarioFinalPrevisto)}</td>
        <td>${pacientes[c.pacienteId]?.nome || "-"}</td>
        <td>${nomeMedico(c.medicoId)}</td>
        <td>${c.tipoProcedimento || "-"}</td>
        <td><span class="badge badge-soft">${formatarStatus(c.status)}</span></td>
        <td class="text-end">
          <div class="action-buttons">
            <button class="btn btn-sm btn-outline-primary" data-edit-cirurgia="${c.id}"><i class="fa-solid fa-pen me-1"></i>Editar</button>
            <button class="btn btn-sm btn-outline-danger" data-arquivar-cirurgia="${c.id}"><i class="fa-solid fa-box-archive me-1"></i>Arquivar</button>
          </div>
        </td>
      </tr>`).join("") || `<tr><td colspan="8" class="empty-state">Nenhuma cirurgia encontrada.</td></tr>`}</tbody>`;

  document.querySelectorAll("[data-edit-cirurgia]").forEach((button) => button.addEventListener("click", () => {
    sessionStorage.setItem("surgiflowCirurgiaEdicaoId", button.dataset.editCirurgia);
    appRef.loadPage("pages/cirurgia-form.html");
  }));

  document.querySelectorAll("[data-arquivar-cirurgia]").forEach((button) => button.addEventListener("click", () => abrirModalArquivar(button.dataset.arquivarCirurgia)));
}

function alterarOrdenacao(campo) {
  ordenacaoCirurgias = {
    campo,
    direcao: ordenacaoCirurgias.campo === campo && ordenacaoCirurgias.direcao === "asc" ? "desc" : "asc"
  };
  renderizarTabela();
}

function botaoOrdenacao(label, campo) {
  const ativo = ordenacaoCirurgias.campo === campo;
  const icone = ativo ? (ordenacaoCirurgias.direcao === "asc" ? "fa-sort-up" : "fa-sort-down") : "fa-sort";
  return `<button class="sort-btn ${ativo ? "active" : ""}" type="button" data-sort="${campo}">${label}<i class="fa-solid ${icone}"></i></button>`;
}

function compararCirurgias(a, b) {
  const direcao = ordenacaoCirurgias.direcao === "desc" ? -1 : 1;
  const campo = ordenacaoCirurgias.campo;
  const comparadores = {
    dataHora: () => compararDataHora(a, b),
    inicio: () => compararHorario(a.horarioInicial, b.horarioInicial) || compararDataHora(a, b),
    termino: () => compararHorario(a.horarioFinalPrevisto, b.horarioFinalPrevisto) || compararDataHora(a, b),
    paciente: () => compararTexto(pacientes[a.pacienteId]?.nome, pacientes[b.pacienteId]?.nome) || compararDataHora(a, b),
    medico: () => compararTexto(nomeMedico(a.medicoId), nomeMedico(b.medicoId)) || compararDataHora(a, b),
    procedimento: () => compararTexto(a.tipoProcedimento, b.tipoProcedimento) || compararDataHora(a, b),
    status: () => compararTexto(a.status, b.status) || compararDataHora(a, b)
  };
  return (comparadores[campo]?.() || compararDataHora(a, b)) * direcao;
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

function nomeMedico(medicoId) {
  if (!medicoId) return "-";
  const usuario = usuarios[medicoId];
  return medicos[medicoId]?.nome || medicos[usuario?.medicoId]?.nome || usuario?.nome || "-";
}

async function buscarCirurgiasDoMedico(usuario) {
  const idsBusca = [...new Set([usuario.medicoId, usuario.id].filter(Boolean))];
  const listas = await Promise.all(idsBusca.map((medicoId) => buscarIdsCirurgiasPorMedico(medicoId)));
  const porIndice = Object.values(Object.fromEntries(listsToEntries(listas)));
  if (porIndice.length) return porIndice;
  return cirurgias.filter((cirurgia) => idsBusca.includes(cirurgia.medicoId));
}

function listsToEntries(listas) {
  return listas.flat().filter(Boolean).map((cirurgia) => [cirurgia.id, cirurgia]);
}

async function filtrarCirurgiasSecretaria(usuario, lista) {
  const snapshot = await get(ref(db, `permissoes_secretarias_medicos/${usuario.id}`));
  const permissoes = snapshot.val() || {};
  return lista.filter((cirurgia) => permissoes[cirurgia.medicoId]?.visualizar || permissoes[cirurgia.medicoId]?.movimentar);
}
