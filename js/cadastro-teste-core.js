const TEST_USER = {
  id: "cliente_teste_publico",
  nome: "Cliente Teste",
  nivelAcesso: 1,
  status: "ativo"
};

const SCRIPT_BY_PAGE = {
  "cirurgias.html": "./cirurgias.js",
  "cirurgia-form.html": "./cirurgia-form.js"
};

class CadastroTesteApp {
  constructor() {
    this.usuario = TEST_USER;
    this.currentPage = "";
  }

  async init() {
    await this.loadNavbar();
    this.setupNavigation();
    await this.loadPage("pages/cirurgias.html");
  }

  async loadNavbar() {
    const response = await fetch("components/navbar-teste.html");
    document.getElementById("navbar").innerHTML = await response.text();
  }

  setupNavigation() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href$='.html']");
      if (!link || link.dataset.ignoreSpa === "true") return;
      const href = link.getAttribute("href");
      const pageName = href.split("/").pop();
      if (!SCRIPT_BY_PAGE[pageName]) return;
      event.preventDefault();
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
    const content = document.getElementById("app-content");
    const pageName = pageUrl.split("/").pop();
    content.innerHTML = `<div class="loading-card"><div class="spinner-border text-danger"></div><p>Carregando...</p></div>`;

    try {
      const response = await fetch(pageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      content.innerHTML = await response.text();
      this.currentPage = pageUrl;
      this.updateActiveNav(pageUrl);

      const modulePath = SCRIPT_BY_PAGE[pageName];
      if (modulePath) {
        const pageModule = await import(`${modulePath}?teste=${Date.now()}`);
        await pageModule.initPage?.({ app: this, usuario: this.usuario, modoTeste: true });
      }
    } catch (error) {
      console.error(error);
      content.innerHTML = `<section class="page-shell"><div class="alert alert-danger">Erro ao carregar página de teste: ${error.message}</div></section>`;
    }
  }

  updateActiveNav(pageUrl) {
    document.querySelectorAll(".navbar .nav-link").forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === pageUrl);
    });
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

const app = new CadastroTesteApp();
app.init();
