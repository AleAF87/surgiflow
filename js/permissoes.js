import { db } from "./firebase-config.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { concederPermissaoPaciente, removerPermissaoPaciente } from "./services/permission-service.js";
import { registrarLog } from "./services/logs-service.js";
import { nomeNivelAcesso } from "./services/auth-service.js";

let pacientes = {};
let medicos = {};
let solicitacoesAcesso = {};

export async function initPage({ usuario }) {
  const form = document.getElementById("permissaoForm");
  await carregarSelects();
  configurarModalSolicitacao(usuario);
  await renderSolicitacoesAcesso(usuario);
  await renderTabela(usuario);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await concederPermissaoPaciente({
      pacienteId: form.pacienteId.value,
      medicoId: form.medicoId.value,
      visualizar: form.visualizar.value === "true",
      editar: form.editar.value === "true",
      motivo: form.motivo.value,
      usuario
    });
    form.reset();
    await renderTabela(usuario);
  });
}

async function renderSolicitacoesAcesso(usuario) {
  const [loginSnap, usuariosSnap] = await Promise.all([get(ref(db, "login")), get(ref(db, "usuarios"))]);
  const login = loginSnap.val() || {};
  const usuarios = usuariosSnap.val() || {};
  const pendentes = Object.entries(login)
    .map(([uid, dados]) => ({ uid, ...usuarios[uid], ...dados }))
    .filter((item) => String(item.status || "").toLowerCase() === "pendente");

  solicitacoesAcesso = Object.fromEntries(pendentes.map((item) => [item.uid, item]));

  document.getElementById("solicitacoesAcessoTable").innerHTML = `
    <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil solicitado</th><th>CRM/Setor</th><th>Criado em</th><th class="text-end">Ações</th></tr></thead>
    <tbody>${pendentes.map((item) => `<tr>
      <td>${item.nome || "-"}</td>
      <td>${item.email || "-"}</td>
      <td>${nomeNivelAcesso(item.nivelAcesso || item.nivel)}</td>
      <td>${item.crm || item.especialidade || "-"}</td>
      <td>${item.criadoEm ? new Date(item.criadoEm).toLocaleString("pt-BR") : "-"}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary" data-view="${item.uid}">Visualizar</button>
        <button class="btn btn-sm btn-primary" data-approve="${item.uid}">Aprovar</button>
        <button class="btn btn-sm btn-outline-danger" data-reject="${item.uid}">Reprovar</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="6" class="empty-state">Nenhuma solicitação pendente.</td></tr>`}</tbody>`;

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    abrirModalSolicitacao(button.dataset.view, usuario);
  }));
  document.querySelectorAll("[data-approve]").forEach((button) => button.addEventListener("click", async () => {
    await alterarStatusAcesso(button.dataset.approve, "ativo", usuario);
    await renderSolicitacoesAcesso(usuario);
  }));
  document.querySelectorAll("[data-reject]").forEach((button) => button.addEventListener("click", async () => {
    await alterarStatusAcesso(button.dataset.reject, "reprovado", usuario);
    await renderSolicitacoesAcesso(usuario);
  }));
}

function configurarModalSolicitacao(usuario) {
  const form = document.getElementById("solicitacaoAcessoForm");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!podeEditarSolicitacao(usuario)) return;

    const formData = new FormData(form);
    const uid = formData.get("uid");
    const dadosDepois = {
      nome: String(formData.get("nome") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      cpf: String(formData.get("cpf") || "").replace(/\D/g, ""),
      telefone: String(formData.get("telefone") || "").replace(/\D/g, ""),
      nivelAcesso: Number(formData.get("nivelAcesso") || 8),
      crm: String(formData.get("crm") || "").trim(),
      especialidade: String(formData.get("especialidade") || "").trim(),
      observacoes: String(formData.get("observacoes") || "").trim(),
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: usuario.id,
      atualizadoPorNome: usuario.nome
    };

    await salvarDadosSolicitacao(uid, dadosDepois, usuario);
    bootstrap.Modal.getInstance(document.getElementById("solicitacaoAcessoModal"))?.hide();
    await renderSolicitacoesAcesso(usuario);
  });
}

function abrirModalSolicitacao(uid, usuario) {
  const solicitacao = solicitacoesAcesso[uid];
  if (!solicitacao) return;

  const form = document.getElementById("solicitacaoAcessoForm");
  form.uid.value = uid;
  form.nome.value = solicitacao.nome || "";
  form.email.value = solicitacao.email || "";
  form.cpf.value = solicitacao.cpf || "";
  form.telefone.value = solicitacao.telefone || solicitacao.whatsapp || "";
  form.nivelAcesso.value = String(solicitacao.nivelAcesso || solicitacao.nivel || 8);
  form.crm.value = solicitacao.crm || "";
  form.especialidade.value = solicitacao.especialidade || "";
  form.observacoes.value = solicitacao.observacoes || "";

  const podeEditar = podeEditarSolicitacao(usuario);
  form.querySelectorAll("input, select, textarea").forEach((field) => {
    if (field.name !== "uid") field.disabled = !podeEditar;
  });
  form.querySelector("button[type='submit']").classList.toggle("d-none", !podeEditar);

  document.getElementById("solicitacaoAcessoMeta").textContent =
    `Status: ${solicitacao.status || "-"} | Criado em: ${solicitacao.criadoEm ? new Date(solicitacao.criadoEm).toLocaleString("pt-BR") : "-"}`;

  bootstrap.Modal.getOrCreateInstance(document.getElementById("solicitacaoAcessoModal")).show();
}

