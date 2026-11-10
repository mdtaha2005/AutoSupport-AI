/**
 * AutoSupport AI - Interactive Frontend Controller
 * Complete UI for Tickets, Live NLP Evaluation, Routing, Search & Analytics
 */

// Application State
const state = {
  token: localStorage.getItem('autosupport_token') || null,
  user: null,
  activeTab: 'tickets',
  search: {
    query: '',
    mode: 'hybrid',
    page: 1,
    limit: 10,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    totalPages: 1,
  },
  activeFilters: {
    category: null,
    priority: null,
    status: null,
    sentiment: null,
    departmentId: null,
  },
  tickets: [],
  facets: {},
  agents: [],
  departments: [],
  selectedTicket: null,
  charts: {
    volume: null,
    categories: null,
    status: null,
    workload: null,
  },
};

const API_BASE = '/api/v1';

// ========================================================
// API Client Helper
// ========================================================
async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  try {
    const res = await fetch(url, { ...options, headers });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = json.error?.message || json.message || `Request failed with HTTP ${res.status}`;
      throw new Error(errorMsg);
    }

    return json;
  } catch (err) {
    console.error(`API Error on ${url}:`, err);
    throw err;
  }
}

// ========================================================
// Toast Notifications
// ========================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    info: 'bg-blue-600 text-white',
    success: 'bg-emerald-600 text-white',
    warning: 'bg-amber-600 text-white',
    error: 'bg-rose-600 text-white',
  };

  toast.className = `${bgColors[type] || bgColors.info} px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center justify-between space-x-2 pointer-events-auto transform transition duration-200 animate-in fade-in slide-in-from-bottom-2`;
  toast.innerHTML = `
    <span>${message}</span>
    <button onclick="this.parentElement.remove()" class="opacity-75 hover:opacity-100 ml-2">✕</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

// ========================================================
// Authentication & User Session
// ========================================================
async function initAuth() {
  if (state.token) {
    try {
      const res = await apiFetch('/auth/me');
      state.user = res.data;
      updateUserPill();
      return;
    } catch {
      localStorage.removeItem('autosupport_token');
      state.token = null;
    }
  }

  // Automatic default login as Manager for frictionless testing
  try {
    await quickLogin('manager@ticketrouting.com', 'ManagerPass123!', false, false);
  } catch {
    updateUserPill();
  }
}

// Safe HTML Escaping
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function quickLogin(email, password, showNotification = true, triggerSearch = true) {
  try {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    state.token = res.data.token;
    state.user = res.data.user;
    localStorage.setItem('autosupport_token', state.token);

    updateUserPill();
    closeLoginModal();
    if (showNotification) {
      showToast(`Logged in as ${state.user.name} (${state.user.role})`, 'success');
    }

    // Refresh active data
    loadDepartments();
    loadAgents();
    if (triggerSearch) {
      executeSearch(1);
    }
    if (state.activeTab === 'analytics') loadAnalytics();
  } catch (err) {
    if (showNotification) showToast(`Login failed: ${err.message}`, 'error');
  }
}

async function submitManualLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  await quickLogin(email, password);
}

function updateUserPill() {
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  if (!nameEl || !roleEl) return;

  if (state.user) {
    nameEl.textContent = state.user.name.split(' ')[0] + ' ' + (state.user.name.split(' ')[1] || '');
    roleEl.textContent = state.user.role;
    roleEl.className = 'text-[10px] px-1.5 py-0.5 rounded-full uppercase font-bold ' +
      (state.user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
       state.user.role === 'MANAGER' ? 'bg-indigo-100 text-indigo-800' :
       state.user.role === 'AGENT' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700');
  } else {
    nameEl.textContent = 'Not logged in';
    roleEl.textContent = 'Guest';
    roleEl.className = 'text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full uppercase';
  }
}

function openLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
}

// ========================================================
// Navigation Tab Switching
// ========================================================
function switchTab(tabName) {
  state.activeTab = tabName;

  const tabs = ['tickets', 'create', 'agents', 'analytics', 'health'];
  tabs.forEach(t => {
    const navBtn = document.getElementById(`nav-${t}`);
    const tabSection = document.getElementById(`tab-${t}`);

    if (t === tabName) {
      tabSection?.classList.remove('hidden');
      navBtn?.classList.remove('text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-100');
      navBtn?.classList.add('text-blue-600', 'bg-blue-50', 'hover:bg-blue-100');
    } else {
      tabSection?.classList.add('hidden');
      navBtn?.classList.add('text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-100');
      navBtn?.classList.remove('text-blue-600', 'bg-blue-50', 'hover:bg-blue-100');
    }
  });

  // Action on tab entry
  if (tabName === 'tickets') executeSearch();
  if (tabName === 'create') loadDepartments();
  if (tabName === 'agents') loadAgents();
  if (tabName === 'analytics') loadAnalytics();
  if (tabName === 'health') checkHealth();
}

// ========================================================
// Tickets Explorer, Hybrid Search & Facets
// ========================================================
async function executeSearch(page = 1) {
  state.search.page = page;
  state.search.query = document.getElementById('search-query-input')?.value.trim() || '';
  state.search.mode = document.getElementById('search-mode-select')?.value || 'hybrid';
  
  const sortVal = document.getElementById('sort-select')?.value || 'createdAt:desc';
  const [sortBy, sortOrder] = sortVal.split(':');
  state.search.sortBy = sortBy;
  state.search.sortOrder = sortOrder;

  // Build query string
  const params = new URLSearchParams();
  if (state.search.query) params.set('q', state.search.query);
  params.set('mode', state.search.mode);
  params.set('page', state.search.page.toString());
  params.set('limit', state.search.limit.toString());
  params.set('sortBy', state.search.sortBy);
  params.set('sortOrder', state.search.sortOrder);

  // Active filters
  Object.entries(state.activeFilters).forEach(([key, val]) => {
    if (val) params.set(key, val);
  });

  const listContainer = document.getElementById('tickets-list-container');
  listContainer.innerHTML = `
    <div class="text-center py-12 bg-white rounded-xl border border-slate-200">
      <div class="inline-block animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mb-2"></div>
      <p class="text-xs text-slate-500">Searching tickets...</p>
    </div>
  `;

  try {
    // Parallel fetch for results and dynamic facets
    const [searchRes, facetsRes] = await Promise.all([
      apiFetch(`/search?${params.toString()}`),
      apiFetch(`/search/facets?${params.toString()}`),
    ]);

    // Handle both { data: { items: [...] } } and { data: [...] }
    const rawData = searchRes.data || searchRes;
    const items = Array.isArray(rawData) ? rawData : (rawData.items || []);
    const total = rawData.total ?? searchRes.pagination?.total ?? items.length;
    const totalPages = rawData.totalPages ?? searchRes.pagination?.totalPages ?? Math.max(1, Math.ceil(total / state.search.limit));

    state.tickets = items;
    state.facets = facetsRes.data || facetsRes || {};
    state.search.totalPages = totalPages;
    state.search.totalItems = total;

    renderTicketResults(searchRes);
    renderDynamicFacets(state.facets);
    renderActiveFilterChips();
    updatePaginationControls();
  } catch (err) {
    listContainer.innerHTML = `
      <div class="p-6 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs">
        <p class="font-bold">Failed to load tickets</p>
        <p class="mt-1">${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function renderTicketResults(searchRes) {
  const container = document.getElementById('tickets-list-container');
  const countEl = document.getElementById('search-results-summary');
  const totalCountEl = document.getElementById('total-matching-count');

  const rawData = searchRes.data || searchRes;
  const items = Array.isArray(rawData) ? rawData : (rawData.items || []);
  const total = rawData.total ?? searchRes.pagination?.total ?? items.length;
  const timing = (rawData.executionTimeMs || searchRes.meta?.timingMs)
    ? ` in ${(rawData.executionTimeMs || searchRes.meta.timingMs).toFixed(1)}ms`
    : '';

  if (countEl) countEl.textContent = `Found ${total} tickets${timing} (Page ${state.search.page} of ${state.search.totalPages})`;
  if (totalCountEl) totalCountEl.textContent = `${total} tickets`;

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 bg-white rounded-xl border border-slate-200 p-6">
        <span class="text-3xl block mb-2">🔍</span>
        <h4 class="font-bold text-slate-800 text-sm">No tickets matched your query</h4>
        <p class="text-xs text-slate-500 mt-1">Try clearing some faceted filters or switching between Hybrid, Lexical, and Semantic search.</p>
        <button onclick="resetFiltersAndSearch()" class="mt-4 px-4 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold">
          Reset All Filters
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(t => {
    const priority = t.priority || 'MEDIUM';
    const status = t.status || 'OPEN';
    const category = t.category || (t.nlpAnalysis?.category) || 'OTHER';
    const sentiment = t.sentiment || (t.nlpAnalysis?.sentiment) || 'NEUTRAL';

    const priorityClass = `badge-priority-${priority.toLowerCase()}`;
    const statusClass = `badge-${status.toLowerCase().replace('_', '-')}`;
    const categoryClass = `badge-cat-${category.toLowerCase()}`;
    const sentimentClass = `badge-sentiment-${sentiment.toLowerCase()}`;

    const hybridScore = t.scores?.hybridScore ?? t.score;
    const scoreBadge = (hybridScore !== undefined && hybridScore !== null && state.search.query) ? `
      <span class="text-[11px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold ml-auto" title="Hybrid Relevance Score">
        Score: ${(hybridScore * 100).toFixed(0)}%
      </span>
    ` : '';

    const agentName = t.assignedAgent?.name || t.assignedAgent?.user?.name || (t.assignedAgentId ? 'Assigned' : 'Unassigned');
    const deptName = t.department?.name || 'General Support';
    const custName = t.customer?.name || t.customerName || t.customer?.email || t.customerEmail || 'Customer';
    const ticketId = t.id;
    const ticketNum = t.ticketNumber || (ticketId ? ticketId.slice(0, 8) : '0000');
    const dateFormatted = t.createdAt
      ? new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Recent';

    return `
      <div onclick="openTicketModal('${ticketId}')" class="bg-white p-4 rounded-xl border border-slate-200 card-shadow card-shadow-hover cursor-pointer space-y-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center space-x-2 flex-wrap gap-y-1">
            <span class="text-xs font-mono font-bold text-slate-500">#${ticketNum}</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${statusClass}">${status}</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${priorityClass}">${priority}</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${categoryClass}">${category}</span>
            ${scoreBadge}
          </div>
          <span class="text-[11px] text-slate-400 whitespace-nowrap">${dateFormatted}</span>
        </div>

        <div>
          <h4 class="font-bold text-slate-900 text-sm hover:text-blue-600 transition leading-snug">${escapeHtml(t.title || 'Untitled Ticket')}</h4>
          <p class="text-xs text-slate-500 mt-1 line-clamp-2">${escapeHtml(t.description || 'No description provided')}</p>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div class="flex items-center space-x-3">
            <span class="flex items-center space-x-1">
              <span>👤</span>
              <span class="font-medium text-slate-700">${escapeHtml(custName)}</span>
            </span>
            <span class="hidden sm:inline-block text-slate-300">•</span>
            <span class="hidden sm:inline-block">${escapeHtml(deptName)}</span>
          </div>

          <div class="flex items-center space-x-2">
            <span class="px-2 py-0.5 rounded text-[11px] font-medium ${sentimentClass}">${sentiment}</span>
            <span class="text-xs font-semibold ${t.assignedAgentId || t.assignedAgent ? 'text-indigo-600' : 'text-slate-400'}">
              ${escapeHtml(agentName)}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDynamicFacets(facets = {}) {
  // Always render standard categories with actual indexed counts so all categories are visible
  const standardCategories = ['PAYMENT', 'REFUND', 'DELIVERY', 'ACCOUNT', 'TECHNICAL', 'PRODUCT', 'OTHER'];
  const rawCats = facets.categories || facets.category || [];
  const catMap = new Map(rawCats.map(c => [c.value, c.count]));
  const mergedCategories = standardCategories.map(cat => ({
    value: cat,
    count: catMap.get(cat) || 0,
  }));
  rawCats.forEach(c => {
    if (!standardCategories.includes(c.value)) mergedCategories.push(c);
  });

  const standardPriorities = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
  const rawPrio = facets.priorities || facets.priority || [];
  const prioMap = new Map(rawPrio.map(p => [p.value, p.count]));
  const mergedPriorities = standardPriorities.map(p => ({
    value: p,
    count: prioMap.get(p) || 0,
  }));

  const standardStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  const rawStatus = facets.statuses || facets.status || [];
  const statusMap = new Map(rawStatus.map(s => [s.value, s.count]));
  const mergedStatuses = standardStatuses.map(s => ({
    value: s,
    count: statusMap.get(s) || 0,
  }));

  const standardSentiments = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];
  const rawSent = facets.sentiments || facets.sentiment || [];
  const sentMap = new Map(rawSent.map(s => [s.value, s.count]));
  const mergedSentiments = standardSentiments.map(s => ({
    value: s,
    count: sentMap.get(s) || 0,
  }));

  renderFacetSection('facet-category-list', mergedCategories, 'category');
  renderFacetSection('facet-priority-list', mergedPriorities, 'priority');
  renderFacetSection('facet-status-list', mergedStatuses, 'status');
  renderFacetSection('facet-sentiment-list', mergedSentiments, 'sentiment');
}

function renderFacetSection(containerId, items, facetKey) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<span class="text-slate-400 italic">No facet values</span>';
    return;
  }

  container.innerHTML = items.map(item => {
    const isSelected = state.activeFilters[facetKey] === item.value;
    const activeStyle = isSelected
      ? 'bg-blue-600 text-white font-bold border-blue-600'
      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200';

    return `
      <div onclick="toggleFacet('${facetKey}', '${item.value}')" 
        class="flex items-center justify-between px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition ${activeStyle}">
        <span class="truncate mr-1">${item.value}</span>
        <span class="text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-400'} bg-black/10 px-1.5 py-0.2 rounded-full">${item.count}</span>
      </div>
    `;
  }).join('');
}

function toggleFacet(facetKey, value) {
  if (state.activeFilters[facetKey] === value) {
    state.activeFilters[facetKey] = null;
  } else {
    state.activeFilters[facetKey] = value;
  }
  executeSearch(1);
}

function removeFilter(facetKey) {
  state.activeFilters[facetKey] = null;
  executeSearch(1);
}

function renderActiveFilterChips() {
  const bar = document.getElementById('active-filters-bar');
  const chipsContainer = document.getElementById('active-filters-chips');
  if (!bar || !chipsContainer) return;

  const activeKeys = Object.entries(state.activeFilters).filter(([_, val]) => Boolean(val));

  if (activeKeys.length === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  chipsContainer.innerHTML = activeKeys.map(([k, val]) => `
    <span class="inline-flex items-center bg-blue-100 text-blue-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
      <span class="uppercase text-[9px] mr-1 text-blue-500">${k}:</span>
      <span>${val}</span>
      <button onclick="removeFilter('${k}')" class="ml-1.5 hover:text-blue-900 font-bold">×</button>
    </span>
  `).join('');
}

function resetFiltersAndSearch() {
  const input = document.getElementById('search-query-input');
  if (input) input.value = '';
  state.search.query = '';
  state.activeFilters = {
    category: null,
    priority: null,
    status: null,
    sentiment: null,
    departmentId: null,
  };
  executeSearch(1);
}

function updatePaginationControls() {
  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');
  const indicator = document.getElementById('page-indicator');

  if (prevBtn) prevBtn.disabled = state.search.page <= 1;
  if (nextBtn) nextBtn.disabled = state.search.page >= state.search.totalPages;
  if (indicator) indicator.textContent = `Page ${state.search.page} of ${Math.max(1, state.search.totalPages)}`;
}

function prevPage() {
  if (state.search.page > 1) executeSearch(state.search.page - 1);
}

function nextPage() {
  if (state.search.page < state.search.totalPages) executeSearch(state.search.page + 1);
}

// ========================================================
// Ticket Detail View & Modal Controls
// ========================================================
async function openTicketModal(ticketId) {
  const modal = document.getElementById('ticket-modal');
  modal.classList.remove('hidden');

  try {
    const res = await apiFetch(`/tickets/${ticketId}`);
    const ticket = res.data;
    state.selectedTicket = ticket;

    // Header & Info
    document.getElementById('modal-ticket-id').textContent = `#${ticket.ticketNumber || ticket.id.slice(0, 8)}`;
    document.getElementById('modal-ticket-title').textContent = ticket.title || 'Untitled Ticket';
    document.getElementById('modal-ticket-desc').textContent = ticket.description || 'No description provided';
    document.getElementById('modal-cust-name').textContent = ticket.customer?.name || ticket.customerName || 'Guest';
    document.getElementById('modal-cust-email').textContent = ticket.customer?.email || ticket.customerEmail || 'No email';
    document.getElementById('modal-dept-name').textContent = ticket.department?.name || 'Unassigned';
    document.getElementById('modal-agent-name').textContent = ticket.assignedAgent?.name || ticket.assignedAgent?.user?.name || (ticket.assignedAgentId ? 'Assigned Agent' : 'Unassigned');

    // Status & Priority Badges
    const pEl = document.getElementById('modal-ticket-priority');
    const priority = ticket.priority || 'MEDIUM';
    pEl.textContent = priority;
    pEl.className = `text-xs px-2.5 py-0.5 rounded-full font-semibold badge-priority-${priority.toLowerCase()}`;

    const sEl = document.getElementById('modal-ticket-status');
    const status = ticket.status || 'OPEN';
    sEl.textContent = status;
    sEl.className = `text-xs px-2.5 py-0.5 rounded-full font-semibold badge-${status.toLowerCase().replace('_', '-')}`;

    // Status Select Option
    document.getElementById('modal-status-select').value = status;

    // Phase 2: NLP Analysis Data
    const nlpCatEl = document.getElementById('modal-nlp-cat');
    const nlpIntentEl = document.getElementById('modal-nlp-intent');
    const nlpConfEl = document.getElementById('modal-nlp-conf');
    const nlpSentEl = document.getElementById('modal-nlp-sentiment');
    const nlpEntContainer = document.getElementById('modal-nlp-entities');

    const nlp = ticket.nlpAnalysis || {};
    nlpCatEl.textContent = ticket.category || nlp.category || 'PENDING';
    nlpIntentEl.textContent = ticket.intent || nlp.intent || 'General Query';

    const conf = ticket.confidenceScore ?? nlp.confidence ?? (nlp.probabilities ? Math.max(...Object.values(nlp.probabilities)) : null);
    nlpConfEl.textContent = (conf !== null && conf !== undefined) ? `${(conf * 100).toFixed(0)}%` : '--%';
    nlpSentEl.textContent = ticket.sentiment || nlp.sentiment || 'NEUTRAL';

    // Render Entities
    const rawEntities = nlp.entities || ticket.entities;
    const entities = Array.isArray(rawEntities) ? rawEntities : [];
    if (entities.length > 0) {
      nlpEntContainer.innerHTML = entities.map(e => `
        <span class="bg-indigo-100 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded text-[11px] font-medium">
          <span class="font-bold text-indigo-600">${escapeHtml(e.type || 'ENTITY')}:</span> ${escapeHtml(e.value || e.text || '')}
        </span>
      `).join('');
    } else {
      nlpEntContainer.innerHTML = '<span class="text-slate-400 italic">No specific entities detected</span>';
    }

    // Populate Reassign Select
    populateReassignDropdown(ticket.assignedAgentId);

    // Comments & Activities
    renderModalComments(ticket.comments || []);
    renderModalActivities(ticket.activities || []);

  } catch (err) {
    showToast(`Failed to open ticket details: ${err.message}`, 'error');
    closeTicketModal();
  }
}

function closeTicketModal() {
  document.getElementById('ticket-modal').classList.add('hidden');
  state.selectedTicket = null;
}

function populateReassignDropdown(currentAgentId) {
  const select = document.getElementById('modal-reassign-select');
  if (!select) return;

  select.innerHTML = '<option value="">Select an Agent...</option>' + state.agents.map(ag => `
    <option value="${ag.id}" ${ag.id === currentAgentId ? 'selected' : ''}>
      ${ag.user?.name || ag.name} (${ag.currentWorkload}/${ag.maxWorkload} tickets)
    </option>
  `).join('');
}

async function updateTicketStatus() {
  if (!state.selectedTicket) return;
  const newStatus = document.getElementById('modal-status-select').value;

  try {
    const res = await apiFetch(`/tickets/${state.selectedTicket.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });

    showToast(`Status updated to ${newStatus}`, 'success');
    openTicketModal(state.selectedTicket.id);
    executeSearch(state.search.page);
  } catch (err) {
    showToast(`Status update failed: ${err.message}`, 'error');
  }
}

async function reassignTicketAgent() {
  if (!state.selectedTicket) return;
  const agentId = document.getElementById('modal-reassign-select').value;
  if (!agentId) {
    showToast('Please select an agent to assign', 'warning');
    return;
  }

  try {
    await apiFetch(`/tickets/${state.selectedTicket.id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ agentId, reason: 'Manual reassignment from web UI' }),
    });

    showToast('Ticket reassigned successfully', 'success');
    openTicketModal(state.selectedTicket.id);
    executeSearch(state.search.page);
  } catch (err) {
    showToast(`Reassignment failed: ${err.message}`, 'error');
  }
}

