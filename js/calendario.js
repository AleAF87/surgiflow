import { db } from "./firebase-config.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { usuarioEhAdmin, usuarioEhMedico, usuarioEhSecretaria } from "./services/auth-service.js";
import { buscarIdsCirurgiasPorMedico } from "./services/indexes-service.js";
import { registrarLog } from "./services/logs-service.js";

let appRef = null;
let usuarioAtual = null;
let pacientes = {};
let medicos = {};
let usuarios = {};
let permissoesSecretaria = {};

export async function initPage({ usuario, app }) {
  appRef = app;
  usuarioAtual = usuario;
  await carregarFullCalendar();

  const [pacientesSnap, medicosSnap, usuariosSnap, cirurgiasSnap, permissoesSnap] = await Promise.all([
    get(ref(db, "pacientes")),
    get(ref(db, "medicos")),
    get(ref(db, "usuarios")),
    get(ref(db, "cirurgias")),
    usuarioEhSecretaria(usuario) ? get(ref(db, `permissoes_secretarias_medicos/${usuario.id}`)) : Promise.resolve({ val: () => ({}) })
  ]);
  pacientes = pacientesSnap.val() || {};
  medicos = medicosSnap.val() || {};
  usuarios = usuariosSnap.val() || {};
  permissoesSecretaria = permissoesSnap.val() || {};
  let cirurgias = Object.values(cirurgiasSnap.val() || {}).filter((cirurgia) => !cirurgia.arquivada);

  if (usuarioEhMedico(usuario) && !usuarioEhAdmin(usuario)) {
    cirurgias = (await buscarCirurgiasDoMedico(usuario)).filter((cirurgia) => !cirurgia.arquivada);
  } else if (usuarioEhSecretaria(usuario)) {
    cirurgias = cirurgias.filter((cirurgia) => podeSecretariaVisualizar(cirurgia.medicoId));
  }

  renderizarCalendario(cirurgias);
}

async function carregarFullCalendar() {
  if (window.FullCalendar) return;
  await carregarScript("https://cdn.jsdelivr.net/npm/fullcalendar@6.1.20/index.global.min.js");
  await carregarScript("https://cdn.jsdelivr.net/npm/@fullcalendar/core@6.1.20/locales-all.global.min.js").catch((error) => {
    console.warn("Calendário carregado sem pacote completo de idiomas:", error);
  });
}

