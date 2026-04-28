import { db } from "./firebase-config.js";
import { get, ref, set, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { gerarIdCirurgia, gerarId } from "./utils/id-generator.js";
import { registrarLog, obterCamposAlterados } from "./services/logs-service.js";
import { criarIndicesConsultaCirurgia, atualizarIndiceMedicoConsulta, atualizarIndicePacienteConsulta } from "./services/indexes-service.js";
import { adicionarAnexoCirurgia, adicionarAnexoGastoCirurgico } from "./services/anexos-service.js";

let materiaisAdicionados = [];
let gastosCirurgicos = [];
let movimentacoes = [];
let selects = {};

const QUICK_CREATE_CONFIG = {
  pacientes: {
    titulo: "Novo paciente",
    path: "pacientes",
    prefix: "p",
    selectName: "pacienteId",
    campos: [
      { name: "nome", label: "Nome", required: true },
      { name: "cpf", label: "CPF" },
      { name: "telefone", label: "Telefone" },
      { name: "email", label: "E-mail" },
      { name: "observacoes", label: "Observações" }
    ]
  },
  medicos: {
    titulo: "Novo médico",
    path: "medicos",
    prefix: "m",
    selectName: "medicoId",
    campos: [
      { name: "nome", label: "Nome", required: true },
      { name: "crm", label: "CRM" },
      { name: "especialidade", label: "Especialidade" },
      { name: "telefone", label: "Telefone" },
      { name: "email", label: "E-mail" }
    ]
  },
  hospitais: {
    titulo: "Novo hospital",
    path: "hospitais",
    prefix: "h",
    selectName: "hospitalId",
    campos: [
      { name: "nome", label: "Nome", required: true },
      { name: "cidade", label: "Cidade" },
      { name: "telefone", label: "Telefone" },
      { name: "responsavel", label: "Responsável" }
    ]
  },
  convenios: {
    titulo: "Novo convênio",
    path: "convenios",
    prefix: "cv",
    selectName: "convenioId",
    campos: [
      { name: "nome", label: "Nome", required: true },
      { name: "codigo", label: "Código" },
      { name: "cidade", label: "Cidade" },
      { name: "telefone", label: "Telefone" },
      { name: "observacoes", label: "Observações" }
    ]
  },
  materiais: {
    titulo: "Novo material",
    path: "materiais",
    prefix: "mat",
    selectName: "materialSelect",
    campos: [
      { name: "nome", label: "Nome", required: true },
      { name: "codigo", label: "Código" },
      { name: "unidade", label: "Unidade" },
      { name: "valor", label: "Valor" },
      { name: "observacoes", label: "Observações" }
    ]
  },
  tiposCirurgias: {
    titulo: "Novo tipo de cirurgia",
    path: "tipos_cirurgias",
    prefix: "tc",
    selectName: "tipoProcedimentoId",
    campos: [
      { name: "nome", label: "Nome", required: true },
      { name: "codigo", label: "Código" },
      { name: "observacoes", label: "Observações" }
    ]
  }
};

export async function initPage({ usuario }) {
  const form = document.getElementById("cirurgiaForm");
  selects = await carregarSelects();
  aplicarMedicoDoUsuario(usuario);
  await carregarCirurgiaEmEdicao(usuario);
  renderMateriais();
  renderGastos();
  renderMovimentacoes();
  configurarCadastroRapido(usuario);
  document.getElementById("addMaterial").addEventListener("click", adicionarMaterialSelecionado);
  document.getElementById("materiaisTable").addEventListener("input", (event) => {
    const input = event.target.closest(".material-quantidade");
    if (!input) return;
    const index = Number(input.dataset.index);
    if (materiaisAdicionados[index]) materiaisAdicionados[index].quantidade = Number(input.value || 0);
  });
  document.getElementById("materiaisTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-material]");
    if (!button) return;
    materiaisAdicionados.splice(Number(button.dataset.removeMaterial), 1);
    renderMateriais();
  });
  document.getElementById("addGasto").addEventListener("click", () => {
    sincronizarGastosDoDom();
    gastosCirurgicos.push({ id: gerarId("g"), descricao: "", valor: "", anexos: {} });
    renderGastos();
  });
  document.getElementById("gastosTable").addEventListener("input", () => {
    sincronizarGastosDoDom();
    atualizarTotalGastos();
  });
  document.getElementById("gastosTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-gasto]");
    if (!button) return;
    sincronizarGastosDoDom();
    gastosCirurgicos.splice(Number(button.dataset.removeGasto), 1);
    renderGastos();
  });
  document.getElementById("addMovimentacao").addEventListener("click", async () => adicionarMovimentacao(usuario));
  form.addEventListener("submit", (event) => salvarCirurgia(event, usuario));
}

