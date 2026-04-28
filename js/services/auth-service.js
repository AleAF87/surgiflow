import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

export const NIVEIS_ACESSO = {
  ADMIN_GERAL: 1,
  ADMIN_CLINICA: 2,
  MEDICO: 3,
  SECRETARIA: 4,
  FINANCEIRO: 5,
  HOSPITAL: 6,
  PACIENTE: 7,
  SOMENTE_LEITURA: 8
};

export function nomeNivelAcesso(nivel) {
  const nomes = {
    1: "Administrador geral",
    2: "Administrador da clínica",
    3: "Médico",
    4: "Secretária",
    5: "Financeiro",
    6: "Hospital",
    7: "Paciente",
    8: "Somente leitura"
  };
  return nomes[Number(nivel)] || "Sem nível definido";
}

export async function sair() {
  await signOut(auth);
  sessionStorage.clear();
}

export function aguardarUsuarioAutenticado() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) {
        reject(new Error("Usuário não autenticado"));
        return;
      }
      try {
        const usuario = await carregarUsuarioAtual(user.uid);
        resolve({ firebaseUser: user, usuario });
      } catch (error) {
        sessionStorage.clear();
        localStorage.removeItem("surgiflowLoginKey");
        localStorage.removeItem("userName");
        await signOut(auth).catch(() => {});
        reject(error);
      }
    });
  });
}

export async function carregarUsuarioAtual(uid = auth.currentUser?.uid) {
  if (!uid) return null;
  const [usuarioSnapshot, loginSnapshot] = await Promise.all([
    get(ref(db, `usuarios/${uid}`)),
    get(ref(db, `login/${uid}`))
  ]);
  const loginData = loginSnapshot.exists() ? loginSnapshot.val() : {};
  const usuarioData = usuarioSnapshot.exists() ? usuarioSnapshot.val() : loginData;
  const status = String(loginData.status || usuarioData.status || "").trim().toLowerCase();
  if (status !== "ativo") throw new Error(status === "pendente" ? "Cadastro aguardando aprovação." : "Usuário sem acesso ativo.");
  return {
    id: uid,
    ...usuarioData,
    ...loginData,
    nome: usuarioData.nome || loginData.nome || auth.currentUser?.displayName || "Usuário",
    email: usuarioData.email || loginData.email || auth.currentUser?.email || "",
    nivelAcesso: Number(usuarioData.nivelAcesso || loginData.nivelAcesso || usuarioData.nivel || loginData.nivel || NIVEIS_ACESSO.SOMENTE_LEITURA)
  };
}

export function usuarioEhAdmin(usuario) {
  return Number(usuario?.nivelAcesso) <= NIVEIS_ACESSO.ADMIN_CLINICA;
}

export function usuarioEhMedico(usuario) {
  return Number(usuario?.nivelAcesso) === NIVEIS_ACESSO.MEDICO;
}
