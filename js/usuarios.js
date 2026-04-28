import { db } from "./firebase-config.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { gerarIdMedico } from "./utils/id-generator.js";
import { nomeNivelAcesso } from "./services/auth-service.js";
import { registrarLog } from "./services/logs-service.js";

let usuarios = [];
let especialidades = {};
let usuarioAtual = null;

const ESPECIALIDADES_INICIAIS = [
  "Anestesiologia",
  "Cardiologia",
  "Cirurgia cardiovascular",
  "Cirurgia geral",
  "Cirurgia plástica",
  "Cirurgia torácica",
  "Cirurgia vascular",
  "Clínica médica",
  "Dermatologia",
  "Ginecologia e obstetrícia",
  "Neurocirurgia",
  "Oftalmologia",
  "Ortopedia e traumatologia",
  "Otorrinolaringologia",
  "Pediatria",
  "Urologia"
];

export async function initPage({ usuario }) {
  usuarioAtual = usuario;
  await garantirEspecialidadesIniciais();
  await carregarDados();
  configurarBusca();
  configurarFormulario();
  renderTabela();
}

async function garantirEspecialidadesIniciais() {
  const snapshot = await get(ref(db, "especialidades"));
  const existentes = snapshot.val() || {};
  const nomesExistentes = new Set(Object.values(existentes).map((item) => String(item.nome || "").toLowerCase()));
  const updates = {};
  ESPECIALIDADES_INICIAIS.forEach((nome) => {
    if (nomesExistentes.has(nome.toLowerCase())) return;
    const id = `esp_${nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    updates[`especialidades/${id}`] = {
      id,
      nome,
      codigo: "",
      observacoes: "",
      criadoEm: new Date().toISOString(),
      origem: "seed"
    };
  });
  if (!Object.keys(updates).length) return;
  await update(ref(db), updates);
}

async function carregarDados() {
  const [usuariosSnap, loginSnap, especialidadesSnap] = await Promise.all([
    get(ref(db, "usuarios")),
    get(ref(db, "login")),
    get(ref(db, "especialidades"))
  ]);
  const usuariosData = usuariosSnap.val() || {};
  const loginData = loginSnap.val() || {};
  especialidades = especialidadesSnap.val() || {};
  const ids = new Set([...Object.keys(usuariosData), ...Object.keys(loginData)]);
  usuarios = Array.from(ids).map((uid) => ({
    uid,
    ...(usuariosData[uid] || {}),
    ...(loginData[uid] || {})
  }));
}

function configurarBusca() {
  document.getElementById("usuariosSearch").addEventListener("input", renderTabela);
  document.getElementById("usuariosStatusFilter").addEventListener("change", renderTabela);
}

function configurarFormulario() {
  const form = document.getElementById("usuarioPerfilForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const uid = formData.get("uid");
    const dadosDepois = {
      nome: String(formData.get("nome") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      status: String(formData.get("status") || "pendente").trim(),
      nivelAcesso: Number(formData.get("nivelAcesso") || 8),
      cpf: String(formData.get("cpf") || "").replace(/\D/g, ""),
      telefone: String(formData.get("telefone") || "").replace(/\D/g, ""),
      crm: String(formData.get("crm") || "").trim(),
      especialidade: String(formData.get("especialidade") || "").trim(),
      observacoes: String(formData.get("observacoes") || "").trim(),
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: usuarioAtual.id,
      atualizadoPorNome: usuarioAtual.nome
    };
    await salvarPerfil(uid, dadosDepois);
    bootstrap.Modal.getInstance(document.getElementById("usuarioPerfilModal"))?.hide();
    await carregarDados();
    renderTabela();
  });
}

function renderTabela() {
  const termo = document.getElementById("usuariosSearch").value.trim().toLowerCase();
  const statusFiltro = document.getElementById("usuariosStatusFilter").value;
  const filtrados = usuarios.filter((usuario) => {
    const nivel = nomeNivelAcesso(usuario.nivelAcesso || usuario.nivel).toLowerCase();
    const especialidadeNome = obterNomeEspecialidade(usuario.especialidade).toLowerCase();
    const texto = [usuario.nome, usuario.email, usuario.status, nivel, usuario.crm, especialidadeNome]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (!termo || texto.includes(termo)) && (!statusFiltro || usuario.status === statusFiltro);
  });

  document.getElementById("usuariosTable").innerHTML = `
    <thead><tr><th>Nome</th><th>E-mail</th><th>Nível</th><th>Status</th><th>CRM/Setor</th><th>Atualizado em</th><th class="text-end">Ações</th></tr></thead>
    <tbody>${filtrados.map((usuario) => `<tr>
      <td>${usuario.nome || "-"}</td>
      <td>${usuario.email || "-"}</td>
      <td>${nomeNivelAcesso(usuario.nivelAcesso || usuario.nivel)}</td>
      <td><span class="badge badge-soft">${usuario.status || "-"}</span></td>
      <td>${usuario.crm || obterNomeEspecialidade(usuario.especialidade) || "-"}</td>
      <td>${usuario.atualizadoEm ? new Date(usuario.atualizadoEm).toLocaleString("pt-BR") : "-"}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-edit="${usuario.uid}"><i class="fa-solid fa-pen me-1"></i>Editar</button></td>
    </tr>`).join("") || `<tr><td colspan="7" class="empty-state">Nenhum usuário encontrado.</td></tr>`}</tbody>`;

  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => abrirModal(button.dataset.edit)));
}

function abrirModal(uid) {
  const usuario = usuarios.find((item) => item.uid === uid);
  if (!usuario) return;
  const form = document.getElementById("usuarioPerfilForm");
  preencherSelectEspecialidades(form.especialidade);
  form.uid.value = uid;
  form.nome.value = usuario.nome || "";
  form.email.value = usuario.email || "";
  form.status.value = usuario.status || "pendente";
  form.nivelAcesso.value = String(usuario.nivelAcesso || usuario.nivel || 8);
  form.cpf.value = usuario.cpf || "";
  form.telefone.value = usuario.telefone || usuario.whatsapp || "";
  form.crm.value = usuario.crm || "";
  form.especialidade.value = usuario.especialidade || "";
  form.observacoes.value = usuario.observacoes || "";
  document.getElementById("usuarioPerfilMeta").textContent =
    `Criado em: ${usuario.criadoEm ? new Date(usuario.criadoEm).toLocaleString("pt-BR") : "-"} | Atualizado em: ${usuario.atualizadoEm ? new Date(usuario.atualizadoEm).toLocaleString("pt-BR") : "-"}`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById("usuarioPerfilModal")).show();
}

function preencherSelectEspecialidades(select) {
  const opcoes = Object.values(especialidades)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
    .map((item) => `<option value="${item.id}">${item.nome}</option>`)
    .join("");
  select.innerHTML = `<option value="">Selecione</option>${opcoes}`;
}

function obterNomeEspecialidade(idOuNome) {
  return especialidades[idOuNome]?.nome || idOuNome || "";
}

async function salvarPerfil(uid, dadosDepois) {
  const dadosAntes = usuarios.find((item) => item.uid === uid) || {};
  const medicoId = await garantirCadastroMedico(uid, dadosAntes, dadosDepois);
  if (medicoId) dadosDepois.medicoId = medicoId;

  const updates = {};
  ["nome", "email", "status", "nivelAcesso", "cpf", "telefone", "crm", "especialidade", "observacoes", "medicoId", "atualizadoEm", "atualizadoPor", "atualizadoPorNome"].forEach((campo) => {
    updates[`usuarios/${uid}/${campo}`] = dadosDepois[campo] ?? "";
  });
  ["nome", "email", "status", "nivelAcesso", "medicoId", "atualizadoEm", "atualizadoPor", "atualizadoPorNome"].forEach((campo) => {
    updates[`login/${uid}/${campo}`] = dadosDepois[campo] ?? "";
  });
  await update(ref(db), updates);
  await registrarLog({
    tipo: "usuario.perfil_editado",
    entidade: "usuarios",
    entidadeId: uid,
    usuarioId: usuarioAtual.id,
    usuarioNome: usuarioAtual.nome,
    acao: "Edição de perfil de usuário",
    dadosAntes,
    dadosDepois
  });
}

async function garantirCadastroMedico(uid, dadosAntes, dadosDepois) {
  if (!dadosDepois.crm) return dadosAntes.medicoId || "";
  const medicoId = dadosAntes.medicoId || gerarIdMedico();
  const medico = {
    id: medicoId,
    nome: dadosDepois.nome,
    crm: dadosDepois.crm,
    especialidade: obterNomeEspecialidade(dadosDepois.especialidade),
    especialidadeId: dadosDepois.especialidade,
    telefone: dadosDepois.telefone,
    email: dadosDepois.email,
    usuarioId: uid,
    atualizadoEm: dadosDepois.atualizadoEm,
    atualizadoPor: usuarioAtual.id,
    atualizadoPorNome: usuarioAtual.nome
  };
  if (!dadosAntes.medicoId) {
    medico.criadoEm = dadosDepois.atualizadoEm;
    medico.criadoPor = usuarioAtual.id;
    medico.criadoPorNome = usuarioAtual.nome;
  }
  await update(ref(db), { [`medicos/${medicoId}`]: medico });
  await registrarLog({
    tipo: dadosAntes.medicoId ? "medico.atualizado_por_usuario" : "medico.criado_por_usuario",
    entidade: "medicos",
    entidadeId: medicoId,
    usuarioId: usuarioAtual.id,
    usuarioNome: usuarioAtual.nome,
    acao: dadosAntes.medicoId ? "Atualização automática de médico pelo perfil do usuário" : "Criação automática de médico pelo perfil do usuário",
    dadosDepois: medico
  });
  return medicoId;
}
