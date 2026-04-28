const cloudinaryConfig = {
  cloudName: "dvigd03pb",
  uploadPreset: "dr_cloud",
  apiKey: "196434335888354",
  apiSecret: "5HjY9mkA66x7Hs29cNo7LLzaeDY",
  folder: "cirurgias"
};

export function validarCloudinaryConfig() {
  if (!cloudinaryConfig.cloudName || cloudinaryConfig.cloudName === "PREENCHA_SEU_CLOUD_NAME") {
    throw new Error("Cloudinary cloudName não configurado em js/cloudinary-config.js");
  }
  if (!cloudinaryConfig.uploadPreset || cloudinaryConfig.uploadPreset === "PREENCHA_SEU_UPLOAD_PRESET") {
    throw new Error("Cloudinary uploadPreset não configurado em js/cloudinary-config.js");
  }
}

export async function uploadArquivoCloudinaryUnsigned({ file, folder, publicId = "" }) {
  validarCloudinaryConfig();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", cloudinaryConfig.uploadPreset);
  formData.append("folder", folder || cloudinaryConfig.folder);
  if (publicId) formData.append("public_id", publicId);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/auto/upload`, {
    method: "POST",
    body: formData
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Falha no upload para Cloudinary");
  }

  return data;
}

export async function moverArquivoCloudinaryParaExcluidos({ publicId, cirurgiaId, tipoAnexo }) {
  validarCloudinaryConfig();
  validarCloudinaryAdminConfig();

  if (!publicId || !cirurgiaId || !tipoAnexo) {
    throw new Error("publicId, cirurgiaId e tipoAnexo são obrigatórios para mover arquivo no Cloudinary");
  }

  const nomeArquivo = obterNomeArquivoPublicId(publicId);
  const pastaDestino = tipoAnexo === "gasto_cirurgico"
    ? `excluidos/cirurgias/${cirurgiaId}/gastos`
    : `excluidos/cirurgias/${cirurgiaId}/anexos`;
  const newPublicId = `${pastaDestino}/${nomeArquivo}`;
  const resourceTypes = ["image", "raw", "video"];
  let ultimoErro = null;

  for (const resourceType of resourceTypes) {
    try {
      const resultado = await renomearArquivoCloudinary({
        fromPublicId: publicId,
        toPublicId: newPublicId,
        resourceType
      });
      return {
        success: true,
        oldPublicId: publicId,
        newPublicId: resultado.public_id || newPublicId,
        newUrl: resultado.secure_url || resultado.url || getCloudinaryResourceUrl(newPublicId, resourceType),
        movedAt: new Date().toISOString()
      };
    } catch (error) {
      ultimoErro = error;
      if (erroDeCorsOuBrowser(error)) {
        return retornoExclusaoLogica({
          publicId,
          newPublicId,
          motivo: "Operação administrativa bloqueada por CORS no navegador. Arquivo mantido no Cloudinary e excluído logicamente no Firebase."
        });
      }
    }
  }

  throw ultimoErro || new Error("Falha ao mover arquivo no Cloudinary");
}

function retornoExclusaoLogica({ publicId, newPublicId, motivo }) {
  console.warn(motivo);
  return {
    success: true,
    cloudinaryMovido: false,
    logicalOnly: true,
    warning: motivo,
    oldPublicId: publicId,
    newPublicId,
    newUrl: "",
    movedAt: new Date().toISOString()
  };
}

function erroDeCorsOuBrowser(error) {
  return error instanceof TypeError || String(error?.message || "").toLowerCase().includes("failed to fetch");
}

function validarCloudinaryAdminConfig() {
  if (!cloudinaryConfig.apiKey) throw new Error("Cloudinary apiKey não configurada em js/cloudinary-config.js");
  if (!cloudinaryConfig.apiSecret) throw new Error("Cloudinary apiSecret não configurada em js/cloudinary-config.js");
}

async function renomearArquivoCloudinary({ fromPublicId, toPublicId, resourceType }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    from_public_id: fromPublicId,
    overwrite: "true",
    timestamp,
    to_public_id: toPublicId
  };
  const signature = await gerarAssinatura(params);
  const formData = new FormData();
  Object.entries(params).forEach(([key, value]) => formData.append(key, value));
  formData.append("api_key", cloudinaryConfig.apiKey);
  formData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/rename`, {
    method: "POST",
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Falha ao mover arquivo como ${resourceType}`);
  return data;
}

async function gerarAssinatura(params) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&") + cloudinaryConfig.apiSecret;
  const encoded = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-1", encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function obterNomeArquivoPublicId(publicId) {
  return String(publicId).split("/").filter(Boolean).pop() || `arquivo-${Date.now()}`;
}

export function getCloudinaryResourceUrl(publicId, resourceType = "image") {
  validarCloudinaryConfig();
  return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/${resourceType}/upload/v1/${publicId}`;
}

export default cloudinaryConfig;