function aplicarMedicoDoUsuario(usuario) {
  if (Number(usuario?.nivelAcesso) !== 3) return;
  const medicoId = usuario.medicoId || usuario.id;
  const select = document.querySelector('[name="medicoId"]');
  if (select && medicoId) {
    if (![...select.options].some((option) => option.value === medicoId)) {
      select.insertAdjacentHTML("beforeend", `<option value="${medicoId}">${usuario.nome || "Médico"}</option>`);
    }
    select.value = medicoId;
    select.disabled = true;
  }
}

async function carregarCirurgiaEmEdicao(usuario) {
  const cirurgiaId = sessionStorage.getItem("surgiflowCirurgiaEdicaoId");
  if (!cirurgiaId) return;
  sessionStorage.removeItem("surgiflowCirurgiaEdicaoId");
  const snapshot = await get(ref(db, `cirurgias/${cirurgiaId}`));
  if (!snapshot.exists()) return;
  const cirurgia = snapshot.val();
  preencherFormularioCirurgia(cirurgia, usuario);
}

function preencherFormularioCirurgia(cirurgia, usuario) {
  const form = document.getElementById("cirurgiaForm");
  form.elements.id.value = cirurgia.id || "";
  form.pacienteId.value = cirurgia.pacienteId || "";
  form.medicoId.value = cirurgia.medicoId || usuario.medicoId || usuario.id || "";
  form.hospitalId.value = cirurgia.hospitalId || "";
  form.convenioId.value = cirurgia.convenioId || "";
  form.tipoProcedimentoId.value = cirurgia.tipoProcedimentoId || "";
  form.dataCirurgia.value = cirurgia.dataCirurgia || "";
  form.horarioInicial.value = cirurgia.horarioInicial || "";
  form.horarioFinalPrevisto.value = cirurgia.horarioFinalPrevisto || "";
  form.status.value = cirurgia.status || "agendada";
  form.observacoes.value = cirurgia.observacoes || "";
  materiaisAdicionados = Array.isArray(cirurgia.materiais) ? cirurgia.materiais : Object.values(cirurgia.materiais || {});
  gastosCirurgicos = Object.values(cirurgia.gastosCirurgicos || {});
  movimentacoes = Object.values(cirurgia.movimentacoes || {});
  aplicarMedicoDoUsuario(usuario);
}

async function carregarSelects() {
  const paths = ["pacientes", "medicos", "hospitais", "convenios", "materiais", "tipos_cirurgias"];
  const dados = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, (await get(ref(db, path))).val() || {}])));
  preencherSelect("pacienteId", dados.pacientes);
  preencherSelect("medicoId", dados.medicos);
  preencherSelect("hospitalId", dados.hospitais);
  preencherSelect("convenioId", dados.convenios);
  preencherSelect("materialSelect", dados.materiais);
  preencherSelect("tipoProcedimentoId", dados.tipos_cirurgias);
  return dados;
}

function preencherSelect(nameOrId, dados) {
  const select = document.querySelector(`[name="${nameOrId}"]`) || document.getElementById(nameOrId);
  select.innerHTML = `<option value="">Selecione</option>${Object.values(dados).map((item) => `<option value="${item.id}">${item.nome || item.id}</option>`).join("")}`;
}

function configurarCadastroRapido(usuario) {
  document.querySelectorAll(".quick-create-btn").forEach((button) => {
    button.addEventListener("click", () => abrirModalCadastroRapido(button.dataset.entity));
  });
  document.getElementById("quickCreateForm").addEventListener("submit", (event) => salvarCadastroRapido(event, usuario));
}

function abrirModalCadastroRapido(entity) {
  const config = QUICK_CREATE_CONFIG[entity];
  if (!config) return;
  const form = document.getElementById("quickCreateForm");
  form.reset();
  form.entity.value = entity;
  document.getElementById("quickCreateTitle").textContent = config.titulo;
  document.getElementById("quickCreateFields").innerHTML = config.campos.map((campo) => `
    <div class="mb-3">
      <label class="form-label" for="quick_${campo.name}">${campo.label}</label>
      <input class="form-control" id="quick_${campo.name}" name="${campo.name}" ${campo.name === "valor" ? 'type="number" step="0.01" min="0"' : ""} ${campo.required ? "required" : ""}>
    </div>`).join("");
  bootstrap.Modal.getOrCreateInstance(document.getElementById("quickCreateModal")).show();
}

