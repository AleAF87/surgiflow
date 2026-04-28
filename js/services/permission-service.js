import { db } from "../firebase-config.js";
import { get, ref, remove, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { NIVEIS_ACESSO, usuarioEhAdmin, usuarioEhMedico } from "./auth-service.js";
import { registrarLog } from "./logs-service.js";

export function podeAdministrar(usuario) {
  return usuarioEhAdmin(usuario);
}

export function podeEditarCadastros(usuario) {
  return [1, 2, 3, 4].includes(Number(usuario?.nivelAcesso));
}

export function podeAcessarFinanceiro(usuario) {
  return [1, 2, 5].includes(Number(usuario?.nivelAcesso));
}

export function podeAcessarEvolucaoMedica(usuario) {
  return [1, 2, 3].includes(Number(usuario?.nivelAcesso));
}

export async function obterPermissaoPaciente(pacienteId, medicoId) {
  const snapshot = await get(ref(db, `permissoes_pacientes/${pacienteId}/${medicoId}`));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function podeVisualizarPaciente(usuario, paciente) {
  if (!usuario || !paciente) return false;
  if (usuarioEhAdmin(usuario)) return true;
  if (Number(usuario.nivelAcesso) === NIVEIS_ACESSO.SOMENTE_LEITURA) return true;
  if (usuarioEhMedico(usuario)) {
    const permissao = await obterPermissaoPaciente(paciente.id, usuario.medicoId || usuario.id);
    return Boolean(permissao?.visualizar);
  }
  if ([4, 5, 6].includes(Number(usuario.nivelAcesso))) return true;
  return paciente.usuarioId === usuario.id;
}

export async function podeEditarPaciente(usuario, paciente) {
  if (!usuario || !paciente) return false;
  if (usuarioEhAdmin(usuario)) return true;
  if (usuarioEhMedico(usuario)) {
    const permissao = await obterPermissaoPaciente(paciente.id, usuario.medicoId || usuario.id);
    return Boolean(permissao?.editar);
  }
  return Number(usuario.nivelAcesso) === NIVEIS_ACESSO.SECRETARIA;
}

export async function concederPermissaoPaciente({ pacienteId, medicoId, visualizar, editar, motivo, usuario }) {
  const permissao = {
    visualizar: Boolean(visualizar),
    editar: Boolean(editar),
    concedidoPor: usuario.id,
    concedidoPorNome: usuario.nome,
    concedidoEm: new Date().toISOString(),
    motivo: motivo || ""
  };
  await set(ref(db, `permissoes_pacientes/${pacienteId}/${medicoId}`), permissao);
  await registrarLog({
    tipo: "permissao.concedida",
    entidade: "permissoes_pacientes",
    entidadeId: `${pacienteId}/${medicoId}`,
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
    acao: "Concessão de permissão para outro médico",
    dadosDepois: permissao
  });
  return permissao;
}

export async function removerPermissaoPaciente({ pacienteId, medicoId, usuario }) {
  const caminho = `permissoes_pacientes/${pacienteId}/${medicoId}`;
  const snapshot = await get(ref(db, caminho));
  await remove(ref(db, caminho));
  await registrarLog({
    tipo: "permissao.removida",
    entidade: "permissoes_pacientes",
    entidadeId: `${pacienteId}/${medicoId}`,
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
    acao: "Remoção de permissão",
    dadosAntes: snapshot.val()
  });
}
