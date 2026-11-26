"use strict";

const DATA_URL = "data.json";

const copy = {
  overview: ["Funcionamiento", "Estado operativo y confiabilidad de los equipos en planta."],
  alerts: ["Sistemas de alerta", "Revisa las incidencias y confirma cuando el equipo ya conoce cada evento."],
  production: ["Producción diaria", "Rendimiento por máquina y tendencia de producción de los últimos siete días."],
  settings: ["Configuración", "Ajusta los objetivos operativos y administra las empresas suscritas."],
  inventory: ["Materia prima", "Consulta las existencias y registra entradas de material en tiempo real."],
  usage: ["Uso de máquinas", "Horas de operación, utilización de capacidad y clientes con mayor actividad."]
};

const demoData = {
  machines: [
    { id: "CNC-01", name: "Torno CNC", icon: "⚙️", status: "operativo", production: 184, unit: "piezas", hours: 18.5, temperature: 42, detail: "Ciclo de mecanizado dentro de parámetros normales." },
    { id: "INY-02", name: "Inyectora de plástico", icon: "♨️", status: "alerta", production: 1260, unit: "piezas", hours: 20, temperature: 78, detail: "Temperatura del molde por encima del rango recomendado." },
    { id: "PRE-03", name: "Prensa hidráulica", icon: "🔩", status: "falla", production: 96, unit: "piezas", hours: 12, temperature: 67, detail: "Presión hidráulica irregular. Se recomienda inspeccionar el circuito." },
    { id: "EMP-04", name: "Empacadora automática", icon: "📦", status: "operativo", production: 2150, unit: "paquetes", hours: 21, temperature: 39, detail: "Empaque y sellado operando con normalidad." }
  ],
  alerts: [
    { id: "ALT-102", machineId: "INY-02", level: "alerta", title: "Temperatura elevada", message: "El molde alcanzó 78 °C; revisar el circuito de enfriamiento.", time: "Hoy · 10:42", active: true },
    { id: "ALT-103", machineId: "PRE-03", level: "falla", title: "Presión hidráulica irregular", message: "La presión está fuera del rango de operación esperado.", time: "Hoy · 09:18", active: true }
  ],
  production: {
    dailyTarget: 4000,
    weekly: [
      { day: "Lun", units: 3520 }, { day: "Mar", units: 3790 }, { day: "Mié", units: 3650 },
      { day: "Jue", units: 3980 }, { day: "Vie", units: 3860 }, { day: "Sáb", units: 3210 },
      { day: "Dom", units: 3690 }
    ]
  },
  settings: { shiftHours: 24 },
  inventory: [
    { id: "MP-001", name: "Resina ABS", category: "Polímero", quantity: 420, unit: "kg", minimum: 150 },
    { id: "MP-002", name: "Resina PP", category: "Polímero", quantity: 285, unit: "kg", minimum: 120 },
    { id: "MP-003", name: "Lámina de acero", category: "Metal", quantity: 86, unit: "unidades", minimum: 100 },
    { id: "MP-004", name: "Film stretch", category: "Empaque", quantity: 64, unit: "rollos", minimum: 25 }
  ],
  subscribers: [
    { company: "Empresa Heinz", code: "HNZ-2024", usageHours: 320, active: true },
    { company: "Empresas Polar", code: "POL-2024", usageHours: 275, active: true }
  ]
};

let state;
let currentView = "overview";
let toastTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const numberFormat = value => new Intl.NumberFormat("es-ES").format(value);
const decimalFormat = value => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
const today = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