async function salvarCadastroRapido(event, usuario) {
  event.preventDefault();
  const form = event.currentTarget;
  sincronizarGastosDoDom();
  const estadoFormulario = capturarEstadoFormularioCirurgia();
  const entity = form.entity.value;
  const config = QUICK_CREATE_CONFIG[entity];
  if (!config) return;

  const id = gerarId(config.prefix);
  const now = new Date().toISOString();
  const dados = {
    id,
    criadoEm: now,
    criadoPor: usuario.id,
    criadoPorNome: usuario.nome,
    atualizadoEm: now,
    atualizadoPor: usuario.id,
    atualizadoPorNome: usuario.nome
  };
  config.campos.forEach((campo) => {
    dados[campo.name] = campo.name === "valor"
      ? Number(String(form[campo.name]?.value || "0").replace(",", ".") || 0)
      : String(form[campo.name]?.value || "").trim();
  });

  await set(ref(db, `${config.path}/${id}`), dados);
  await registrarLog({
    tipo: `${config.path}.criado`,
    entidade: config.path,
    entidadeId: id,
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
    acao: `Criação de ${config.titulo.toLowerCase()}`,
    dadosDepois: dados
  });

  selects = await carregarSelects();
  restaurarEstadoFormularioCirurgia(estadoFormulario);
  const select = document.querySelector(`[name="${config.selectName}"]`) || document.getElementById(config.selectName);
  if (select) select.value = id;
  bootstrap.Modal.getInstance(document.getElementById("quickCreateModal"))?.hide();
}

function capturarEstadoFormularioCirurgia() {
  const form = document.getElementById("cirurgiaForm");
  return {
    id: form.elements.id.value,
    pacienteId: form.pacienteId.value,
    medicoId: form.medicoId.value || usuario.medicoId || usuario.id,
    hospitalId: form.hospitalId.value,
    convenioId: form.convenioId.value,
    tipoProcedimentoId: form.tipoProcedimentoId.value,
    dataCirurgia: form.dataCirurgia.value,
    horarioInicial: form.horarioInicial.value,
    horarioFinalPrevisto: form.horarioFinalPrevisto.value,
    status: form.status.value,
    observacoes: form.observacoes.value,
    materialSelect: document.getElementById("materialSelect").value,
    materialQuantidade: document.getElementById("materialQuantidade").value,
    materialObservacao: document.getElementById("materialObservacao").value,
    movimentacaoComentario: document.getElementById("movimentacaoComentario").value,
    movimentacaoDataDocumento: document.getElementById("movimentacaoDataDocumento").value
  };
}

function restaurarEstadoFormularioCirurgia(estado) {
  const form = document.getElementById("cirurgiaForm");
  form.elements.id.value = estado.id || "";
  form.pacienteId.value = estado.pacienteId || "";
  form.medicoId.value = estado.medicoId || "";
  form.hospitalId.value = estado.hospitalId || "";
  form.convenioId.value = estado.convenioId || "";
  form.tipoProcedimentoId.value = estado.tipoProcedimentoId || "";
  form.dataCirurgia.value = estado.dataCirurgia || "";
  form.horarioInicial.value = estado.horarioInicial || "";
  form.horarioFinalPrevisto.value = estado.horarioFinalPrevisto || "";
  form.status.value = estado.status || "agendada";
  form.observacoes.value = estado.observacoes || "";
  document.getElementById("materialSelect").value = estado.materialSelect || "";
  document.getElementById("materialQuantidade").value = estado.materialQuantidade || "1";
  document.getElementById("materialObservacao").value = estado.materialObservacao || "";
  document.getElementById("movimentacaoComentario").value = estado.movimentacaoComentario || "";
  document.getElementById("movimentacaoDataDocumento").value = estado.movimentacaoDataDocumento || "";
  renderGastos();
  renderMateriais();
  renderMovimentacoes();
}

function adicionarMaterialSelecionado() {
  const select = document.getElementById("materialSelect");
  const material = selects.materiais[select.value];
  if (!material) return;
  const quantidade = Number(document.getElementById("materialQuantidade").value || 1);
  const existente = materiaisAdicionados.find((item) => item.materialId === material.id);
  if (existente) {
    const deveSomar = confirm("Este material já foi adicionado. Deseja somar a quantidade ao item existente?");
    if (!deveSomar) return;
    existente.quantidade = Number(existente.quantidade || 0) + quantidade;
    const observacaoExtra = document.getElementById("materialObservacao").value.trim();
    if (observacaoExtra) existente.observacao = [existente.observacao, observacaoExtra].filter(Boolean).join(" | ");
    renderMateriais();
    return;
  }
  materiaisAdicionados.push({
    materialId: material.id,
    nome: material.nome,
    quantidade,
    observacao: document.getElementById("materialObservacao").value.trim()
  });
  renderMateriais();
}

