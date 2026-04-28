import { db } from "../firebase-config.js";
import { get, ref, set, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { gerarId } from "../utils/id-generator.js";
import { registrarLog } from "./logs-service.js";
import { solicitarMoverArquivoParaExcluidos, uploadArquivoCloudinary } from "./cloudinary-service.js";

function caminhoAnexo(cirurgiaId, anexoId, gastoId = null) {
  return gastoId
    ? `cirurgias/${cirurgiaId}/gastosCirurgicos/${gastoId}/anexos/${anexoId}`
    : `cirurgias/${cirurgiaId}/anexos/${anexoId}`;
}

async function adicionarAnexo({ file, cirurgiaId, tipoAnexo, dataDocumento, descricao, usuario, gastoId = null }) {
  const anexoId = gerarId("a");
  const upload = await uploadArquivoCloudinary({
    file,
    cirurgiaId,
    tipoAnexo,
    nomeArquivo: `${anexoId}-${file.name}`
  });
  const anexo = {
    id: anexoId,
    url: upload.url,
    secure_url: upload.secure_url,
    public_id: upload.public_id,
    caminhoOriginalCloudinary: upload.public_id,
    caminhoAtualCloudinary: upload.public_id,
    dataDocumento: dataDocumento || "",
    dataUpload: new Date().toISOString(),
    descricao: descricao || "",
    usuarioUploadId: usuario?.id || "",
    usuarioUploadNome: usuario?.nome || "",
    status: "ativo",
    excluido: false,
    original_filename: upload.original_filename,
    resource_type: upload.resource_type,
    format: upload.format
  };
  await set(ref(db, caminhoAnexo(cirurgiaId, anexoId, gastoId)), anexo);
  await registrarLog({
    tipo: "anexo.adicionado",
    entidade: tipoAnexo,
    entidadeId: anexoId,
    usuarioId: usuario?.id,
    usuarioNome: usuario?.nome,
    acao: "Adição de anexo",
    dadosDepois: anexo
  });
  return anexo;
}

export function adicionarAnexoCirurgia(args) {
  return adicionarAnexo({ ...args, tipoAnexo: "cirurgia" });
}

export function adicionarAnexoGastoCirurgico(args) {
  return adicionarAnexo({ ...args, tipoAnexo: "gasto_cirurgico" });
}

async function excluirAnexo({ cirurgiaId, anexoId, tipoAnexo, usuario, gastoId = null }) {
  const anexoRef = ref(db, caminhoAnexo(cirurgiaId, anexoId, gastoId));
  const snapshot = await get(anexoRef);
  if (!snapshot.exists()) throw new Error("Anexo não encontrado");
  const anexo = snapshot.val();
  const movimento = await solicitarMoverArquivoParaExcluidos({
    publicId: anexo.public_id,
    cirurgiaId,
    anexoId,
    tipoAnexo,
    usuarioId: usuario?.id,
    usuarioNome: usuario?.nome
  });
  const cirurgiaSnap = await get(ref(db, `cirurgias/${cirurgiaId}`));
  const cirurgia = cirurgiaSnap.val() || {};
  const dadosExclusao = {
    status: "excluido",
    excluido: true,
    excluidoEm: movimento.movedAt,
    excluidoPor: usuario?.id || "",
    excluidoPorNome: usuario?.nome || "",
    caminhoAnteriorCloudinary: anexo.caminhoAtualCloudinary || anexo.public_id,
    caminhoAtualCloudinary: movimento.newPublicId,
    cirurgiaId,
    pacienteId: cirurgia.pacienteId || "",
    tipoAnexo,
    descricao: anexo.descricao || "",
    dataDocumento: anexo.dataDocumento || ""
  };
  await update(anexoRef, dadosExclusao);
  await registrarArquivoExcluido({ cirurgiaId, anexoId, arquivo: { ...anexo, ...dadosExclusao, secure_url: movimento.newUrl || anexo.secure_url } });
  await registrarLog({
    tipo: "anexo.excluido",
    entidade: tipoAnexo,
    entidadeId: anexoId,
    usuarioId: usuario?.id,
    usuarioNome: usuario?.nome,
    acao: "Exclusão lógica/movimentação de anexo",
    dadosAntes: anexo,
    dadosDepois: dadosExclusao
  });
  return dadosExclusao;
}

export function excluirAnexoCirurgia(args) {
  return excluirAnexo({ ...args, tipoAnexo: "cirurgia" });
}

export function excluirAnexoGastoCirurgico(args) {
  return excluirAnexo({ ...args, tipoAnexo: "gasto_cirurgico" });
}

export async function registrarArquivoExcluido({ cirurgiaId, anexoId, arquivo }) {
  await set(ref(db, `arquivos_excluidos/${cirurgiaId}/${anexoId}`), arquivo);
}