async function loadData() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`No fue posible leer ${DATA_URL} (HTTP ${response.status}).`);
    const data = await response.json();
    validateData(data);
    state = data;
    $("#dataSource").textContent = "· DATA.JSON";
    $("#lastUpdated").textContent = `Fuente: data.json · Actualizado ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    if (location.protocol !== "file:") {
      console.error("No se pudieron cargar los datos de la planta:", error);
    }
    state = structuredClone(demoData);
    $("#dataSource").textContent = "· MODO DEMOSTRACIÓN";
    $("#lastUpdated").textContent = location.protocol === "file:"
      ? "Vista previa local · usa un servidor HTTP para cargar data.json"
      : "No se pudo leer data.json · datos de demostración";
  }
  render();
}

function validateData(data) {
  const valid = data && Array.isArray(data.machines) && Array.isArray(data.alerts)
    && Array.isArray(data.inventory) && Array.isArray(data.subscribers)
    && data.production && Array.isArray(data.production.weekly) && data.settings;
  if (!valid) throw new Error("data.json no tiene la estructura esperada.");
}

function formatMachineStatus(status) {
  const labels = { operativo: "Operativa", alerta: "En observación", falla: "Falla activa" };
  return labels[status] || "Sin estado";
}

function machineStatusClass(status) {
  return status === "falla" ? "status-fault" : status === "alerta" ? "status-warning" : "status-operational";
}

function activeAlerts() {
  return state.alerts.filter(alert => alert.active);
}

function totalProduction() {
  return state.machines.reduce((total, machine) => total + machine.production, 0);
}

function totalHours() {
  return state.machines.reduce((total, machine) => total + machine.hours, 0);
}

function render() {
  $("#currentDate").textContent = today.charAt(0).toUpperCase() + today.slice(1);
  $("#alertCount").textContent = activeAlerts().length || "";
  $("#breadcrumbCurrent").textContent = copy[currentView][0];
  $("#viewTitle").innerHTML = currentView === "overview"
    ? 'Buen día, equipo <span class="wave">✳</span>'
    : escapeHTML(copy[currentView][0]);
  $("#viewDescription").textContent = copy[currentView][1];
  renderKPIs();
  renderView();
}

function renderKPIs() {
  const faults = state.machines.filter(machine => machine.status === "falla").length;
  const online = state.machines.filter(machine => machine.status !== "falla").length;
  const target = Number(state.production.dailyTarget) || 0;
  const completion = target ? Math.min(100, Math.round(totalProduction() / target * 100)) : 0;
  const cards = [
    { label: "Máquinas operativas", value: `${online}/${state.machines.length}`, meta: "equipos en línea", icon: "◫", color: "green" },
    { label: "Producción de hoy", value: numberFormat(totalProduction()), meta: "unidades producidas", icon: "▥", color: "blue" },
    { label: "Meta diaria", value: `${completion}%`, meta: `${numberFormat(target)} unidades`, icon: "◎", color: "amber" },
    { label: "Incidencias activas", value: activeAlerts().length, meta: `${faults} falla${faults === 1 ? "" : "s"} crítica${faults === 1 ? "" : "s"}`, icon: "△", color: faults ? "red" : "green" }
  ];
  $("#kpiGrid").innerHTML = cards.map(card => `
    <article class="kpi-card">
      <div class="kpi-top"><span>${card.label}</span><span class="kpi-icon ${card.color}">${card.icon}</span></div>
      <strong class="kpi-value">${card.value}</strong><span class="kpi-meta">${card.meta}</span>
    </article>`).join("");
}

function renderView() {
  const renderers = {
    overview: renderOverview,
    alerts: renderAlertsView,
    production: renderProductionView,
    settings: renderSettingsView,
    inventory: renderInventoryView,
    usage: renderUsageView
  };
  $("#viewContent").innerHTML = renderers[currentView]();
}

function machineCard(machine) {
  const alert = activeAlerts().find(item => item.machineId === machine.id);
  const alertClass = machine.status === "falla" ? "fault" : alert ? "" : "ok";
  const alertText = alert ? alert.title : machine.status === "operativo" ? "Sin incidencias activas" : machine.detail;
  return `<article class="machine-card" data-machine="${escapeHTML(machine.id)}" tabindex="0" role="button" aria-label="Ver detalle de ${escapeHTML(machine.name)}">
    <div class="machine-top">
      <div class="machine-identity"><span class="machine-icon" aria-hidden="true">${escapeHTML(machine.icon)}</span><div><div class="machine-name">${escapeHTML(machine.name)}</div><div class="machine-id">${escapeHTML(machine.id)} · Línea de producción</div></div></div>
      <span class="status-pill ${machineStatusClass(machine.status)}">${formatMachineStatus(machine.status)}</span>
    </div>
    <div class="machine-alert ${alertClass}"><span>${machine.status === "falla" ? "!" : alert ? "△" : "✓"}</span>${escapeHTML(alertText)}</div>
    <div class="machine-stats">
      <div class="machine-stat"><span>Producción hoy</span><strong>${numberFormat(machine.production)} ${escapeHTML(machine.unit)}</strong></div>
      <div class="machine-stat"><span>Horas de uso</span><strong>${decimalFormat(machine.hours)} h</strong></div>
      <div class="machine-stat"><span>Temperatura</span><strong>${numberFormat(machine.temperature)} °C</strong></div>
    </div>
  </article>`;
}

function chartMarkup() {
  const days = state.production.weekly;
  const max = Math.max(...days.map(item => item.units), 1);
  return `<div class="bar-chart" aria-label="Producción semanal">${days.map((item, index) => `
    <div class="bar-column ${index === days.length - 1 ? "today" : ""}" title="${escapeHTML(item.day)}: ${numberFormat(item.units)} unidades">
      <div class="bar-track"><div class="bar-fill" style="height:${Math.max(5, Math.round(item.units / max * 100))}%"></div></div>
      <span>${escapeHTML(item.day)}</span>
    </div>`).join("")}</div>`;
}

function alertMarkup(alert, withButton = true) {
  const machine = state.machines.find(item => item.id === alert.machineId);
  return `<article class="alert-row ${alert.level === "falla" ? "fault" : ""}">
    <span class="alert-symbol">${alert.level === "falla" ? "!" : "△"}</span>
    <div class="alert-copy"><strong>${escapeHTML(alert.title)} · ${escapeHTML(machine ? machine.name : alert.machineId)}</strong><span>${escapeHTML(alert.message)}</span><time class="alert-time">${escapeHTML(alert.time)}</time></div>
    ${withButton ? `<button class="ack-button" type="button" data-ack="${escapeHTML(alert.id)}">Silenciar alarma</button>` : ""}
  </article>`;
}

function renderOverview() {
  const alerts = activeAlerts();
  return `<div class="section-heading"><div><h2>Estado de las máquinas</h2><p>Selecciona un equipo para consultar su ficha técnica.</p></div><button class="text-button" type="button" data-navigate="alerts">Ver todas las alertas →</button></div>
    <div class="machine-grid">${state.machines.map(machineCard).join("")}</div>
    <div class="overview-lower">
      <section class="panel"><div class="panel-header"><div><h2>Producción semanal</h2><p>Unidades producidas · últimos 7 días</p></div><button class="text-button" type="button" data-navigate="production">Ver detalle →</button></div>
        <p class="production-total">${numberFormat(totalProduction())}<small>unidades hoy</small></p>${chartMarkup()}</section>
      <section class="panel"><div class="panel-header"><div><h2>Alertas recientes</h2><p>Incidencias que requieren atención</p></div><span class="status-pill ${alerts.length ? "status-warning" : "status-operational"}">${alerts.length} activas</span></div>
        <div class="alert-list">${alerts.length ? alerts.slice(0, 3).map(alert => alertMarkup(alert)).join("") : '<div class="empty-state">No hay alarmas activas.</div>'}</div></section>
    </div>`;
}

function renderAlertsView() {
  const alerts = activeAlerts();
  return `<section class="panel"><div class="panel-header"><div><h2>Alertas activas</h2><p>Silencia cada alarma después de confirmar que el personal fue informado y atendió el evento.</p></div><span class="status-pill ${alerts.length ? "status-warning" : "status-operational"}">${alerts.length} activas</span></div>
    <div class="alert-list">${alerts.length ? alerts.map(alert => alertMarkup(alert)).join("") : '<div class="empty-state"><strong>Todo en orden</strong>No hay alarmas activas en este momento.</div>'}</div></section>
    <section class="panel" style="margin-top:14px"><div class="panel-header"><div><h2>Estado general</h2><p>Resumen operativo de los equipos</p></div></div><div class="machine-grid">${state.machines.map(machineCard).join("")}</div></section>`;
}

function renderProductionView() {
  const target = Number(state.production.dailyTarget) || 1;
  const total = totalProduction();
  return `<div class="module-grid">
    <section class="panel"><div class="panel-header"><div><h2>Producción de hoy</h2><p>Acumulado reportado por las cuatro máquinas</p></div><span class="status-pill status-operational">${Math.min(100, Math.round(total / target * 100))}% de la meta</span></div><p class="production-total">${numberFormat(total)}<small>unidades</small></p>${chartMarkup()}</section>
    <section class="panel"><div class="panel-header"><div><h2>Meta de producción</h2><p>Avance por máquina respecto al objetivo diario</p></div></div>
      ${state.machines.map(machine => `<div class="production-machine"><span class="production-machine-name">${escapeHTML(machine.icon)} ${escapeHTML(machine.name)}</span><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, Math.round(machine.production / Math.max(1, target / state.machines.length) * 100))}%"></div></div><span class="production-machine-value">${numberFormat(machine.production)} ${escapeHTML(machine.unit)}</span></div>`).join("")}
    </section>
    <section class="panel full-width"><div class="panel-header"><div><h2>Registro por máquina</h2><p>Producción registrada para el día de hoy</p></div></div><div class="table-wrap"><table><thead><tr><th>Equipo</th><th>Estado</th><th>Producción</th><th>Horas operativas</th><th>Temperatura</th></tr></thead><tbody>${state.machines.map(machine => `<tr><td class="table-strong">${escapeHTML(machine.name)}</td><td><span class="status-pill ${machineStatusClass(machine.status)}">${formatMachineStatus(machine.status)}</span></td><td>${numberFormat(machine.production)} ${escapeHTML(machine.unit)}</td><td>${decimalFormat(machine.hours)} h</td><td>${numberFormat(machine.temperature)} °C</td></tr>`).join("")}</tbody></table></div></section>
  </div>`;
}

function usageByCompany() {
  return state.subscribers.map(company => ({ ...company, share: totalHours() ? company.usageHours / totalHours() : 0 }))
    .sort((a, b) => b.usageHours - a.usageHours);
}

function discountFor(share) {
  return Math.min(15, Math.round(share * 15));
}

function companyCard(company, index) {
  const discount = index === 0 && company.usageHours > 0 ? discountFor(company.share) : 0;
  const initials = company.company.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return `<div class="company-card"><span class="company-avatar">${escapeHTML(initials)}</span><div class="company-copy"><strong>${escapeHTML(company.company)}</strong><span>${escapeHTML(company.code)} · ${numberFormat(company.usageHours)} h de uso</span></div>${discount ? `<span class="discount-badge">−${discount}%</span>` : ""}</div>`;
}

function renderSettingsView() {
  const companies = usageByCompany();
  const leader = companies[0];
  const discount = leader && leader.usageHours > 0 ? discountFor(leader.share) : 0;
  return `<div class="module-grid">
    <section class="panel"><div class="panel-header"><div><h2>Parámetros de producción</h2><p>Define referencias para el seguimiento de cada turno.</p></div></div>
      <form id="settingsForm"><div class="form-grid"><div class="field"><label for="dailyTarget">Meta diaria (unidades)</label><input id="dailyTarget" name="dailyTarget" type="number" min="1" step="1" required value="${Number(state.production.dailyTarget)}"></div><div class="field"><label for="shiftHours">Horas por turno</label><input id="shiftHours" name="shiftHours" type="number" min="1" max="24" step="0.5" required value="${Number(state.settings.shiftHours)}"></div></div><div class="form-actions"><button class="button button-primary" type="submit">Guardar configuración</button><span class="form-note">Los indicadores se actualizan de inmediato.</span></div></form>
      <div class="setting-info">La disponibilidad y las alarmas se muestran con los datos del archivo data.json. Los cambios de configuración se aplican en esta sesión.</div>
    </section>
    <section class="panel"><div class="panel-header"><div><h2>Descuento por utilización</h2><p>Cálculo transparente sobre las horas reportadas por cliente.</p></div></div>
      ${leader && leader.usageHours > 0 ? `<div class="company-card"><span class="company-avatar">${escapeHTML(leader.company.slice(0, 2).toUpperCase())}</span><div class="company-copy"><strong>Mayor utilización · ${escapeHTML(leader.company)}</strong><span>${numberFormat(leader.usageHours)} h · ${Math.round(leader.share * 100)}% del uso de máquinas</span></div><span class="discount-badge">−${discount}%</span></div>` : '<div class="empty-state">Aún no hay horas de uso registradas para calcular descuentos.</div>'}
      <div class="setting-info">La empresa con mayor uso obtiene un descuento referencial de hasta 15%, proporcional a su participación en las horas registradas. El cálculo es informativo y no sustituye la aprobación financiera.</div>
    </section>
    <section class="panel full-width"><div class="panel-header"><div><h2>Empresas suscritas</h2><p>Accesos registrados y consumo acumulado de máquinas.</p></div><span class="subtle-label">${state.subscribers.length} empresas</span></div><div class="module-grid">${companies.map(companyCard).join("")}</div></section>
    <section class="panel full-width"><div class="panel-header"><div><h2>Registrar suscripción</h2><p>Al enviar el formulario, el nuevo código se incorpora al listado en tiempo real.</p></div></div>
      <form id="subscriberForm"><div class="form-grid"><div class="field"><label for="companyName">Nombre de la empresa</label><input id="companyName" name="companyName" type="text" maxlength="80" autocomplete="organization" placeholder="Ej. Empresa de producción" required></div><div class="field"><label for="companyCode">Código de acceso</label><input id="companyCode" name="companyCode" type="text" maxlength="40" autocomplete="off" placeholder="Ej. EMP-2025" required></div></div><div class="form-actions"><button class="button button-primary" type="submit">Registrar empresa</button><span class="form-note">Los códigos deben ser únicos.</span></div></form>
    </section>
  </div>`;
}

function renderInventoryView() {
  const lowStock = state.inventory.filter(item => item.quantity <= item.minimum).length;
  return `<div class="module-grid">
    <section class="panel full-width"><div class="panel-header"><div><h2>Existencias de materia prima</h2><p>${lowStock ? `${lowStock} material(es) en el nivel mínimo o por debajo.` : "Todos los materiales están por encima del nivel mínimo."}</p></div><span class="status-pill ${lowStock ? "status-warning" : "status-operational"}">${lowStock ? `${lowStock} por reponer` : "Inventario estable"}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Código</th><th>Material</th><th>Categoría</th><th>Existencia</th><th>Nivel mínimo</th><th>Estado</th></tr></thead><tbody>${state.inventory.map(item => {
    const low = item.quantity <= item.minimum;
    return `<tr><td class="table-muted">${escapeHTML(item.id)}</td><td class="table-strong">${escapeHTML(item.name)}</td><td>${escapeHTML(item.category)}</td><td class="${low ? "stock-low" : ""}">${numberFormat(item.quantity)} ${escapeHTML(item.unit)}</td><td>${numberFormat(item.minimum)} ${escapeHTML(item.unit)}</td><td><span class="status-pill ${low ? "status-warning" : "status-operational"}">${low ? "Reponer" : "Disponible"}</span></td></tr>`;
  }).join("")}</tbody></table></div>
    </section>
    <section class="panel full-width"><div class="panel-header"><div><h2>Registrar entrada de material</h2><p>La cantidad se suma a las existencias actuales.</p></div></div>
      <form id="inventoryForm"><div class="form-grid"><div class="field"><label for="inventoryItem">Materia prima</label><select id="inventoryItem" name="inventoryItem" required>${state.inventory.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)} (${escapeHTML(item.unit)})</option>`).join("")}</select></div><div class="field"><label for="inventoryQuantity">Cantidad recibida</label><input id="inventoryQuantity" name="inventoryQuantity" type="number" min="0.01" step="any" required placeholder="Ej. 50"></div></div><div class="form-actions"><button class="button button-primary" type="submit">Actualizar inventario</button></div></form>
    </section>
  </div>`;
}