function carregarScript(src) {
  return new Promise((resolve, reject) => {
    const existente = document.querySelector(`script[src="${src}"]`);
    if (existente) {
      if (window.FullCalendar) resolve();
      else existente.addEventListener("load", resolve, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(script);
  });
}

function renderizarCalendario(cirurgias) {
  const calendarEl = document.getElementById("cirurgiasCalendar");
  const calendar = new FullCalendar.Calendar(calendarEl, {
    locale: "pt-br",
    initialView: "timeGridWeek",
    height: "auto",
    nowIndicator: true,
    navLinks: true,
    editable: usuarioPodeMovimentarAlgumEvento(),
    eventResizableFromStart: true,
    allDaySlot: false,
    displayEventEnd: true,
    slotMinTime: "06:00:00",
    slotMaxTime: "22:00:00",
    slotDuration: "00:15:00",
    snapDuration: "00:15:00",
    slotLabelFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
    eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
    eventContent: renderizarConteudoEvento,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay"
    },
    buttonText: {
      today: "Hoje",
      month: "Mês",
      week: "Semana",
      day: "Dia"
    },
    events: cirurgias.map(cirurgiaParaEvento),
    eventAllow(dropInfo, draggedEvent) {
      return podeMovimentarEvento(draggedEvent);
    },
    eventClick(info) {
      sessionStorage.setItem("surgiflowCirurgiaEdicaoId", info.event.id);
      appRef.loadPage("pages/cirurgia-form.html");
    },
    eventDrop: atualizarHorarioEvento,
    eventResize: atualizarHorarioEvento,
    eventDidMount(info) {
      info.el.title = `${info.event.title}\n${info.event.extendedProps.medicoNome || ""}\n${info.event.extendedProps.statusLabel || ""}`;
    }
  });
  calendar.render();
}

function renderizarConteudoEvento(info) {
  const inicio = formatarHoraEvento(info.event.start);
  const termino = info.event.end ? formatarHoraEvento(info.event.end) : "";
  const horario = termino ? `${inicio} - ${termino}` : inicio;
  return { html: `<div class="fc-event-time">${horario}</div><div class="fc-event-title">${info.event.title}</div>` };
}

function cirurgiaParaEvento(cirurgia) {
  const start = montarDataHora(cirurgia.dataCirurgia, cirurgia.horarioInicial || "08:00");
  const end = montarDataHora(cirurgia.dataCirurgia, cirurgia.horarioFinalPrevisto || somarMinutos(cirurgia.horarioInicial || "08:00", 60));
  const pacienteNome = pacientes[cirurgia.pacienteId]?.nome || "Paciente";
  const medicoNome = nomeMedico(cirurgia.medicoId);
  return {
    id: cirurgia.id,
    title: `${pacienteNome} - ${cirurgia.tipoProcedimento || "Cirurgia"}`,
    start,
    end,
    backgroundColor: corPorStatus(cirurgia.status),
    borderColor: corPorStatus(cirurgia.status),
    extendedProps: {
      dataCirurgia: cirurgia.dataCirurgia || "",
      horarioInicial: cirurgia.horarioInicial || "",
      horarioFinalPrevisto: cirurgia.horarioFinalPrevisto || "",
      medicoId: cirurgia.medicoId || "",
      medicoNome,
      statusLabel: formatarStatus(cirurgia.status)
    }
  };
}

async function atualizarHorarioEvento(info) {
  const event = info.event;
  if (!podeMovimentarEvento(event)) {
    info.revert();
    alert("Você não tem permissão para movimentar esta cirurgia no calendário.");
    return;
  }
  const start = event.start;
  const end = event.end || new Date(start.getTime() + 60 * 60 * 1000);
  const dadosAntes = {
    dataCirurgia: event.extendedProps.dataCirurgia || "",
    horarioInicial: event.extendedProps.horarioInicial || "",
    horarioFinalPrevisto: event.extendedProps.horarioFinalPrevisto || ""
  };
  const dadosDepois = {
    dataCirurgia: formatarDataInput(start),
    horarioInicial: formatarHoraInput(start),
    horarioFinalPrevisto: formatarHoraInput(end)
  };

  try {
    await update(ref(db, `cirurgias/${event.id}`), {
      ...dadosDepois,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: usuarioAtual?.id || "",
      atualizadoPorNome: usuarioAtual?.nome || ""
    });
    event.setExtendedProp("dataCirurgia", dadosDepois.dataCirurgia);
    event.setExtendedProp("horarioInicial", dadosDepois.horarioInicial);
    event.setExtendedProp("horarioFinalPrevisto", dadosDepois.horarioFinalPrevisto);
    await registrarLog({
      tipo: "cirurgia.agenda_atualizada",
      entidade: "cirurgias",
      entidadeId: event.id,
      usuarioId: usuarioAtual?.id,
      usuarioNome: usuarioAtual?.nome,
      acao: "Atualização de data/horário pelo calendário",
      dadosAntes,
      dadosDepois
    });
  } catch (error) {
    info.revert();
    alert(`Não foi possível atualizar a agenda: ${error.message}`);
  }
}

function usuarioPodeMovimentarAlgumEvento() {
  if (usuarioEhAdmin(usuarioAtual)) return true;
  if (!usuarioEhSecretaria(usuarioAtual)) return false;
  return Object.values(permissoesSecretaria).some((permissao) => permissao?.movimentar);
}

function podeMovimentarEvento(event) {
  if (usuarioEhAdmin(usuarioAtual)) return true;
  if (!usuarioEhSecretaria(usuarioAtual)) return false;
  const medicoId = event.extendedProps?.medicoId;
  return Boolean(permissoesSecretaria[medicoId]?.movimentar);
}

function podeSecretariaVisualizar(medicoId) {
  const permissao = permissoesSecretaria[medicoId];
  return Boolean(permissao?.visualizar || permissao?.movimentar);
}

function montarDataHora(data, hora) {
  return `${data || formatarDataInput(new Date())}T${String(hora || "08:00").slice(0, 5)}:00`;
}

function formatarDataInput(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarHoraInput(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatarHoraEvento(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function somarMinutos(hora, minutos) {
  const [h, m] = String(hora).slice(0, 5).split(":").map(Number);
  const date = new Date();
  date.setHours(h || 8, m || 0, 0, 0);
  date.setMinutes(date.getMinutes() + minutos);
  return formatarHoraInput(date);
}

function nomeMedico(medicoId) {
  if (!medicoId) return "";
  const usuario = usuarios[medicoId];
  return medicos[medicoId]?.nome || medicos[usuario?.medicoId]?.nome || usuario?.nome || "";
}

function formatarStatus(status) {
  if (!status) return "";
  return String(status).replace(/_/g, " ").replace(/\b\p{L}/gu, (letra) => letra.toLocaleUpperCase("pt-BR"));
}

function corPorStatus(status) {
  const cores = {
    agendada: "#b4232a",
    confirmada: "#0f766e",
    realizada: "#2563eb",
    cancelada: "#6b7280"
  };
  return cores[String(status || "").toLowerCase()] || "#b4232a";
}

async function buscarCirurgiasDoMedico(usuario) {
  const idsBusca = [...new Set([usuario.medicoId, usuario.id].filter(Boolean))];
  const listas = await Promise.all(idsBusca.map((medicoId) => buscarIdsCirurgiasPorMedico(medicoId)));
  return Object.values(Object.fromEntries(listas.flat().filter(Boolean).map((cirurgia) => [cirurgia.id, cirurgia])));
}
