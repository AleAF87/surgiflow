import { db } from "./firebase-config.js";
import { get, ref, set, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { gerarIdCirurgia, gerarId } from "./utils/id-generator.js";
import { registrarLog, obterCamposAlterados } from "./services/logs-service.js";
import { criarIndicesConsultaCirurgia, atualizarIndiceMedicoConsulta, atualizarIndicePacienteConsulta } from "./services/indexes-service.js";
import { adicionarAnexoCirurgia, adicionarAnexoGastoCirurgico, excluirAnexoCirurgia, excluirAnexoGastoCirurgico } from "./services/anexos-service.js";

let materiaisAdicionados = [];
let gastosCirurgicos = [];
let movimentacoes = [];
let anexosPendentesExclusao = [];
let selects = {};
let permitirSaidaSemAviso = false;
let navegacaoHandler = null;
let beforeUnloadHandler = null;

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

export async function initPage({ usuario, app }) {
  const form = document.getElementById("cirurgiaForm");
  selects = await carregarSelects();
  await garantirMedicoDoUsuario(usuario);
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
  document.getElementById("addGasto").addEventListener("click", adicionarGastoSelecionado);
  document.getElementById("gastosTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-gasto]");
    const anexoButton = event.target.closest("[data-remove-gasto-anexo]");
    if (anexoButton) {
      marcarAnexoGastoParaExclusao(Number(anexoButton.dataset.gastoIndex), anexoButton.dataset.removeGastoAnexo);
      return;
    }
    if (!button) return;
    removerGasto(Number(button.dataset.removeGasto));
    renderGastos();
  });
  document.getElementById("movimentacoesTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-movimentacao-anexo]");
    if (!button) return;
    marcarAnexoMovimentacaoParaExclusao(button.dataset.removeMovimentacaoAnexo);
  });
  document.getElementById("addMovimentacao").addEventListener("click", async () => adicionarMovimentacao(usuario));
  form.addEventListener("submit", (event) => salvarCirurgia(event, usuario, app));
  configurarAvisoItensNaoAdicionados();
}

