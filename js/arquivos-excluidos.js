import { db } from "./firebase-config.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

let arquivos = [];

export async function initPage() {
  await carregarArquivos();
  ["filtroCirurgia", "filtroPaciente", "filtroMedico", "filtroDataDocumento", "filtroTipo", "filtroDescricao"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderTabela);
  });
  renderTabela();
}

async function carregarArquivos() {
  const [arquivosSnap, cirurgiasSnap, pacientesSnap, medicosSnap] = await Promise.all([
    get(ref(db, "arquivos_excluidos")),
    get(ref(db, "cirurgias")),
    get(ref(db, "pacientes")),
    get(ref(db, "medicos"))
  ]);
  const cirurgias = cirurgiasSnap.val() || {};
  const pacientes = pacientesSnap.val() || {};
  const medicos = medicosSnap.val() || {};
  arquivos = Object.entries(arquivosSnap.val() || {}).flatMap(([cirurgiaId, anexos]) => Object.values(anexos).map((arquivo) => {
    const cirurgia = cirurgias[cirurgiaId] || {};
    return {
      ...arquivo,
      cirurgiaId,
      pacienteNome: pacientes[cirurgia.pacienteId || arquivo.pacienteId]?.nome || "",
      medicoNome: medicos[cirurgia.medicoId]?.nome || ""
    };
  }));
}

function renderTabela() {
  const filtros = {
    cirurgia: document.getElementById("filtroCirurgia").value.toLowerCase(),
    paciente: document.getElementById("filtroPaciente").value.toLowerCase(),
    medico: document.getElementById("filtroMedico").value.toLowerCase(),
    dataDocumento: document.getElementById("filtroDataDocumento").value,
    tipo: document.getElementById("filtroTipo").value,
    descricao: document.getElementById("filtroDescricao").value.toLowerCase()
  };
  const filtrados = arquivos.filter((a) =>
    (!filtros.cirurgia || a.cirurgiaId.toLowerCase().includes(filtros.cirurgia)) &&
    (!filtros.paciente || a.pacienteNome.toLowerCase().includes(filtros.paciente)) &&
    (!filtros.medico || a.medicoNome.toLowerCase().includes(filtros.medico)) &&
    (!filtros.dataDocumento || a.dataDocumento === filtros.dataDocumento) &&
    (!filtros.tipo || a.tipoAnexo === filtros.tipo) &&
    (!filtros.descricao || String(a.descricao || "").toLowerCase().includes(filtros.descricao))
  );
  document.getElementById("arquivosTable").innerHTML = `
    <thead><tr><th>Paciente</th><th>Médico</th><th>Cirurgia</th><th>Descrição</th><th>Tipo</th><th>Data doc.</th><th>Excluído em</th><th>Usuário</th><th>Caminho atual</th><th>Arquivo</th></tr></thead>
    <tbody>${filtrados.map((a) => `<tr><td>${a.pacienteNome || "-"}</td><td>${a.medicoNome || "-"}</td><td><code>${a.cirurgiaId}</code></td><td>${a.descricao || "-"}</td><td>${a.tipoAnexo || "-"}</td><td>${a.dataDocumento || "-"}</td><td>${a.excluidoEm ? new Date(a.excluidoEm).toLocaleString("pt-BR") : "-"}</td><td>${a.excluidoPorNome || "-"}</td><td><code>${a.caminhoAtualCloudinary || "-"}</code></td><td><a href="${a.secure_url || a.url || "#"}" target="_blank" rel="noopener">Visualizar</a></td></tr>`).join("") || `<tr><td colspan="10" class="empty-state">Nenhum arquivo excluído encontrado.</td></tr>`}</tbody>`;
}
