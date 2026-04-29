import { db } from "./firebase-config.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { registrarLog } from "./services/logs-service.js";

let usuarioAtual = null;
let usuarios = {};
let medicos = {};
let permissoesAtuais = {};

export async function initPage({ usuario }) {
  usuarioAtual = usuario;
  const [usuariosSnap, medicosSnap] = await Promise.all([
    get(ref(db, "usuarios")),
    get(ref(db, "medicos"))
  ]);
  usuarios = usuariosSnap.val() || {};
  medicos = medicosSnap.val() || {};
  preencherSecretarias();
  document.getElementById("secretariaSelect").addEventListener("change", carregarPermissoesSecretaria);
  document.getElementById("salvarPermissoesSecretaria").addEventListener("click", salvarPermissoes);
  permissoesAtuais = {};
  renderTabela();
}

function preencherSecretarias() {
  const secretarias = Object.entries(usuarios)
    .filter(([, usuario]) => Number(usuario.nivelAcesso || usuario.nivel) === 4)
    .sort(([, a], [, b]) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  document.getElementById("secretariaSelect").innerHTML = `<option value="">Selecione uma secretária</option>${secretarias.map(([id, usuario]) => `<option value="${id}">${usuario.nome || usuario.email || id}</option>`).join("")}`;
}

async function carregarPermissoesSecretaria() {
  const secretariaId = document.getElementById("secretariaSelect").value;
  if (!secretariaId) {
    permissoesAtuais = {};
    renderTabela();
    return;
  }
  const snapshot = await get(ref(db, `permissoes_secretarias_medicos/${secretariaId}`));
  permissoesAtuais = snapshot.val() || {};
  renderTabela();
}

function renderTabela() {
  const secretariaId = document.getElementById("secretariaSelect").value;
  if (!secretariaId) {
    document.getElementById("permissoesSecretariasTable").innerHTML = `<tbody><tr><td class="empty-state">Selecione uma secretária para carregar a lista de médicos.</td></tr></tbody>`;
    return;
  }
  const listaMedicos = Object.values(medicos).sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  document.getElementById("permissoesSecretariasTable").innerHTML = `
    <thead><tr><th>Médico</th><th>CRM</th><th class="text-center">Visualizar no calendário</th><th class="text-center">Movimentar no calendário</th></tr></thead>
    <tbody>${listaMedicos.map((medico) => `
      <tr>
        <td>${medico.nome || "-"}</td>
        <td>${medico.crm || "-"}</td>
        <td class="text-center"><input class="form-check-input permissao-secretaria" type="checkbox" data-medico-id="${medico.id}" data-campo="visualizar" ${permissoesAtuais[medico.id]?.visualizar ? "checked" : ""}></td>
        <td class="text-center"><input class="form-check-input permissao-secretaria" type="checkbox" data-medico-id="${medico.id}" data-campo="movimentar" ${permissoesAtuais[medico.id]?.movimentar ? "checked" : ""}></td>
      </tr>`).join("") || `<tr><td colspan="4" class="empty-state">Nenhum médico cadastrado.</td></tr>`}</tbody>`;
}

async function salvarPermissoes() {
  const secretariaId = document.getElementById("secretariaSelect").value;
  if (!secretariaId) {
    alert("Selecione uma secretária antes de salvar.");
    return;
  }
  const permissoes = {};
  document.querySelectorAll(".permissao-secretaria").forEach((input) => {
    const medicoId = input.dataset.medicoId;
    const campo = input.dataset.campo;
    permissoes[medicoId] = permissoes[medicoId] || { visualizar: false, movimentar: false };
    permissoes[medicoId][campo] = input.checked;
  });
  Object.values(permissoes).forEach((permissao) => {
    if (permissao.movimentar) permissao.visualizar = true;
    permissao.concedidoPor = usuarioAtual.id;
    permissao.concedidoPorNome = usuarioAtual.nome;
    permissao.concedidoEm = new Date().toISOString();
  });
  const updates = {};
  Object.entries(permissoes).forEach(([medicoId, permissao]) => {
    updates[`permissoes_secretarias_medicos/${secretariaId}/${medicoId}`] = permissao.visualizar || permissao.movimentar ? permissao : null;
  });
  await update(ref(db), updates);
  await registrarLog({
    tipo: "permissao_secretaria.atualizada",
    entidade: "permissoes_secretarias_medicos",
    entidadeId: secretariaId,
    usuarioId: usuarioAtual.id,
    usuarioNome: usuarioAtual.nome,
    acao: "Atualização de permissões de secretária por médico",
    dadosAntes: permissoesAtuais,
    dadosDepois: permissoes
  });
  alert("Permissões salvas com sucesso.");
  await carregarPermissoesSecretaria();
}
