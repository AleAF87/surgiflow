import { db } from "./firebase-config.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { initCrudPage } from "./common-crud.js";

const ESPECIALIDADES_INICIAIS = [
  "Anestesiologia",
  "Cardiologia",
  "Cirurgia cardiovascular",
  "Cirurgia geral",
  "Cirurgia plástica",
  "Cirurgia torácica",
  "Cirurgia vascular",
  "Clínica médica",
  "Dermatologia",
  "Ginecologia e obstetrícia",
  "Neurocirurgia",
  "Oftalmologia",
  "Ortopedia e traumatologia",
  "Otorrinolaringologia",
  "Pediatria",
  "Urologia"
];

export async function initPage({ usuario }) {
  await garantirEspecialidadesIniciais();
  return initCrudPage({ tipo: "especialidades", usuario });
}

async function garantirEspecialidadesIniciais() {
  const snapshot = await get(ref(db, "especialidades"));
  const existentes = snapshot.val() || {};
  const nomesExistentes = new Set(Object.values(existentes).map((item) => String(item.nome || "").toLowerCase()));
  const updates = {};
  ESPECIALIDADES_INICIAIS.forEach((nome) => {
    if (nomesExistentes.has(nome.toLowerCase())) return;
    const id = `esp_${nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    updates[`especialidades/${id}`] = {
      id,
      nome,
      codigo: "",
      observacoes: "",
      criadoEm: new Date().toISOString(),
      origem: "seed"
    };
  });
  if (!Object.keys(updates).length) return;
  await update(ref(db), updates);
}