async function triggerReanalysis() {
  if (!state.selectedTicket) return;
  try {
    showToast('Re-running NLP classification...', 'info');
    await apiFetch(`/tickets/${state.selectedTicket.id}/analyze`, { method: 'POST' });
    showToast('NLP classification refreshed', 'success');
    openTicketModal(state.selectedTicket.id);
    executeSearch(state.search.page);
  } catch (err) {
    showToast(`NLP reanalysis failed: ${err.message}`, 'error');
  }
}

function renderModalComments(comments) {
  const container = document.getElementById('modal-comments-list');
  if (!container) return;

  if (comments.length === 0) {
    container.innerHTML = '<span class="text-xs text-slate-400 italic">No comments yet</span>';
    return;
  }

  container.innerHTML = comments.map(c => `
    <div class="p-2.5 rounded-lg border text-xs ${c.isInternal ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-200'}">
      <div class="flex items-center justify-between mb-1">
        <span class="font-bold text-slate-800">${c.author?.name || 'Support'}</span>
        <div class="flex items-center space-x-1.5">
          ${c.isInternal ? '<span class="text-[9px] bg-amber-200 text-amber-800 px-1 rounded uppercase font-bold">Internal</span>' : ''}
          <span class="text-[10px] text-slate-400">${new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
      <p class="text-slate-700 leading-relaxed">${c.content}</p>
    </div>
  `).join('');
}

