const cloudinaryConfig = {
  cloudName: "PREENCHA_SEU_CLOUD_NAME",
  uploadPreset: "PREENCHA_SEU_UPLOAD_PRESET",
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

export function getCloudinaryResourceUrl(publicId, resourceType = "image") {
  validarCloudinaryConfig();
  return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/${resourceType}/upload/v1/${publicId}`;
}

export default cloudinaryConfig;
