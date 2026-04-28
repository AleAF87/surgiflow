import { db } from "../firebase-config.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { registrarLog } from "./logs-service.js";

export async function criarIndicesConsultaCirurgia({ cirurgiaId, medicoId, pacienteId, usuario = null }) {
  const updates = {};
  updates[`consultas_por_medico/${medicoId}/${cirurgiaId}`] = true;
  updates[`consultas_por_paciente/${pacienteId}/${cirurgiaId}`] = true;
  await update(ref(db), updates);
  await registrarLog({
    tipo: "indice.criado",
    entidade: "cirurgias",
    entidadeId: cirurgiaId,
    usuarioId: usuario?.id,
    usuarioNome: usuario?.nome,
    acao: "Criação de índices de consulta rápida",
    dadosDepois: { cirurgiaId, medicoId, pacienteId }
  });
}

export async function removerIndicesConsultaCirurgia({ cirurgiaId, medicoId, pacienteId, usuario = null }) {
  const updates = {};
  updates[`consultas_por_medico/${medicoId}/${cirurgiaId}`] = null;
  updates[`consultas_por_paciente/${pacienteId}/${cirurgiaId}`] = null;
  await update(ref(db), updates);
  await registrarLog({
    tipo: "indice.removido",
    entidade: "cirurgias",
    entidadeId: cirurgiaId,
    usuarioId: usuario?.id,
    usuarioNome: usuario?.nome,
    acao: "Remoção de índices de consulta rápida",
    dadosAntes: { cirurgiaId, medicoId, pacienteId }
  });
}

export async function atualizarIndiceMedicoConsulta({ cirurgiaId, medicoAntigoId, medicoNovoId, usuario = null }) {
  if (!medicoAntigoId || !medicoNovoId || medicoAntigoId === medicoNovoId) return;
  const updates = {};
  updates[`consultas_por_medico/${medicoAntigoId}/${cirurgiaId}`] = null;
  updates[`consultas_por_medico/${medicoNovoId}/${cirurgiaId}`] = true;
  await update(ref(db), updates);
  await registrarLog({
    tipo: "indice.atualizado",
    entidade: "cirurgias",
    entidadeId: cirurgiaId,
    usuarioId: usuario?.id,
    usuarioNome: usuario?.nome,
    acao: "Atualização de índices de consulta rápida",
    dadosAntes: { medicoId: medicoAntigoId },
    dadosDepois: { medicoId: medicoNovoId }
  });
}

export async function atualizarIndicePacienteConsulta({ cirurgiaId, pacienteAntigoId, pacienteNovoId, usuario = null }) {
  if (!pacienteAntigoId || !pacienteNovoId || pacienteAntigoId === pacienteNovoId) return;
  const updates = {};
  updates[`consultas_por_paciente/${pacienteAntigoId}/${cirurgiaId}`] = null;
  updates[`consultas_por_paciente/${pacienteNovoId}/${cirurgiaId}`] = true;
  await update(ref(db), updates);
  await registrarLog({
    tipo: "indice.atualizado",
    entidade: "cirurgias",
    entidadeId: cirurgiaId,
    usuarioId: usuario?.id,
    usuarioNome: usuario?.nome,
    acao: "Atualização de índices de consulta rápida",
    dadosAntes: { pacienteId: pacienteAntigoId },
    dadosDepois: { pacienteId: pacienteNovoId }
  });
}

async function carregarCirurgiasPorIndice(caminho) {
  const snapshot = await get(ref(db, caminho));
  if (!snapshot.exists()) return [];
  const ids = Object.keys(snapshot.val() || {});
  const cirurgias = await Promise.all(ids.map(async (id) => {
    const item = await get(ref(db, `cirurgias/${id}`));
    return item.exists() ? { id, ...item.val() } : null;
  }));
  return cirurgias.filter(Boolean);
}

export async function buscarIdsCirurgiasPorMedico(medicoId) {
  return carregarCirurgiasPorIndice(`consultas_por_medico/${medicoId}`);
}

export async function buscarIdsCirurgiasPorPaciente(pacienteId) {
  return carregarCirurgiasPorIndice(`consultas_por_paciente/${pacienteId}`);
}