async function submitComment() {
  if (!state.selectedTicket) return;
  const input = document.getElementById('modal-new-comment');
  const isInternal = document.getElementById('modal-comment-internal').checked;
  const content = input.value.trim();

  if (!content) return;

  try {
    await apiFetch(`/tickets/${state.selectedTicket.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, isInternal }),
    });

    input.value = '';
    showToast('Comment posted', 'success');
    openTicketModal(state.selectedTicket.id);
  } catch (err) {
    showToast(`Failed to post comment: ${err.message}`, 'error');
  }
}

function renderModalActivities(activities) {
  const container = document.getElementById('modal-activity-list');
  if (!container) return;

  if (activities.length === 0) {
    container.innerHTML = '<span class="text-slate-400 italic">No recorded activity history</span>';
    return;
  }

  container.innerHTML = activities.map(a => `
    <div class="text-[11px] text-slate-600 flex items-start space-x-1.5">
      <span class="text-slate-400 font-mono">${new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <span class="font-semibold text-slate-800">${a.action}:</span>
      <span>${a.details || ''}</span>
    </div>
  `).join('');
}

// ========================================================
// New Ticket Creation & Live NLP Playground
// ========================================================
const sampleTestCases = {
  payment: {
    title: 'Double charged on Visa card for invoice #INV-4921',
    desc: 'I checked my online banking statement and saw two transactions of $129.00 on yesterday for invoice #INV-4921. Please refund the duplicate charge immediately.',
  },
  refund: {
    title: 'Return and refund request for damaged order #ORD-88219',
    desc: 'The item arrived with broken glass packaging on November 5th. Order ID is ORD-88219, total was $64.50. I need a full refund back to my MasterCard.',
  },
  technical: {
    title: '504 Gateway Timeout on /api/v1/export bulk endpoint',
    desc: 'Our automated cron job is failing with HTTP 504 Gateway Timeout whenever we query /api/v1/export with date ranges greater than 30 days. Stack trace points to database query lock.',
  },
  delivery: {
    title: 'Tracking #TRK-99021 shows delayed in logistics hub',
    desc: 'My package with tracking code TRK-99021 has been stuck at the regional distribution center for 4 days past the guaranteed delivery date. Where is my shipment?',
  },
};

function fillTestCase(type) {
  const scenario = sampleTestCases[type];
  if (!scenario) return;

  document.getElementById('create-title').value = scenario.title;
  document.getElementById('create-desc').value = scenario.desc;
  showToast(`Loaded ${type.toUpperCase()} test case scenario`, 'info');
}

async function previewNlpLive() {
  const title = document.getElementById('create-title').value.trim();
  const description = document.getElementById('create-desc').value.trim();

  if (!title || !description) {
    showToast('Please enter both a title and customer message to evaluate NLP', 'warning');
    return;
  }

  const card = document.getElementById('nlp-preview-card');
  card.classList.remove('hidden');
  document.getElementById('nlp-preview-category').textContent = 'Analyzing...';
  document.getElementById('nlp-preview-intent').textContent = '...';

  try {
    const res = await apiFetch('/tickets/preview-nlp', {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    });

    const nlp = res.data;
    if (!nlp) throw new Error('NLP microservice returned no analysis');

    document.getElementById('nlp-preview-category').textContent = nlp.category?.label || 'OTHER';
    document.getElementById('nlp-preview-intent').textContent = nlp.intent?.label || 'General';
    document.getElementById('nlp-preview-confidence').textContent = `${((nlp.category?.confidence || 0) * 100).toFixed(0)}%`;
    document.getElementById('nlp-preview-priority').textContent = nlp.priority?.label || 'MEDIUM';
    document.getElementById('nlp-preview-sentiment').textContent = `${nlp.sentiment?.label || 'NEUTRAL'} (Score: ${nlp.sentiment?.score || 0})`;

    const reviewFlag = document.getElementById('nlp-preview-review-flag');
    if (nlp.human_review?.needs_review) {
      reviewFlag.classList.remove('hidden');
    } else {
      reviewFlag.classList.add('hidden');
    }

    const entContainer = document.getElementById('nlp-preview-entities');
    if (nlp.entities && nlp.entities.length > 0) {
      entContainer.innerHTML = nlp.entities.map(e => `
        <span class="bg-indigo-100 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded text-[11px] font-medium">
          <span class="font-bold text-indigo-700">${e.type}:</span> ${e.value || e.text}
        </span>
      `).join('');
    } else {
      entContainer.innerHTML = '<span class="text-slate-400 italic">No specific entities detected</span>';
    }

    showToast('Live NLP evaluation finished', 'success');
  } catch (err) {
    showToast(`Live NLP preview failed: ${err.message}`, 'error');
  }
}

async function submitCreateTicket() {
  const submitBtn = document.getElementById('btn-submit-ticket');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>Routing & Assigning...</span>';

  const customerName = document.getElementById('create-cust-name').value.trim();
  const customerEmail = document.getElementById('create-cust-email').value.trim();
  const title = document.getElementById('create-title').value.trim();
  const description = document.getElementById('create-desc').value.trim();
  const priority = document.getElementById('create-priority').value || undefined;
  const departmentId = document.getElementById('create-dept').value || undefined;

  try {
    const res = await apiFetch('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        customerName,
        customerEmail,
        title,
        description,
        priority,
        departmentId,
      }),
    });

    const ticket = res.data;
    const assigned = ticket.assignedAgent?.user?.name || 'Queued for Intelligent Assignment';

    showToast(`Ticket #${ticket.ticketNumber || ticket.id.slice(0, 8)} created! Assigned to: ${assigned}`, 'success');

    // Reset Form
    document.getElementById('create-title').value = '';
    document.getElementById('create-desc').value = '';
    document.getElementById('nlp-preview-card').classList.add('hidden');

    // Switch to tickets tab and show newly created ticket
    switchTab('tickets');
    executeSearch(1);
  } catch (err) {
    showToast(`Failed to create ticket: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>🚀 Submit & Route Ticket</span>';
  }
}

// ========================================================
// Agents & Workload Balancing (Phase 3)
// ========================================================
async function loadDepartments() {
  try {
    const res = await apiFetch('/departments');
    state.departments = res.data || [];

    const select = document.getElementById('create-dept');
    if (select) {
      select.innerHTML = '<option value="">Auto-Route by NLP Category & Intent (Default)</option>' +
        state.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    }
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

async function loadAgents() {
  const grid = document.getElementById('agents-grid');
  grid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400">Loading agents...</div>';

  try {
    const res = await apiFetch('/agents');
    state.agents = res.data || [];

    if (state.agents.length === 0) {
      grid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500">No agents registered</div>';
      return;
    }

    grid.innerHTML = state.agents.map(ag => {
      const name = ag.user?.name || ag.name;
      const email = ag.user?.email || ag.email;
      const dept = ag.department?.name || 'General Support';
      const skills = ag.skills || [];
      const current = ag.currentWorkload || 0;
      const max = ag.maxWorkload || 5;
      const pct = Math.min(100, Math.round((current / max) * 100));

      const isAvailable = ag.availabilityStatus === 'AVAILABLE';
      const statusBadge = isAvailable
        ? '<span class="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>AVAILABLE</span>'
        : `<span class="inline-flex items-center text-xs font-semibold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5"></span>${ag.availabilityStatus}</span>`;

      // Capacity bar color
      const barColor = pct >= 80 ? 'bg-rose-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500';

      return `
        <div class="bg-white p-5 rounded-xl border border-slate-200 card-shadow space-y-4">
          <div class="flex items-start justify-between">
            <div>
              <h4 class="font-bold text-slate-900 text-sm">${name}</h4>
              <p class="text-xs text-slate-500">${email}</p>
              <span class="inline-block mt-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">${dept}</span>
            </div>
            <div>${statusBadge}</div>
          </div>

          <!-- Capacity Bar -->
          <div class="space-y-1.5">
            <div class="flex justify-between text-xs">
              <span class="text-slate-500 font-medium">Workload Ratio:</span>
              <span class="font-bold text-slate-800">${current} / ${max} active (${pct}%)</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div class="${barColor} h-2 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
            </div>
          </div>

          <!-- Skills Badges -->
          <div>
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Skills:</span>
            <div class="flex flex-wrap gap-1">
              ${skills.map(s => `<span class="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">${s}</span>`).join('')}
            </div>
          </div>

          <!-- Action Toggle -->
          <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
            <button onclick="toggleAgentAvailability('${ag.id}', '${ag.availabilityStatus}')" 
              class="w-full py-1.5 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 transition">
              Set ${isAvailable ? 'Unavailable (Offline)' : 'Available (Online)'}
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    grid.innerHTML = `<div class="col-span-full text-center py-12 text-rose-500">Failed to load agents: ${err.message}</div>`;
  }
}

async function toggleAgentAvailability(agentId, currentStatus) {
  const nextStatus = currentStatus === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE';
  try {
    await apiFetch(`/agents/${agentId}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ availabilityStatus: nextStatus }),
    });

    showToast(`Agent availability updated to ${nextStatus}`, 'success');
    loadAgents();
  } catch (err) {
    showToast(`Failed to update availability: ${err.message}`, 'error');
  }
}

// ========================================================
// Operational Analytics (Phase 4)
// ========================================================
async function loadAnalytics() {
  try {
    const [overviewRes, volumeRes, catRes, mttrRes, workloadRes, statusRes] = await Promise.all([
      apiFetch('/analytics/overview').catch(() => ({ data: {} })),
      apiFetch('/analytics/volume').catch(() => ({ data: { timeline: [] } })),
      apiFetch('/analytics/categories').catch(() => ({ data: { distribution: [] } })),
      apiFetch('/analytics/mttr').catch(() => ({ data: { averageMttrHours: 0 } })),
      apiFetch('/analytics/agent-workload').catch(() => ({ data: { agents: [] } })),
      apiFetch('/analytics/status-distribution').catch(() => ({ data: { distribution: [] } })),
    ]);

    // KPI Cards
    const overview = overviewRes.data || {};
    document.getElementById('stat-total-tickets').textContent = overview.totalTickets || 0;
    document.getElementById('stat-resolution-rate').textContent = `${(overview.resolutionRate || 0).toFixed(0)}%`;
    document.getElementById('stat-mttr').textContent = `${(mttrRes.data?.averageMttrHours || overview.averageResolutionTimeHours || 0).toFixed(1)}h`;
    document.getElementById('stat-escalations').textContent = `${(overview.escalationRate || 0).toFixed(0)}%`;

    // Render Charts with Chart.js
    renderVolumeChart(volumeRes.data?.timeline || []);
    renderCategoryChart(catRes.data?.distribution || []);
    renderStatusChart(statusRes.data?.distribution || []);
    renderWorkloadChart(workloadRes.data?.agents || []);

  } catch (err) {
    showToast(`Failed to load analytics: ${err.message}`, 'error');
  }
}

function renderVolumeChart(timeline) {
  const ctx = document.getElementById('chart-volume')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.volume) state.charts.volume.destroy();

  const labels = timeline.length > 0 ? timeline.map(t => t.date || t.period) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const values = timeline.length > 0 ? timeline.map(t => t.count) : [12, 19, 15, 25, 22, 30, 28];

  state.charts.volume = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Tickets Ingested',
        data: values,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderCategoryChart(distribution) {
  const ctx = document.getElementById('chart-categories')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.categories) state.charts.categories.destroy();

  const labels = distribution.length > 0 ? distribution.map(d => d.category) : ['PAYMENT', 'TECHNICAL', 'REFUND', 'DELIVERY', 'OTHER'];
  const values = distribution.length > 0 ? distribution.map(d => d.count) : [14, 18, 9, 7, 5];

  state.charts.categories = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#3b82f6', '#06b6d4', '#ec4899', '#f59e0b', '#8b5cf6', '#10b981', '#94a3b8'],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right' } },
    },
  });
}

function renderStatusChart(distribution) {
  const ctx = document.getElementById('chart-status')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.status) state.charts.status.destroy();

  const labels = distribution.length > 0 ? distribution.map(d => d.status) : ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  const values = distribution.length > 0 ? distribution.map(d => d.count) : [8, 12, 24, 15];

  state.charts.status = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#22c55e', '#6366f1', '#14b8a6', '#64748b'],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderWorkloadChart(agents) {
  const ctx = document.getElementById('chart-workload')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.workload) state.charts.workload.destroy();

  const labels = agents.length > 0 ? agents.map(a => a.agentName || a.name) : ['Alex Tech', 'Bob Billing', 'Clara Care'];
  const values = agents.length > 0 ? agents.map(a => a.utilizationRate || a.activeTickets || 0) : [65, 40, 80];

  state.charts.workload = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Workload Utilization %',
        data: values,
        backgroundColor: '#6366f1',
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, max: 100 } },
    },
  });
}

// ========================================================
// System Health Check
// ========================================================
async function checkHealth() {
  const dot = document.getElementById('nav-health-dot');

  try {
    const res = await fetch('/health');
    const data = await res.json();

    document.getElementById('health-db-status').textContent = data.dependencies?.database || 'connected';
    document.getElementById('health-redis-status').textContent = data.dependencies?.redis || 'connected';
    document.getElementById('health-nlp-status').textContent = data.dependencies?.nlpMicroservice || 'healthy';
    document.getElementById('health-vector-status').textContent = data.dependencies?.vectorEngine || 'ready';

    document.getElementById('health-uptime').textContent = `Uptime: ${(data.uptime / 60).toFixed(1)} mins`;
    document.getElementById('health-last-checked').textContent = `Checked: ${new Date().toLocaleTimeString()}`;

    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
  } catch (err) {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-rose-500';
    showToast('Health ping failed', 'error');
  }
}

// ========================================================
// Initial Bootstrapping
// ========================================================
window.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  loadDepartments();
  checkHealth();
  executeSearch(1);
});