function renderMateriais() {
  document.getElementById("materiaisTable").innerHTML = `
    <thead><tr><th>Material</th><th style="width: 180px;">Quantidade</th><th>Observação</th><th class="text-end">Ações</th></tr></thead>
    <tbody>${materiaisAdicionados.map((m, index) => `<tr>
      <td>${m.nome}</td>
      <td><input class="form-control material-quantidade" data-index="${index}" type="number" min="0" step="1" value="${m.quantidade}"></td>
      <td>${m.observacao || "-"}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-material="${index}"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`).join("") || `<tr><td colspan="4" class="empty-state">Nenhum material adicionado.</td></tr>`}</tbody>`;
}

function renderGastos() {
  document.getElementById("gastosTable").innerHTML = `
    <thead><tr><th>Descrição</th><th style="width: 180px;">Valor</th><th>Anexo</th><th class="text-end">Ações</th></tr></thead>
    <tbody>${gastosCirurgicos.map((gasto, index) => `
      <tr>
        <td><input class="form-control gasto-descricao" data-index="${index}" value="${gasto.descricao || ""}"></td>
        <td><input class="form-control gasto-valor" data-index="${index}" type="number" step="0.01" min="0" value="${gasto.valor || ""}"></td>
        <td><input class="form-control gasto-anexo" data-index="${index}" type="file"></td>
        <td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-gasto="${index}"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`).join("") || `<tr><td colspan="4" class="empty-state">Nenhum gasto cirúrgico adicionado.</td></tr>`}</tbody>`;
  atualizarTotalGastos();
}

function sincronizarGastosDoDom() {
  document.querySelectorAll(".gasto-descricao").forEach((input) => {
    if (gastosCirurgicos[input.dataset.index]) gastosCirurgicos[input.dataset.index].descricao = input.value;
  });
  document.querySelectorAll(".gasto-valor").forEach((input) => {
    if (gastosCirurgicos[input.dataset.index]) gastosCirurgicos[input.dataset.index].valor = Number(input.value || 0);
  });
}

