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

function validarCloudinaryAdminConfig() {
  if (!cloudinaryConfig.apiKey) throw new Error("Cloudinary apiKey não configurada em js/cloudinary-config.js");
  if (!cloudinaryConfig.apiSecret) throw new Error("Cloudinary apiSecret não configurada em js/cloudinary-config.js");
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

export async function deletarArquivoCloudinary(publicId, resourceTypePreferencial = "") {
  validarCloudinaryConfig();
  validarCloudinaryAdminConfig();

  if (!publicId) {
    return {
      success: true,
      result: "not found",
      publicId: "",
      deletedAt: new Date().toISOString()
    };
  }

  for (const resourceType of ordenarResourceTypes(resourceTypePreferencial)) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await gerarAssinaturaPublicId(publicId, timestamp);
    const formData = new FormData();
    formData.append("public_id", publicId);
    formData.append("timestamp", timestamp);
    formData.append("api_key", cloudinaryConfig.apiKey);
    formData.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/destroy`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) continue;

    const data = await response.json();
    if (data.result === "ok" || data.result === "not found") {
      return {
        success: true,
        result: data.result,
        publicId,
        resourceType,
        deletedAt: new Date().toISOString()
      };
    }
  }

  throw new Error("Falha ao excluir anexo no Cloudinary");
}

async function gerarAssinaturaPublicId(publicId, timestamp) {
  const payload = `public_id=${publicId}&timestamp=${timestamp}${cloudinaryConfig.apiSecret}`;
  const encoded = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-1", encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ordenarResourceTypes(resourceTypePreferencial = "") {
  const tipos = ["image", "raw", "video"];
  if (!resourceTypePreferencial || !tipos.includes(resourceTypePreferencial)) return tipos;
  return [resourceTypePreferencial, ...tipos.filter((tipo) => tipo !== resourceTypePreferencial)];
}

export function getCloudinaryResourceUrl(publicId, resourceType = "image") {
  validarCloudinaryConfig();
  return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/${resourceType}/upload/v1/${publicId}`;
}

export default cloudinaryConfig;
