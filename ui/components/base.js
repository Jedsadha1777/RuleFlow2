class BaseBlock {
  constructor() {
    this.data = { id: this.genId() };
    this.collapsed = false;
  }

  kind() { return 'base'; }
  kindLabel() { return 'Block'; }
  kindIcon() { return 'bi-square'; }

  genId() {
    return `${this.kind()}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }

  getId() { return this.data.id; }
  setId(id) { this.data.id = id; }

  outputNames() { return []; }

  toJSON() { return { ...this.data }; }
  fromJSON(json) { this.data = { ...json }; }

  renderHeader(index) {
    return `
      <div class="block-header" data-toggle="${index}">
        <div>
          <span class="block-kind-badge kind-${this.kind()}">${this.kindLabel()}</span>
          <strong class="block-id">${escapeHtml(this.data.id)}</strong>
        </div>
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-outline-secondary" data-act="duplicate" data-i="${index}" title="Duplicate"><i class="bi bi-copy"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-act="delete" data-i="${index}" title="Delete"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
  }

  renderBody(index) { return ''; }

  render(index) {
    return `
      <div class="block-card ${this.collapsed ? 'collapsed' : ''}" data-block-index="${index}">
        ${this.renderHeader(index)}
        <div class="block-body">${this.renderBody(index)}</div>
      </div>
    `;
  }
}

const TYPES = ['num', 'dec', 'str', 'bool', 'date', 'time', 'datetime'];

function typeOptions(selected) {
  return TYPES.map((t) => `<option value="${t}" ${t === selected ? 'selected' : ''}>${t}</option>`).join('');
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function filterSetByOuts(setMap, outNames) {
  const out = {};
  const allowed = new Set(outNames);
  for (const [k, v] of Object.entries(setMap || {})) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

function stripQuotes(s) {
  if (typeof s !== 'string' || s.length < 2) return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function coerceFallback(type, raw) {
  if (raw === '' || raw === null || raw === undefined) {
    if (type === 'num' || type === 'dec') return 0;
    if (type === 'bool') return false;
    return '';
  }
  if (type === 'bool') return raw === true || raw === 'true';
  if (typeof raw === 'string') return stripQuotes(raw);
  return raw;
}

function exprField(label, blockIdx, field, value, placeholder) {
  return `
    <div class="mb-2">
      <label class="form-label small mb-1">${label}</label>
      <input type="text"
             class="form-control form-control-sm expr-input"
             data-expr-input data-block-i="${blockIdx}" data-field="${field}"
             value="${escapeAttr(value || '')}"
             placeholder="${placeholder || ''}"
             autocomplete="off">
      <div class="expr-error" data-expr-error="${blockIdx}_${field}"></div>
    </div>
  `;
}

function outDeclRow(blockIdx, outIdx, name, type, fallback) {
  return `
    <div class="row-item" data-out-row="${outIdx}">
      <input type="text" class="form-control form-control-sm" style="flex:2"
             data-out-field="name" data-block-i="${blockIdx}" data-out-i="${outIdx}"
             value="${escapeAttr(name || '')}" placeholder="output name">
      <select class="form-select form-select-sm" style="width:90px"
              data-out-field="type" data-block-i="${blockIdx}" data-out-i="${outIdx}">
        ${typeOptions(type || 'num')}
      </select>
      <input type="text" class="form-control form-control-sm" style="flex:2"
             data-out-field="fallback" data-block-i="${blockIdx}" data-out-i="${outIdx}"
             value="${escapeAttr(fallback === undefined ? '' : String(fallback))}" placeholder="fallback">
      <button class="btn btn-sm btn-outline-danger" data-act="remove-out" data-block-i="${blockIdx}" data-out-i="${outIdx}"><i class="bi bi-x"></i></button>
    </div>
  `;
}

function setMapEditor(blockIdx, outs, setMap, label, ctxKey) {
  const items = outs.map((o, i) => {
    const v = setMap[o.name] === undefined ? '' : String(setMap[o.name]);
    return `
      <div class="d-flex gap-1 mb-1 align-items-center">
        <span class="badge bg-light text-dark" style="min-width:80px;text-align:left">${escapeHtml(o.name)}</span>
        <input type="text" class="form-control form-control-sm"
               data-set-field data-block-i="${blockIdx}" data-ctx="${ctxKey}" data-out="${escapeAttr(o.name)}"
               value="${escapeAttr(v)}" placeholder="value or expression">
      </div>
    `;
  }).join('');
  return `
    <div class="mt-2">
      <label class="form-label small mb-1">${label}</label>
      ${items || '<div class="text-muted small">declare outputs first</div>'}
    </div>
  `;
}