function renderUsageView() {
  const capacity = Number(state.settings.shiftHours) * state.machines.length;
  const utilization = capacity ? Math.round(totalHours() / capacity * 100) : 0;
  const companies = usageByCompany();
  return `<div class="module-grid">
    <section class="panel"><div class="panel-header"><div><h2>Horas de operación de hoy</h2><p>Capacidad configurada: ${decimalFormat(state.settings.shiftHours)} h por máquina.</p></div><span class="status-pill status-operational">${utilization}% utilización</span></div>
      <p class="production-total">${decimalFormat(totalHours())}<small>horas de máquina</small></p>
      ${state.machines.map(machine => `<div class="usage-bar-row"><span class="usage-bar-name"><span>${escapeHTML(machine.icon)}</span>${escapeHTML(machine.name)}</span><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, Math.round(machine.hours / Math.max(1, Number(state.settings.shiftHours)) * 100))}%"></div></div><span class="usage-bar-value">${decimalFormat(machine.hours)} / ${decimalFormat(state.settings.shiftHours)} h</span></div>`).join("")}
    </section>
    <section class="panel"><div class="panel-header"><div><h2>Uso por empresa</h2><p>Consumo acumulado para cálculo referencial del descuento.</p></div></div>
      ${companies.length ? `<div class="alert-list">${companies.map((company, index) => companyCard(company, index)).join("")}</div>` : '<div class="empty-state">No hay empresas suscritas registradas.</div>'}
      <div class="setting-info">Descuento para la empresa con mayor utilización: participación de uso × 15%, con un máximo de 15%.</div>
    </section>
    <section class="panel full-width"><div class="panel-header"><div><h2>Detalle de uso por equipo</h2><p>Horas, estado actual y disponibilidad de los equipos.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Máquina</th><th>Estado</th><th>Horas registradas</th><th>Disponibilidad del turno</th></tr></thead><tbody>${state.machines.map(machine => `<tr><td class="table-strong">${escapeHTML(machine.name)}</td><td><span class="status-pill ${machineStatusClass(machine.status)}">${formatMachineStatus(machine.status)}</span></td><td>${decimalFormat(machine.hours)} h</td><td>${Math.max(0, Math.round((1 - machine.hours / Math.max(1, Number(state.settings.shiftHours))) * 100))}%</td></tr>`).join("")}</tbody></table></div>
    </section>
  </div>`;
}

function showToast(message) {
  const region = $("#toastRegion");
  region.innerHTML = `<div class="toast">${escapeHTML(message)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { region.innerHTML = ""; }, 3200);
}