function atualizarTotalGastos() {
  const total = gastosCirurgicos.reduce((sum, gasto) => sum + Number(gasto.valor || 0), 0);
  document.getElementById("totalGastos").textContent = `Total: ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
}

function renderMovimentacoes() {
  document.getElementById("movimentacoesTable").innerHTML = `
    <thead><tr><th>Data/hora</th><th>Usuário</th><th>Comentário</th><th>Anexo</th></tr></thead>
    <tbody>${movimentacoes
      .slice()
      .sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)))
      .map((mov) => `<tr>
        <td>${mov.dataHora ? new Date(mov.dataHora).toLocaleString("pt-BR") : "-"}</td>
        <td>${mov.usuarioNome || "-"}</td>
        <td>${mov.comentario || "-"}</td>
        <td>${mov.anexo?.secure_url ? `<a href="${mov.anexo.secure_url}" target="_blank" rel="noopener">Visualizar</a>` : "-"}</td>
      </tr>`).join("") || `<tr><td colspan="4" class="empty-state">Nenhuma movimentação registrada.</td></tr>`}</tbody>`;
}

async function salvarCirurgia(event, usuario) {
  event.preventDefault();
  const form = event.currentTarget;
  sincronizarGastosDoDom();
  const cirurgiaId = form.elements.id.value || gerarIdCirurgia();
  const anteriorSnap = await get(ref(db, `cirurgias/${cirurgiaId}`));
  const anterior = anteriorSnap.val();
  const cirurgia = {
    id: cirurgiaId,
    pacienteId: form.pacienteId.value,
    medicoId: form.medicoId.value,
    hospitalId: form.hospitalId.value,
    convenioId: form.convenioId.value,
    tipoProcedimentoId: form.tipoProcedimentoId.value,
    tipoProcedimento: selects.tipos_cirurgias?.[form.tipoProcedimentoId.value]?.nome || "",
    dataCirurgia: form.dataCirurgia.value,
    horarioInicial: form.horarioInicial.value,
    horarioFinalPrevisto: form.horarioFinalPrevisto.value,
    status: form.status.value,
    materiais: materiaisAdicionados,
    gastosCirurgicos: Object.fromEntries(gastosCirurgicos.map((g) => [g.id, g])),
    totalGastosCirurgicos: gastosCirurgicos.reduce((sum, gasto) => sum + Number(gasto.valor || 0), 0),
    movimentacoes: Object.fromEntries(movimentacoes.map((mov) => [mov.id, mov])),
    observacoes: form.observacoes.value.trim(),
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: usuario.id,
    atualizadoPorNome: usuario.nome,
    historicoAlteracoes: [
      ...(anterior?.historicoAlteracoes || []),
      { dataHora: new Date().toISOString(), usuarioId: usuario.id, usuarioNome: usuario.nome, acao: anterior ? "edição" : "criação" }
    ]
  };
  if (!anterior) cirurgia.criadoEm = cirurgia.atualizadoEm;
  const updates = {};
  updates[`cirurgias/${cirurgiaId}`] = cirurgia;
  updates[`consultas_por_medico/${cirurgia.medicoId}/${cirurgiaId}`] = true;
  updates[`consultas_por_paciente/${cirurgia.pacienteId}/${cirurgiaId}`] = true;
  await update(ref(db), updates);
  if (anterior) {
    await atualizarIndiceMedicoConsulta({ cirurgiaId, medicoAntigoId: anterior.medicoId, medicoNovoId: cirurgia.medicoId, usuario });
    await atualizarIndicePacienteConsulta({ cirurgiaId, pacienteAntigoId: anterior.pacienteId, pacienteNovoId: cirurgia.pacienteId, usuario });
  } else {
    await criarIndicesConsultaCirurgia({ cirurgiaId, medicoId: cirurgia.medicoId, pacienteId: cirurgia.pacienteId, usuario });
  }
  const alterados = obterCamposAlterados(anterior || {}, cirurgia);
  await registrarLog({
    tipo: anterior ? "cirurgia.editada" : "cirurgia.criada",
    entidade: "cirurgias",
    entidadeId: cirurgiaId,
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
    acao: anterior ? "Edição de cirurgia" : "Criação de cirurgia",
    dadosAntes: alterados.dadosAntes,
    dadosDepois: alterados.dadosDepois
  });
  for (const input of document.querySelectorAll(".gasto-anexo")) {
    const file = input.files?.[0];
    const gasto = gastosCirurgicos[input.dataset.index];
    if (file && gasto?.id) {
      await adicionarAnexoGastoCirurgico({
        file,
        cirurgiaId,
        gastoId: gasto.id,
        dataDocumento: form.dataCirurgia.value,
        descricao: gasto.descricao || "Anexo de gasto cirúrgico",
        usuario
      });
      await registrarLog({
        tipo: "gasto_cirurgico.anexo_adicionado",
        entidade: "gastosCirurgicos",
        entidadeId: gasto.id,
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        acao: anterior ? "Edição de gasto cirúrgico" : "Criação de gasto cirúrgico",
        dadosDepois: gasto
      });
    }
  }
  form.elements.id.value = cirurgiaId;
  alert("Cirurgia salva com sucesso.");
}

async function adicionarMovimentacao(usuario) {
  const cirurgiaId = document.querySelector("[name='id']").value;
  const comentario = document.getElementById("movimentacaoComentario").value.trim();
  const file = document.getElementById("movimentacaoAnexo").files[0];
  const dataDocumento = document.getElementById("movimentacaoDataDocumento").value;
  if (!comentario && !file) {
    alert("Informe um comentário ou selecione um anexo.");
    return;
  }
  if (file && !cirurgiaId) {
    alert("Salve a cirurgia antes de anexar arquivos.");
    return;
  }
  const mov = {
    id: gerarId("mov"),
    comentario,
    dataDocumento,
    dataHora: new Date().toISOString(),
    usuarioId: usuario.id,
    usuarioNome: usuario.nome
  };
  if (file) {
    mov.anexo = await adicionarAnexoCirurgia({
      file,
      cirurgiaId,
      dataDocumento,
      descricao: comentario || "Movimentação da cirurgia",
      usuario
    });
  }
  movimentacoes.push(mov);
  if (cirurgiaId) {
    await update(ref(db), { [`cirurgias/${cirurgiaId}/movimentacoes/${mov.id}`]: mov });
    await registrarLog({
      tipo: "cirurgia.movimentacao_adicionada",
      entidade: "cirurgias",
      entidadeId: cirurgiaId,
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      acao: "Adição de movimentação",
      dadosDepois: mov
    });
  }
  document.getElementById("movimentacaoComentario").value = "";
  document.getElementById("movimentacaoAnexo").value = "";
  document.getElementById("movimentacaoDataDocumento").value = "";
  renderMovimentacoes();
}
