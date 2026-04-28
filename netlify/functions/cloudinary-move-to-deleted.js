const cloudinary = require("cloudinary").v2;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Método não permitido" });
  }

  try {
    const { public_id, cirurgiaId, anexoId, tipoAnexo, usuarioId, usuarioNome } = JSON.parse(event.body || "{}");
    const camposObrigatorios = { public_id, cirurgiaId, anexoId, tipoAnexo, usuarioId, usuarioNome };
    const faltando = Object.entries(camposObrigatorios).filter(([, value]) => !value).map(([key]) => key);
    if (faltando.length) return json(400, { success: false, error: `Campos obrigatórios ausentes: ${faltando.join(", ")}` });

    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      return json(500, { success: false, error: "Variáveis de ambiente do Cloudinary não configuradas" });
    }

    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true
    });

    const nomeArquivo = public_id.split("/").pop();
    let pastaDestino;
    if (tipoAnexo === "cirurgia") {
      pastaDestino = `excluidos/cirurgias/${cirurgiaId}/anexos`;
    } else if (tipoAnexo === "gasto_cirurgico") {
      pastaDestino = `excluidos/cirurgias/${cirurgiaId}/gastos`;
    } else {
      return json(400, { success: false, error: "tipoAnexo inválido" });
    }

    const newPublicId = `${pastaDestino}/${nomeArquivo}`;
    const result = await cloudinary.uploader.rename(public_id, newPublicId, {
      overwrite: true,
      resource_type: "auto"
    });

    return json(200, {
      success: true,
      oldPublicId: public_id,
      newPublicId: result.public_id || newPublicId,
      newUrl: result.secure_url || result.url,
      movedAt: new Date().toISOString()
    });
  } catch (error) {
    return json(500, { success: false, error: error.message });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