function podeEditarSolicitacao(usuario) {
  return [1, 2].includes(Number(usuario?.nivelAcesso));
}

async function salvarDadosSolicitacao(uid, dadosDepois, usuario) {
  const dadosAntes = solicitacoesAcesso[uid] || {};
  const updates = {};

  ["nome", "email", "cpf", "telefone", "nivelAcesso", "crm", "especialidade", "observacoes", "atualizadoEm", "atualizadoPor", "atualizadoPorNome"].forEach((campo) => {
    updates[`usuarios/${uid}/${campo}`] = dadosDepois[campo];
  });
  ["nome", "email", "nivelAcesso", "atualizadoEm", "atualizadoPor", "atualizadoPorNome"].forEach((campo) => {
    updates[`login/${uid}/${campo}`] = dadosDepois[campo];
  });

  await update(ref(db), updates);
  await registrarLog({
    tipo: "usuario.solicitacao_editada",
    entidade: "usuarios",
    entidadeId: uid,
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
    acao: "Edição de solicitação de acesso",
    dadosAntes,
    dadosDepois
  });
}

async function alterarStatusAcesso(uid, status, usuario) {
  const now = new Date().toISOString();
  await update(ref(db), {
    [`login/${uid}/status`]: status,
    [`login/${uid}/atualizadoEm`]: now,
    [`login/${uid}/aprovadoPor`]: usuario.id,
    [`login/${uid}/aprovadoPorNome`]: usuario.nome,
    [`usuarios/${uid}/status`]: status,
    [`usuarios/${uid}/atualizadoEm`]: now,
    [`usuarios/${uid}/aprovadoPor`]: usuario.id,
    [`usuarios/${uid}/aprovadoPorNome`]: usuario.nome
  });
  await registrarLog({
    tipo: `usuario.${status}`,
    entidade: "usuarios",
    entidadeId: uid,
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
    acao: status === "ativo" ? "Aprovação de acesso ao sistema" : "Reprovação de acesso ao sistema",
    dadosDepois: { status }
  });
}

async function carregarSelects() {
  const [pacientesSnap, medicosSnap] = await Promise.all([get(ref(db, "pacientes")), get(ref(db, "medicos"))]);
  pacientes = pacientesSnap.val() || {};
  medicos = medicosSnap.val() || {};
  document.querySelector("[name='pacienteId']").innerHTML = `<option value="">Selecione</option>${Object.values(pacientes).map((p) => `<option value="${p.id}">${p.nome}</option>`).join("")}`;
  document.querySelector("[name='medicoId']").innerHTML = `<option value="">Selecione</option>${Object.values(medicos).map((m) => `<option value="${m.id}">${m.nome}</option>`).join("")}`;
}

async function renderTabela(usuario) {
  const snap = await get(ref(db, "permissoes_pacientes"));
  const linhas = Object.entries(snap.val() || {}).flatMap(([pacienteId, porMedico]) => Object.entries(porMedico).map(([medicoId, permissao]) => ({ pacienteId, medicoId, ...permissao })));
  document.getElementById("permissoesTable").innerHTML = `<thead><tr><th>Paciente</th><th>Médico</th><th>Visualizar</th><th>Editar</th><th>Concedido por</th><th>Motivo</th><th></th></tr></thead><tbody>${linhas.map((p) => `<tr><td>${pacientes[p.pacienteId]?.nome || p.pacienteId}</td><td>${medicos[p.medicoId]?.nome || p.medicoId}</td><td>${p.visualizar ? "Sim" : "Não"}</td><td>${p.editar ? "Sim" : "Não"}</td><td>${p.concedidoPorNome || "-"}</td><td>${p.motivo || "-"}</td><td class="text-end"><button class="btn btn-sm btn-outline-danger" data-remove="${p.pacienteId}|${p.medicoId}"><i class="fa-solid fa-trash"></i></button></td></tr>`).join("") || `<tr><td colspan="7" class="empty-state">Nenhuma permissão cadastrada.</td></tr>`}</tbody>`;
  document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", async () => {
    const [pacienteId, medicoId] = button.dataset.remove.split("|");
    await removerPermissaoPaciente({ pacienteId, medicoId, usuario });
    await renderTabela(usuario);
  }));
}
