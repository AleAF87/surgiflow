import { db } from "./firebase-config.js";
import { get, ref, remove, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { gerarIdPaciente, gerarIdMedico, gerarId } from "./utils/id-generator.js";
import { registrarLog } from "./services/logs-service.js";

const CONFIG = {
  pacientes: {
    path: "pacientes",
    id: gerarIdPaciente,
    titulo: "Pacientes",
    campos: ["nome", "cpf", "telefone", "email", "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "estado", "observacoes"],
    colunas: ["nome", "cpf", "telefone", "cidade"],
    buscaPlaceholder: "Buscar paciente por nome, CPF, telefone ou cidade"
  },
  medicos: {
    path: "medicos",
    id: gerarIdMedico,
    titulo: "Médicos",
    campos: ["nome", "crm", "especialidade", "telefone", "email"],
    colunas: ["nome", "crm", "especialidade", "telefone"],
    buscaPlaceholder: "Buscar médico por nome, CRM, especialidade ou telefone"
  },
  hospitais: {
    path: "hospitais",
    id: () => gerarId("h"),
    titulo: "Hospitais",
    campos: ["nome", "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "estado", "telefone", "responsavel"],
    colunas: ["nome", "cidade", "telefone", "responsavel"],
    buscaPlaceholder: "Buscar hospital por nome, cidade ou responsável"
  },
  convenios: {
    path: "convenios",
    id: () => gerarId("cv"),
    titulo: "Convênios",
    campos: ["nome", "codigo", "cidade", "telefone", "observacoes"],
    colunas: ["nome", "codigo", "cidade", "telefone"],
    buscaPlaceholder: "Buscar convênio por nome, código ou cidade"
  },
  materiais: {
    path: "materiais",
    id: () => gerarId("mat"),
    titulo: "Materiais",
    campos: ["nome", "codigo", "unidade", "valor", "observacoes"],
    colunas: ["nome", "codigo", "unidade", "valor"],
    buscaPlaceholder: "Buscar material por nome, código ou unidade"
  },
  especialidades: {
    path: "especialidades",
    id: () => gerarId("esp"),
    titulo: "Especialidades",
    campos: ["nome", "codigo", "observacoes"],
    colunas: ["nome", "codigo", "observacoes"],
    buscaPlaceholder: "Buscar especialidade por nome ou código"
  },
  tiposCirurgias: {
    path: "tipos_cirurgias",
    id: () => gerarId("tc"),
    titulo: "Tipos de cirurgia",
    campos: ["nome", "codigo", "observacoes"],
    colunas: ["nome", "codigo", "observacoes"],
    buscaPlaceholder: "Buscar tipo de cirurgia"
  }
};

const FIELD_LABELS = {
  nome: "Nome",
  telefone: "Telefone",
  email: "E-mail",
  cpf: "CPF",
  cep: "CEP",
  logradouro: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  estado: "UF",
  observacoes: "Observações",
  crm: "CRM",
  especialidade: "Especialidade",
  cidade: "Cidade",
  responsavel: "Responsável",
  codigo: "Código",
  unidade: "Unidade",
  valor: "Valor"
};

const FIELD_OPTIONS = {
  unidade: [
    { value: "unidade", label: "Unidade" },
    { value: "quilo", label: "Quilo" },
    { value: "litro", label: "Litro" },
    { value: "metro", label: "Metro" },
    { value: "metro_quadrado", label: "Metro quadrado" },
    { value: "metro_cubico", label: "Metro cúbico" },
    { value: "caixa", label: "Caixa" },
    { value: "pacote", label: "Pacote" },
    { value: "frasco", label: "Frasco" },
    { value: "ampola", label: "Ampola" },
    { value: "kit", label: "Kit" },
    { value: "par", label: "Par" },
    { value: "rolo", label: "Rolo" }
  ]
};

export async function initCrudPage({ tipo, usuario }) {
  const config = CONFIG[tipo];
  const form = document.getElementById("crudForm");
  const table = document.getElementById("crudTable");
  document.getElementById("crudTitle").textContent = config.titulo;
  renderSearch(config);
  renderFormFields(config);
  setupCepLookup(tipo);
  await renderTable(config, table);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = form.elements.id.value || config.id();
    const dados = {
      id,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: usuario.id,
      atualizadoPorNome: usuario.nome
    };
    if (!form.elements.id.value) {
      dados.criadoEm = dados.atualizadoEm;
      dados.criadoPor = usuario.id;
    }
    config.campos.forEach((campo) => dados[campo] = form[campo]?.value?.trim() || "");
    if (tipo === "materiais") dados.valor = Number(String(dados.valor || "0").replace(",", ".") || 0);
    const anterior = await get(ref(db, `${config.path}/${id}`));
    await set(ref(db, `${config.path}/${id}`), dados);
    await registrarLog({
      tipo: anterior.exists() ? `${tipo}.editado` : `${tipo}.criado`,
      entidade: config.path,
      entidadeId: id,
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      acao: anterior.exists() ? `Edição de ${tipo}` : `Criação de ${tipo}`,
      dadosAntes: anterior.val(),
      dadosDepois: dados
    });
    form.reset();
    form.elements.id.value = "";
    await renderTable(config, table);
  });
}

function renderSearch(config) {
  const table = document.getElementById("crudTable");
  const wrapper = table.closest(".sf-card");
  if (!wrapper || wrapper.querySelector("#crudSearch")) return;
  const search = document.createElement("input");
  search.id = "crudSearch";
  search.className = "form-control mb-3";
  search.placeholder = config.buscaPlaceholder || "Buscar";
  search.addEventListener("input", () => renderTable(config, table));
  wrapper.prepend(search);
}

function renderFormFields(config) {
  const container = document.getElementById("crudFields");
  container.innerHTML = config.campos.map((campo) => `
    <div class="mb-3">
      <label class="form-label" for="${campo}">${FIELD_LABELS[campo] || campo.replaceAll("Id", " ID")}</label>
      ${FIELD_OPTIONS[campo] ? `
        <select class="form-select" id="${campo}" name="${campo}">
          <option value="">Selecione</option>
          ${FIELD_OPTIONS[campo].map((option) => `<option value="${option.value}">${option.label}</option>`).join("")}
        </select>` : campo === "cep" ? `
        <div class="input-group">
          <input class="form-control" id="${campo}" name="${campo}" maxlength="9" inputmode="numeric">
          <button class="btn btn-outline-secondary" type="button" id="buscarCepEndereco">Buscar</button>
        </div>` : `<input class="form-control" id="${campo}" name="${campo}" ${campo === "valor" ? 'type="number" step="0.01" min="0"' : ""}>`}
    </div>`).join("");
}

function setupCepLookup(tipo) {
  if (!["pacientes", "hospitais"].includes(tipo)) return;
  const cepInput = document.getElementById("cep");
  const button = document.getElementById("buscarCepEndereco");
  cepInput?.addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
    event.target.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  });
  button?.addEventListener("click", buscarCepPaciente);
}