function acknowledgeAlert(alertId) {
  const alert = state.alerts.find(item => item.id === alertId && item.active);
  if (!alert) return;
  alert.active = false;
  const stillActive = activeAlerts().some(item => item.machineId === alert.machineId);
  if (!stillActive) {
    const machine = state.machines.find(item => item.id === alert.machineId);
    if (machine && machine.status === "alerta") machine.status = "operativo";
  }
  render();
  showToast(`Alarma ${alert.id} silenciada y marcada como atendida.`);
}

function showMachineDetails(machineId) {
  const machine = state.machines.find(item => item.id === machineId);
  if (!machine) return;
  const alert = activeAlerts().find(item => item.machineId === machine.id);
  $("#dialogContent").innerHTML = `<div class="dialog-inner">
    <div class="dialog-top"><div class="dialog-heading"><span class="machine-icon">${escapeHTML(machine.icon)}</span><div><h2 id="dialogTitle">${escapeHTML(machine.name)}</h2><p>${escapeHTML(machine.id)} · Línea de producción</p></div></div><button class="dialog-close" type="button" data-close-dialog aria-label="Cerrar">×</button></div>
    <div style="margin-top:12px"><span class="status-pill ${machineStatusClass(machine.status)}">${formatMachineStatus(machine.status)}</span></div>
    <div class="dialog-metrics"><div class="dialog-metric"><span>Producción de hoy</span><strong>${numberFormat(machine.production)} ${escapeHTML(machine.unit)}</strong></div><div class="dialog-metric"><span>Horas de uso</span><strong>${decimalFormat(machine.hours)} h</strong></div><div class="dialog-metric"><span>Temperatura</span><strong>${numberFormat(machine.temperature)} °C</strong></div></div>
    <p class="dialog-alert ${machine.status === "falla" ? "fault" : ""}">${escapeHTML(alert ? alert.message : machine.detail)}</p>
    ${alert ? `<button class="button button-danger" type="button" data-ack="${escapeHTML(alert.id)}">Silenciar alarma</button>` : ""}</div>`;
  $("#machineDialog").showModal();
}

