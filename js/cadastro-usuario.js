import { auth, db, provider } from "./firebase-config.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const state = { googleUser: null, validationMessage: "" };

function getById(id) {
  return document.getElementById(id);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCPF(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatTelefone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showAlert(message, type = "info") {
  const alert = getById("signupAlert");
  alert.className = `alert alert-${type} mt-4`;
  alert.innerHTML = message;
  alert.classList.remove("d-none");
}

function setInvalidFields(ids = []) {
  document.querySelectorAll(".is-invalid").forEach((field) => field.classList.remove("is-invalid"));
  ids.forEach((id) => getById(id)?.classList.add("is-invalid"));
}

function setFormEnabled(enabled) {
  getById("userSignupFieldset").disabled = !enabled;
  getById("submitSignupBtn").disabled = !enabled;
}

function fillGoogleFields(user) {
  if (!getById("cadastroNome").value) getById("cadastroNome").value = user.displayName || "";
  getById("cadastroEmail").value = user.email || "";
  getById("googleAccountBox").innerHTML = `
    <div>
      <span class="section-label">Conta vinculada</span>
      <p class="mb-0"><strong>${escapeHtml(user.displayName || "Usuário Google")}</strong></p>
      <p class="mb-0 text-muted">${escapeHtml(user.email || "")}</p>
    </div>
    <button id="changeGoogleAccountBtn" type="button" class="btn btn-outline-secondary">
      <i class="fas fa-rotate me-2"></i>Trocar conta
    </button>`;
  getById("changeGoogleAccountBtn")?.addEventListener("click", async () => {
    await signOut(auth).catch(() => {});
    location.reload();
  });
}

async function signInGoogle() {
  const button = getById("googleSignupBtn");
  const originalHtml = button.innerHTML;
  try {
    button.disabled = true;
    button.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i>Conectando...`;
    const credential = await signInWithPopup(auth, provider);
    state.googleUser = credential.user;
    fillGoogleFields(state.googleUser);
    setFormEnabled(true);
    showAlert("Conta Google vinculada. Complete os dados e envie para aprovação.", "success");
  } catch (error) {
    console.error("Erro no cadastro com Google:", error);
    showAlert(`Não foi possível entrar com Google: ${escapeHtml(error.message)}`, "danger");
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

function collectFormData() {
  const nome = getById("cadastroNome").value.trim();
  const email = state.googleUser?.email || "";
  const errors = [];
  const invalid = [];

  if (!state.googleUser) errors.push("Entre com sua conta Google antes de enviar.");
  if (!nome) {
    errors.push("Informe o nome completo.");
    invalid.push("cadastroNome");
  }
  if (!email) errors.push("A conta Google precisa ter um e-mail.");

  if (errors.length) {
    state.validationMessage = `<div class="fw-semibold mb-2">Confira os campos:</div><ul class="mb-0 ps-3">${errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    setInvalidFields(invalid);
    showAlert(state.validationMessage, "danger");
    throw new Error(errors.join(" "));
  }

  setInvalidFields([]);
  return {
    uid: state.googleUser.uid,
    nome,
    email,
    cpf: onlyDigits(getById("cadastroCpf").value),
    telefone: onlyDigits(getById("cadastroTelefone").value),
    nivelAcesso: Number(getById("cadastroNivel").value || 8),
    crm: getById("cadastroCrm").value.trim(),
    especialidade: getById("cadastroEspecialidade").value.trim(),
    observacoes: getById("cadastroObservacoes").value.trim()
  };
}

async function ensureUserAvailable(uid, email) {
  const [loginSnap, usuariosSnap] = await Promise.all([
    get(ref(db, `login/${uid}`)),
    get(ref(db, `usuarios/${uid}`))
  ]);
  if (loginSnap.exists() || usuariosSnap.exists()) {
    throw new Error("Você já possui uma solicitação cadastrada. Aguarde a aprovação do administrador.");
  }
  const allLogins = await get(ref(db, "login"));
  const emailLower = String(email).toLowerCase();
  const duplicated = Object.values(allLogins.val() || {}).some((item) => String(item.email || "").toLowerCase() === emailLower);
  if (duplicated) throw new Error("Este e-mail Google já possui cadastro no sistema.");
}

async function submitSignup(event) {
  event.preventDefault();
  const submitBtn = getById("submitSignupBtn");
  const originalHtml = submitBtn.innerHTML;
  try {
    const formData = collectFormData();
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i>Enviando...`;
    await ensureUserAvailable(formData.uid, formData.email);

    const now = new Date().toISOString();
    const usuarioPayload = {
      ...formData,
      id: formData.uid,
      provider: "google",
      status: "pendente",
      tipoCadastro: "usuario-google",
      criadoEm: now,
      atualizadoEm: now
    };
    const loginPayload = {
      uid: formData.uid,
      nome: formData.nome,
      email: formData.email,
      provider: "google",
      status: "pendente",
      nivelAcesso: formData.nivelAcesso,
      criadoEm: now,
      atualizadoEm: now
    };

    await update(ref(db), {
      [`usuarios/${formData.uid}`]: usuarioPayload,
      [`login/${formData.uid}`]: loginPayload
    });

    sessionStorage.clear();
    localStorage.clear();
    await signOut(auth).catch(() => {});
    showAlert(`<h4 class="alert-heading">Cadastro enviado com sucesso</h4><p>Sua solicitação foi registrada e está aguardando aprovação do administrador.</p><a href="index.html" class="btn btn-primary mt-2" data-ignore-spa="true">Voltar ao login</a>`, "success");
    getById("userSignupForm").reset();
    setFormEnabled(false);
  } catch (error) {
    console.error("Erro ao enviar cadastro:", error);
    showAlert(state.validationMessage || escapeHtml(error.message || "Não foi possível enviar o cadastro."), "danger");
    submitBtn.disabled = false;
  } finally {
    submitBtn.innerHTML = originalHtml;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setFormEnabled(false);
  getById("googleSignupBtn")?.addEventListener("click", signInGoogle);
  getById("userSignupForm")?.addEventListener("submit", submitSignup);
  getById("cadastroCpf")?.addEventListener("input", (event) => event.target.value = formatCPF(event.target.value));
  getById("cadastroTelefone")?.addEventListener("input", (event) => event.target.value = formatTelefone(event.target.value));
});