async function garantirMedicoDoUsuario(usuario) {
  if (Number(usuario?.nivelAcesso) !== 3) return;
  if (usuario.medicoId && selects.medicos?.[usuario.medicoId]) return;

  const medicoExistente = Object.values(selects.medicos || {}).find((medico) => {
    const mesmoEmail = usuario.email && medico.email && String(medico.email).toLowerCase() === String(usuario.email).toLowerCase();
    const mesmoCrm = usuario.crm && medico.crm && normalizarTexto(medico.crm) === normalizarTexto(usuario.crm);
    return mesmoEmail || mesmoCrm;
  });

  if (medicoExistente?.id) {
    usuario.medicoId = medicoExistente.id;
    await update(ref(db), {
      [`usuarios/${usuario.id}/medicoId`]: medicoExistente.id,
      [`login/${usuario.id}/medicoId`]: medicoExistente.id
    });
    return;
  }

  const medicoId = gerarId("m");
  const now = new Date().toISOString();
  const medico = {
    id: medicoId,
    nome: usuario.nome || "Médico",
    crm: usuario.crm || "",
    especialidade: usuario.especialidade || usuario.setor || "",
    telefone: usuario.telefone || "",
    email: usuario.email || "",
    criadoEm: now,
    criadoPor: usuario.id,
    criadoPorNome: usuario.nome || "Usuário",
    atualizadoEm: now,
    atualizadoPor: usuario.id,
    atualizadoPorNome: usuario.nome || "Usuário",
    origem: "usuario_medico"
  };

  await update(ref(db), {
    [`medicos/${medicoId}`]: medico,
    [`usuarios/${usuario.id}/medicoId`]: medicoId,
    [`login/${usuario.id}/medicoId`]: medicoId
  });
  selects.medicos = { ...(selects.medicos || {}), [medicoId]: medico };
  preencherSelect("medicoId", selects.medicos);
  usuario.medicoId = medicoId;
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
  anexosPendentesExclusao = [];
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

function normalizarTexto(value = "") {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
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
    medicoId: form.medicoId.value,
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
    gastoDescricao: document.getElementById("gastoDescricao").value,
    gastoValor: document.getElementById("gastoValor").value,
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
  document.getElementById("gastoDescricao").value = estado.gastoDescricao || "";
  document.getElementById("gastoValor").value = estado.gastoValor || "";
  document.getElementById("movimentacaoComentario").value = estado.movimentacaoComentario || "";
  document.getElementById("movimentacaoDataDocumento").value = estado.movimentacaoDataDocumento || "";
  renderGastos();
  renderMateriais();
  renderMovimentacoes();
}

function configurarAvisoItensNaoAdicionados() {
  window.surgiflowCirurgiaFormCleanup?.();
  removerAvisoItensNaoAdicionados();
  beforeUnloadHandler = (event) => {
    if (permitirSaidaSemAviso || !temItensNaoAdicionados()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  navegacaoHandler = (event) => {
    if (permitirSaidaSemAviso || !temItensNaoAdicionados()) return;
    const link = event.target.closest("a[href$='.html']");
    if (!link || link.dataset.ignoreSpa === "true") return;
    const mensagem = montarMensagemItensNaoAdicionados();
    if (confirm(`${mensagem}\n\nDeseja sair mesmo assim?`)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);
  document.addEventListener("click", navegacaoHandler, true);
  window.surgiflowCirurgiaFormCleanup = removerAvisoItensNaoAdicionados;
}

function removerAvisoItensNaoAdicionados() {
  if (beforeUnloadHandler) window.removeEventListener("beforeunload", beforeUnloadHandler);
  if (navegacaoHandler) document.removeEventListener("click", navegacaoHandler, true);
  beforeUnloadHandler = null;
  navegacaoHandler = null;
  if (window.surgiflowCirurgiaFormCleanup === removerAvisoItensNaoAdicionados) {
    window.surgiflowCirurgiaFormCleanup = null;
  }
}

function validarItensNaoAdicionadosAntesDeSalvar() {
  if (!temItensNaoAdicionados()) return true;
  alert(montarMensagemItensNaoAdicionados());
  focarPrimeiroItemNaoAdicionado();
  return false;
}

function temItensNaoAdicionados() {
  return listarItensNaoAdicionados().length > 0;
}

function listarItensNaoAdicionados() {
  const itens = [];
  if (temMaterialNaoAdicionado()) itens.push("Materiais");
  if (temGastoNaoAdicionado()) itens.push("Gastos cirúrgicos");
  if (temMovimentacaoNaoAdicionada()) itens.push("Histórico de movimentações");
  return itens;
}

function montarMensagemItensNaoAdicionados() {
  const itens = listarItensNaoAdicionados();
  return `Existem dados preenchidos e/ou anexos selecionados que ainda não foram adicionados nas listas:\n\n- ${itens.join("\n- ")}\n\nClique em Adicionar na respectiva seção antes de salvar ou sair.`;
}

function temMaterialNaoAdicionado() {
  const materialId = document.getElementById("materialSelect")?.value || "";
  const quantidade = document.getElementById("materialQuantidade")?.value || "";
  const observacao = document.getElementById("materialObservacao")?.value.trim() || "";
  return Boolean(materialId || observacao || (quantidade && quantidade !== "1"));
}

function temGastoNaoAdicionado() {
  const descricao = document.getElementById("gastoDescricao")?.value.trim() || "";
  const valor = document.getElementById("gastoValor")?.value || "";
  const anexo = document.getElementById("gastoAnexo")?.files?.length > 0;
  return Boolean(descricao || anexo || (valor && Number(String(valor).replace(",", ".")) !== 0));
}

function temMovimentacaoNaoAdicionada() {
  const comentario = document.getElementById("movimentacaoComentario")?.value.trim() || "";
  const dataDocumento = document.getElementById("movimentacaoDataDocumento")?.value || "";
  const anexo = document.getElementById("movimentacaoAnexo")?.files?.length > 0;
  return Boolean(comentario || dataDocumento || anexo);
}

function focarPrimeiroItemNaoAdicionado() {
  const alvo = temMaterialNaoAdicionado()
    ? document.getElementById("materialSelect")
    : temGastoNaoAdicionado()
      ? document.getElementById("gastoDescricao")
      : document.getElementById("movimentacaoComentario");
  alvo?.focus();
  alvo?.scrollIntoView({ behavior: "smooth", block: "center" });
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
  limparCamposMaterial();
  renderMateriais();
}

function limparCamposMaterial() {
  document.getElementById("materialSelect").value = "";
  document.getElementById("materialQuantidade").value = "1";
  document.getElementById("materialObservacao").value = "";
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
        <td>${gasto.descricao || "-"}</td>
        <td>${formatarMoeda(gasto.valor)}</td>
        <td>${labelAnexoGasto(gasto)}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" data-remove-gasto="${index}"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`).join("") || `<tr><td colspan="4" class="empty-state">Nenhum gasto cirúrgico adicionado.</td></tr>`}</tbody>`;
  atualizarTotalGastos();
}

function adicionarGastoSelecionado() {
  const descricaoInput = document.getElementById("gastoDescricao");
  const valorInput = document.getElementById("gastoValor");
  const anexoInput = document.getElementById("gastoAnexo");
  const descricao = descricaoInput.value.trim();
  const valor = Number(String(valorInput.value || "0").replace(",", ".") || 0);
  const arquivo = anexoInput.files?.[0] || null;

  if (!descricao && !valor && !arquivo) {
    alert("Informe a descrição, o valor ou selecione um anexo para adicionar o gasto.");
    return;
  }

  gastosCirurgicos.push({
    id: gerarId("g"),
    descricao,
    valor,
    arquivo,
    arquivoNome: arquivo?.name || ""
  });

  descricaoInput.value = "";
  valorInput.value = "";
  anexoInput.value = "";
  renderGastos();
}

function atualizarTotalGastos() {
  const total = gastosCirurgicos.reduce((sum, gasto) => sum + Number(gasto.valor || 0), 0);
  document.getElementById("totalGastos").textContent = `Total: ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function labelAnexoGasto(gasto) {
  if (gasto.arquivoNome) return gasto.arquivoNome;
  if (gasto.anexoNome) return gasto.anexoNome;
  const anexos = Object.values(gasto.anexos || {}).filter((anexo) => anexo && anexo.status !== "excluido" && !anexo.excluido);
  if (anexos.length) {
    return anexos.map((anexo) => `
      <div class="d-flex align-items-center justify-content-between gap-2 mb-1">
        <a href="${anexo.secure_url || anexo.url}" target="_blank" rel="noopener">${anexo.descricao || anexo.original_filename || "Visualizar"}</a>
        <button class="btn btn-sm btn-outline-danger" type="button" data-gasto-index="${gastosCirurgicos.indexOf(gasto)}" data-remove-gasto-anexo="${anexo.id}" title="Remover anexo"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
  }
  return "-";
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
        <td>${renderAnexoMovimentacao(mov)}</td>
      </tr>`).join("") || `<tr><td colspan="4" class="empty-state">Nenhuma movimentação registrada.</td></tr>`}</tbody>`;
}

function renderAnexoMovimentacao(mov) {
  if (!mov.anexo?.secure_url || mov.anexo?.excluido || mov.anexo?.status === "excluido") return "-";
  return `
    <div class="d-flex align-items-center justify-content-between gap-2">
      <a href="${mov.anexo.secure_url}" target="_blank" rel="noopener">Visualizar</a>
      <button class="btn btn-sm btn-outline-danger" type="button" data-remove-movimentacao-anexo="${mov.id}" title="Remover anexo"><i class="fa-solid fa-trash"></i></button>
    </div>`;
}

async function salvarCirurgia(event, usuario, app) {
  event.preventDefault();
  if (!validarItensNaoAdicionadosAntesDeSalvar()) return;
  const form = event.currentTarget;
  const cirurgiaId = form.elements.id.value || gerarIdCirurgia();
  const anteriorSnap = await get(ref(db, `cirurgias/${cirurgiaId}`));
  const anterior = anteriorSnap.val();
  const anexosParaExcluir = [...anexosPendentesExclusao];
  await processarExclusoesAnexosPendentes(cirurgiaId, usuario);
  const gastosParaSalvar = gastosCirurgicos.map(({ arquivo, ...gasto }) => gasto);
  const cirurgia = {
    id: cirurgiaId,
    pacienteId: form.pacienteId.value,
    medicoId: form.medicoId.value || usuario.medicoId || usuario.id,
    hospitalId: form.hospitalId.value,
    convenioId: form.convenioId.value,
    tipoProcedimentoId: form.tipoProcedimentoId.value,
    tipoProcedimento: selects.tipos_cirurgias?.[form.tipoProcedimentoId.value]?.nome || "",
    dataCirurgia: form.dataCirurgia.value,
    horarioInicial: form.horarioInicial.value,
    horarioFinalPrevisto: form.horarioFinalPrevisto.value,
    status: form.status.value,
    anexos: filtrarAnexosAtivos(anterior?.anexos || {}, anexosParaExcluir),
    materiais: materiaisAdicionados,
    gastosCirurgicos: Object.fromEntries(gastosParaSalvar.map((g) => [g.id, g])),
    totalGastosCirurgicos: gastosParaSalvar.reduce((sum, gasto) => sum + Number(gasto.valor || 0), 0),
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
  for (const gasto of gastosCirurgicos) {
    const file = gasto.arquivo;
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
        dadosDepois: removerArquivoDoGasto(gasto)
      });
    }
  }
  form.elements.id.value = cirurgiaId;
  permitirSaidaSemAviso = true;
  removerAvisoItensNaoAdicionados();
  alert("Cirurgia salva com sucesso.");
  app?.loadPage("pages/cirurgias.html");
}

function removerGasto(index) {
  const gasto = gastosCirurgicos[index];
  Object.values(gasto?.anexos || {}).forEach((anexo) => {
    if (anexo?.id) {
      adicionarExclusaoPendente({
        tipoAnexo: "gasto_cirurgico",
        gastoId: gasto.id,
        anexoId: anexo.id
      });
    }
  });
  gastosCirurgicos.splice(index, 1);
}

function marcarAnexoGastoParaExclusao(gastoIndex, anexoId) {
  const gasto = gastosCirurgicos[gastoIndex];
  if (!gasto?.anexos?.[anexoId]) return;
  if (!confirm("Remover este anexo? A exclusão no Cloudinary será feita somente ao salvar a cirurgia.")) return;
  adicionarExclusaoPendente({
    tipoAnexo: "gasto_cirurgico",
    gastoId: gasto.id,
    anexoId
  });
  delete gasto.anexos[anexoId];
  renderGastos();
}

function marcarAnexoMovimentacaoParaExclusao(movimentacaoId) {
  const movimentacao = movimentacoes.find((mov) => mov.id === movimentacaoId);
  if (!movimentacao?.anexo?.id) return;
  if (!confirm("Remover este anexo? A exclusão no Cloudinary será feita somente ao salvar a cirurgia.")) return;
  adicionarExclusaoPendente({
    tipoAnexo: "cirurgia",
    anexoId: movimentacao.anexo.id
  });
  delete movimentacao.anexo;
  renderMovimentacoes();
}

function adicionarExclusaoPendente(item) {
  const chave = `${item.tipoAnexo}:${item.gastoId || ""}:${item.anexoId}`;
  if (anexosPendentesExclusao.some((pendente) => `${pendente.tipoAnexo}:${pendente.gastoId || ""}:${pendente.anexoId}` === chave)) return;
  anexosPendentesExclusao.push(item);
}

async function processarExclusoesAnexosPendentes(cirurgiaId, usuario) {
  if (!anexosPendentesExclusao.length) return;
  for (const pendente of anexosPendentesExclusao) {
    if (pendente.tipoAnexo === "gasto_cirurgico") {
      await excluirAnexoGastoCirurgico({
        cirurgiaId,
        gastoId: pendente.gastoId,
        anexoId: pendente.anexoId,
        usuario
      });
    } else {
      await excluirAnexoCirurgia({
        cirurgiaId,
        anexoId: pendente.anexoId,
        usuario
      });
    }
  }
  anexosPendentesExclusao = [];
}

function filtrarAnexosAtivos(anexos = {}, pendentes = []) {
  const anexosRemovidos = new Set(pendentes.filter((item) => item.tipoAnexo === "cirurgia").map((item) => item.anexoId));
  return Object.fromEntries(Object.entries(anexos || {}).filter(([anexoId, anexo]) => {
    return !anexosRemovidos.has(anexoId) && anexo?.status !== "excluido" && !anexo?.excluido;
  }));
}

function removerArquivoDoGasto(gasto) {
  const { arquivo, ...dados } = gasto;
  return dados;
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
