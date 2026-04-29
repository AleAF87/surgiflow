import { aguardarUsuarioAutenticado, nomeNivelAcesso, sair, usuarioEhAdmin } from "./services/auth-service.js";

const SCRIPT_BY_PAGE = {
  "dashboard.html": "./dashboard.js",
  "pacientes.html": "./pacientes.js",
  "medicos.html": "./medicos.js",
  "hospitais.html": "./hospitais.js",
  "convenios.html": "./convenios.js",
  "materiais.html": "./materiais.js",
  "especialidades.html": "./especialidades.js",
  "tipos-cirurgias.html": "./tipos-cirurgias.js",
  "cirurgias.html": "./cirurgias.js",
  "calendario.html": "./calendario.js",
  "cirurgias-arquivadas.html": "./cirurgias-arquivadas.js",
  "cirurgia-form.html": "./cirurgia-form.js",
  "pos-cirurgico.html": "./pos-cirurgico.js",
  "usuarios.html": "./usuarios.js",
  "permissoes-secretarias.html": "./permissoes-secretarias.js",
  "arquivos-excluidos.html": "./arquivos-excluidos.js",
  "permissoes.html": "./permissoes.js",
  "logs.html": "./logs.js"
};

class SurgiFlowApp {
  constructor() {
    this.usuario = null;
    this.currentPage = "";
  }

  async init() {
    try {
      const contexto = await aguardarUsuarioAutenticado();
      this.usuario = contexto.usuario;
      sessionStorage.setItem("surgiflowUsuario", JSON.stringify(this.usuario));
      await this.loadNavbar();
      this.setupNavigation();
      await this.loadPage("pages/dashboard.html");
    } catch (error) {
      console.error(error);
      sessionStorage.clear();
      localStorage.removeItem("surgiflowLoginKey");
      localStorage.removeItem("userName");
      window.location.href = "index.html";
    }
  }

  async loadNavbar() {
    const response = await fetch("components/navbar.html");
    document.getElementById("navbar").innerHTML = await response.text();
    document.getElementById("userGreeting").textContent = this.usuario?.nome || "Usuário";
    document.getElementById("userAccessLabel").textContent = nomeNivelAcesso(this.usuario?.nivelAcesso);
    document.querySelectorAll(".admin-only").forEach((item) => item.classList.toggle("d-none", !usuarioEhAdmin(this.usuario)));
    document.getElementById("navLogout")?.addEventListener("click", async (event) => {
      event.preventDefault();
      await sair();
      window.location.href = "index.html";
    });
  }

  setupNavigation() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href$='.html']");
      if (!link || link.dataset.ignoreSpa === "true") return;
      event.preventDefault();
      const href = link.getAttribute("href");
      this.collapseNavbar();
      this.loadPage(href);
    });
  }

  collapseNavbar() {
    const collapseEl = document.getElementById("mainNavbar");
    if (!collapseEl || typeof bootstrap === "undefined") return;
    const instance = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl, { toggle: false });
    instance.hide();
  }

  async loadPage(pageUrl) {
    const pageName = pageUrl.split("/").pop();
    if (["usuarios.html", "permissoes-secretarias.html", "cirurgias-arquivadas.html", "arquivos-excluidos.html", "permissoes.html", "logs.html"].includes(pageName) && !usuarioEhAdmin(this.usuario)) {
      this.renderAccessDenied();
      return;
    }
    const content = document.getElementById("app-content");
    content.innerHTML = `<div class="loading-card"><div class="spinner-border text-danger"></div><p>Carregando...</p></div>`;
    try {
      const response = await fetch(pageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      content.innerHTML = await response.text();
      this.currentPage = pageUrl;
      this.updateActiveNav(pageUrl);
      const modulePath = SCRIPT_BY_PAGE[pageName];
      if (modulePath) {
        const pageModule = await import(`${modulePath}?v=${Date.now()}`);
        await pageModule.initPage?.({ app: this, usuario: this.usuario });
      }
    } catch (error) {
      content.innerHTML = `<section class="page-shell"><div class="alert alert-danger">Erro ao carregar página: ${error.message}</div></section>`;
      console.error(error);
    }
  }

  updateActiveNav(pageUrl) {
    document.querySelectorAll(".navbar .nav-link, .navbar .dropdown-item").forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === pageUrl);
    });
  }

  renderAccessDenied() {
    document.getElementById("app-content").innerHTML = `
      <section class="page-shell">
        <div class="alert alert-danger mt-3">Você não tem permissão para acessar esta área.</div>
      </section>`;
  }
}

export function confirmarAção({ titulo = "Confirmar ação", mensagem = "Deseja continuar?", textoConfirmar = "Confirmar" }) {
  return new Promise((resolve) => {
    const modalEl = document.getElementById("confirmModal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    document.getElementById("confirmModalTitle").textContent = titulo;
    document.getElementById("confirmModalBody").textContent = mensagem;
    const ok = document.getElementById("confirmModalOk");
    ok.textContent = textoConfirmar;
    const handler = () => {
      ok.removeEventListener("click", handler);
      modal.hide();
      resolve(true);
    };
    ok.addEventListener("click", handler, { once: true });
    modalEl.addEventListener("hidden.bs.modal", () => resolve(false), { once: true });
    modal.show();
  });
}

const app = new SurgiFlowApp();
app.init();
