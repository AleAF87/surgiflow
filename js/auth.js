import { auth, db, provider } from "./firebase-config.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

function showAlert(element, message) {
  element.textContent = message;
  element.classList.remove("d-none");
  setTimeout(() => element.classList.add("d-none"), 6000);
}

async function buscarLoginPorUsuarioGoogle(googleUser) {
  const porUid = await get(ref(db, `login/${googleUser.uid}`));
  if (porUid.exists()) return { chave: googleUser.uid, dados: porUid.val() };

  const snapshot = await get(ref(db, "login"));
  const emailGoogle = String(googleUser.email || "").toLowerCase();
  const encontrado = Object.entries(snapshot.val() || {}).find(([, dados]) => {
    const uid = String(dados?.uid || "");
    const email = String(dados?.email || "").toLowerCase();
    return uid === googleUser.uid || email === emailGoogle;
  });
  return encontrado ? { chave: encontrado[0], dados: encontrado[1] } : null;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const login = await buscarLoginPorUsuarioGoogle(user).catch(() => null);
  if (login?.dados?.status === "ativo" && window.location.pathname.endsWith("index.html")) {
    sessionStorage.setItem("surgiflowLoginKey", login.chave);
    sessionStorage.setItem("userName", login.dados.nome || user.displayName || "Usuário");
    window.location.href = "app.html";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const errorAlert = document.getElementById("errorAlert");
  const infoAlert = document.getElementById("infoAlert");

  googleLoginBtn?.addEventListener("click", async () => {
    const originalHtml = googleLoginBtn.innerHTML;
    try {
      googleLoginBtn.disabled = true;
      googleLoginBtn.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i>Entrando...`;

      const credential = await signInWithPopup(auth, provider);
      const googleUser = credential.user;
      const login = await buscarLoginPorUsuarioGoogle(googleUser);

      if (!login) {
        await signOut(auth).catch(() => {});
        showAlert(infoAlert, "Cadastro não encontrado. Faça seu cadastro com Google e aguarde aprovação.");
        return;
      }

      const status = String(login.dados.status || "").trim().toLowerCase();
      if (status !== "ativo") {
        await signOut(auth).catch(() => {});
        showAlert(infoAlert, status === "pendente"
          ? "Seu cadastro está aguardando aprovação do administrador."
          : `Cadastro com status "${status}". Entre em contato com o administrador.`);
        return;
      }

      sessionStorage.setItem("surgiflowLoginKey", login.chave);
      sessionStorage.setItem("userName", login.dados.nome || googleUser.displayName || "Usuário");
      localStorage.setItem("surgiflowLoginKey", login.chave);
      localStorage.setItem("userName", login.dados.nome || googleUser.displayName || "Usuário");
      window.location.href = "app.html";
    } catch (error) {
      console.error("Erro ao entrar com Google:", error);
      showAlert(errorAlert, `Erro ao entrar com Google: ${error.message}`);
    } finally {
      googleLoginBtn.disabled = false;
      googleLoginBtn.innerHTML = originalHtml;
    }
  });
});
