import { db } from "./firebase-config.js";
import { get, push, ref, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { registrarLog } from "./services/logs-service.js";

export async function initPage({ usuario }) {
  const form = document.getElementById("posForm");
  const cirurgiasSnap = await get(ref(db, "cirurgias"));
  const cirurgias = cirurgiasSnap.val() || {};
  form.cirurgiaId.innerHTML = `<option value="">Selecione</option>${Object.values(cirurgias).map((c) => `<option value="${c.id}">${c.dataCirurgia || ""} - ${c.tipoProcedimento || c.id}</option>`).join("")}`;
  await renderTabela();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const registroRef = push(ref(db, `pos_cirurgico/${form.cirurgiaId.value}`));
    const registro = Object.fromEntries(new FormData(form).entries());
    registro.id = registroRef.key;
    registro.usuarioRegistroId = usuario.id;
    registro.usuarioRegistroNome = usuario.nome;
    registro.dataHoraRegistro = new Date().toISOString();
    await set(registroRef, registro);
    await registrarLog({ tipo: "pos_cirurgico.criado", entidade: "pos_cirurgico", entidadeId: registro.id, usuarioId: usuario.id, usuarioNome: usuario.nome, acao: "Criação de acompanhamento pós-cirúrgico", dadosDepois: registro });
    form.reset();
    await renderTabela();
  });
}

async function renderTabela() {
  const snap = await get(ref(db, "pos_cirurgico"));
  const registros = Object.entries(snap.val() || {}).flatMap(([cirurgiaId, itens]) => Object.values(itens).map((item) => ({ ...item, cirurgiaId })));
  document.getElementById("posTable").innerHTML = `<thead><tr><th>Cirurgia</th><th>Retorno</th><th>Próxima consulta</th><th>Registrado por</th></tr></thead><tbody>${registros.map((r) => `<tr><td><code>${r.cirurgiaId}</code></td><td>${r.dataRetorno || "-"}</td><td>${r.proximaConsulta || "-"}</td><td>${r.usuarioRegistroNome || "-"}</td></tr>`).join("") || `<tr><td colspan="4" class="empty-state">Nenhum acompanhamento registrado.</td></tr>`}</tbody>`;
}
