import { uploadArquivoCloudinaryUnsigned } from "../cloudinary-config.js";

function limparNomeArquivo(nomeArquivo = "arquivo") {
  return nomeArquivo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function pastaCloudinaryPorTipo(cirurgiaId, tipoAnexo) {
  if (tipoAnexo === "cirurgia") return `cirurgias/${cirurgiaId}/anexos`;
  if (tipoAnexo === "gasto_cirurgico") return `cirurgias/${cirurgiaId}/gastos`;
  throw new Error("Tipo de anexo inválido");
}

export async function uploadArquivoCloudinary({ file, cirurgiaId, tipoAnexo, nomeArquivo }) {
  if (!file || !cirurgiaId || !tipoAnexo) throw new Error("Arquivo, cirurgiaId e tipoAnexo são obrigatórios");
  const folder = pastaCloudinaryPorTipo(cirurgiaId, tipoAnexo);
  const data = await uploadArquivoCloudinaryUnsigned({
    file,
    folder,
    publicId: nomeArquivo ? limparNomeArquivo(nomeArquivo) : ""
  });

  return {
    url: data.url,
    secure_url: data.secure_url,
    public_id: data.public_id,
    original_filename: data.original_filename,
    resource_type: data.resource_type,
    format: data.format
  };
}

export async function solicitarMoverArquivoParaExcluidos({ publicId, cirurgiaId, anexoId, tipoAnexo, usuarioId, usuarioNome }) {
  const response = await fetch("/.netlify/functions/cloudinary-move-to-deleted", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      public_id: publicId,
      cirurgiaId,
      anexoId,
      tipoAnexo,
      usuarioId,
      usuarioNome
    })
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "Falha ao mover arquivo no Cloudinary");
  return data;
}