function generateWeeklyReport() {
  const weeklyTotal = state.production.weekly.reduce((total, day) => total + day.units, 0);
  const report = [
    "NEXUS | INFORME SEMANAL DE MANTENIMIENTO Y PRODUCCIÓN",
    `Fecha de generación: ${new Date().toLocaleString("es-ES")}`,
    "",
    "RESUMEN DE PRODUCCIÓN",
    `Producción registrada hoy: ${numberFormat(totalProduction())} unidades`,
    `Producción de los siete días: ${numberFormat(weeklyTotal)} unidades`,
    `Meta diaria configurada: ${numberFormat(state.production.dailyTarget)} unidades`,
    "",
    "PRODUCCIÓN POR DÍA",
    ...state.production.weekly.map(day => `${day.day}: ${numberFormat(day.units)} unidades`),
    "",
    "ESTADO Y USO DE MÁQUINAS",
    ...state.machines.map(machine => `${machine.name} (${machine.id}): ${formatMachineStatus(machine.status)} | ${numberFormat(machine.production)} ${machine.unit} | ${decimalFormat(machine.hours)} h | ${machine.temperature} °C`),
    "",
    `Alertas activas: ${activeAlerts().length}`,
    ...activeAlerts().map(alert => `- ${alert.title} (${alert.machineId}): ${alert.message}`),
    "",
    `Empresas suscritas: ${state.subscribers.length}`,
    ...usageByCompany().map((company, index) => `${company.company}: ${numberFormat(company.usageHours)} h${index === 0 && company.usageHours ? ` | descuento referencial ${discountFor(company.share)}%` : ""}`),
    "",
    "Los descuentos son referenciales y requieren aprobación financiera."
  ].join("\n");
  const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `informe-semanal-nexus-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Informe semanal generado y descargado.");
}

$("#primaryNav").addEventListener("click", event => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  currentView = button.dataset.view;
  $("#primaryNav").querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active", link === button));
  render();
});

$("#viewContent").addEventListener("click", event => {
  const ackButton = event.target.closest("[data-ack]");
  if (ackButton) {
    acknowledgeAlert(ackButton.dataset.ack);
    return;
  }
  const navigateButton = event.target.closest("[data-navigate]");
  if (navigateButton) {
    currentView = navigateButton.dataset.navigate;
    $("#primaryNav").querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === currentView));
    render();
    return;
  }
  const machine = event.target.closest("[data-machine]");
  if (machine) showMachineDetails(machine.dataset.machine);
});

$("#viewContent").addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-machine]")) {
    event.preventDefault();
    showMachineDetails(event.target.dataset.machine);
  }
});

$("#machineDialog").addEventListener("click", event => {
  if (event.target.closest("[data-close-dialog]")) $("#machineDialog").close();
  if (event.target === $("#machineDialog")) $("#machineDialog").close();
  const ackButton = event.target.closest("[data-ack]");
  if (ackButton) {
    acknowledgeAlert(ackButton.dataset.ack);
    $("#machineDialog").close();
  }
});

$("#reportButton").addEventListener("click", generateWeeklyReport);
$("#reportButtonSecondary").addEventListener("click", generateWeeklyReport);

$("#viewContent").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "settingsForm") {
    const formData = new FormData(form);
    const dailyTarget = Number(formData.get("dailyTarget"));
    const shiftHours = Number(formData.get("shiftHours"));
    if (!Number.isFinite(dailyTarget) || dailyTarget < 1 || !Number.isFinite(shiftHours) || shiftHours < 1 || shiftHours > 24) {
      showToast("Verifica la meta y configura un turno entre 1 y 24 horas.");
      return;
    }
    state.production.dailyTarget = dailyTarget;
    state.settings.shiftHours = shiftHours;
    render();
    showToast("Configuración guardada correctamente.");
  }

  if (form.id === "subscriberForm") {
    const formData = new FormData(form);
    const company = String(formData.get("companyName")).trim();
    const code = String(formData.get("companyCode")).trim();
    if (!company || !code) return;
    if (state.subscribers.some(item => item.code.toLowerCase() === code.toLowerCase())) {
      showToast("Ese código ya está registrado. Ingresa uno único.");
      return;
    }
    state.subscribers.push({ company, code, usageHours: 0, active: true });
    render();
    showToast(`${company} fue registrada en el sistema.`);
  }

  if (form.id === "inventoryForm") {
    const formData = new FormData(form);
    const item = state.inventory.find(entry => entry.id === formData.get("inventoryItem"));
    const quantity = Number(formData.get("inventoryQuantity"));
    if (!item || !Number.isFinite(quantity) || quantity <= 0) {
      showToast("Selecciona un material e ingresa una cantidad mayor a cero.");
      return;
    }
    item.quantity += quantity;
    render();
    showToast(`Inventario actualizado: ${item.name} recibió ${decimalFormat(quantity)} ${item.unit}.`);
  }
});

loadData();