async function buscarCepPaciente() {
  const cep = document.getElementById("cep")?.value.replace(/\D/g, "");
  if (!cep || cep.length !== 8) {
    alert("Informe um CEP válido com 8 números.");
    return;
  }
  const button = document.getElementById("buscarCepEndereco");
  const original = button.innerHTML;
  try {
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();
    if (data.erro) {
      alert("CEP não encontrado. Preencha o endereço manualmente.");
      return;
    }
    document.getElementById("logradouro").value = data.logradouro || "";
    document.getElementById("bairro").value = data.bairro || "";
    document.getElementById("cidade").value = data.localidade || "";
    document.getElementById("estado").value = data.uf || "";
    document.getElementById("numero")?.focus();
  } catch (error) {
    console.error(error);
    alert("Não foi possível buscar o CEP agora.");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function renderTable(config, table) {
  const snapshot = await get(ref(db, config.path));
  const termo = document.getElementById("crudSearch")?.value.trim().toLowerCase() || "";
  const dados = Object.values(snapshot.val() || {}).filter((item) => {
    const searchable = config.campos.map((campo) => item[campo]).filter(Boolean).join(" ").toLowerCase();
    return !termo || searchable.includes(termo);
  });
  const colunas = config.colunas || ["nome"];
  table.innerHTML = `
    <thead><tr>${colunas.map((campo) => `<th>${FIELD_LABELS[campo] || campo}</th>`).join("")}<th>Atualizado em</th><th class="text-end">Ações</th></tr></thead>
    <tbody>
      ${dados.map((item) => `
        <tr>
          ${colunas.map((campo) => `<td>${formatValue(campo, item[campo])}</td>`).join("")}
          <td>${item.atualizadoEm ? new Date(item.atualizadoEm).toLocaleString("pt-BR") : "-"}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" data-edit="${item.id}"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-remove="${item.id}"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`).join("") || `<tr><td colspan="${colunas.length + 2}" class="empty-state">Nenhum registro encontrado.</td></tr>`}
    </tbody>`;
  table.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", async () => {
    const snapshot = await get(ref(db, `${config.path}/${button.dataset.edit}`));
    const item = snapshot.val();
    const form = document.getElementById("crudForm");
    form.elements.id.value = item.id;
    config.campos.forEach((campo) => form[campo].value = item[campo] || "");
  }));
  table.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", async () => {
    await remove(ref(db, `${config.path}/${button.dataset.remove}`));
    await renderTable(config, table);
  }));
}

function formatValue(campo, value) {
  if (campo === "valor") {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (campo === "unidade") {
    const option = FIELD_OPTIONS.unidade.find((item) => item.value === value);
    return option?.label || value || "-";
  }
  return value || "-";
}
