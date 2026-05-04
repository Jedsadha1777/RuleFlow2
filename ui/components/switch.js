class SwitchBlock extends BaseBlock {
  constructor() {
    super();
    this.data = {
      id: this.genId(),
      on: '$tier',
      outs: [{ name: 'discount', type: 'num', fallback: 0 }],
      cases: [{ value: 'gold', set: {} }],
      defaultSet: {},
    };
  }
  kind() { return 'switch'; }
  kindLabel() { return 'Switch'; }

  outputNames() { return this.data.outs.map((o) => o.name).filter(Boolean); }

  toJSON() {
    const outNames = this.data.outs.map((o) => o.name);
    return {
      id: this.data.id,
      on: this.data.on,
      outs: this.data.outs.map((o) => [o.name, o.type, coerceFallback(o.type, o.fallback)]),
      cases: this.data.cases.map((c) => [this.parseCaseVal(c.value), filterSetByOuts(c.set, outNames)]),
      default: filterSetByOuts(this.data.defaultSet, outNames),
    };
  }

  parseCaseVal(v) {
    if (v === '' || v === null || v === undefined) return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    const stripped = stripQuotes(v);
    if (stripped !== v) return stripped;
    if (!Number.isNaN(Number(v)) && v !== '') return Number(v);
    return v;
  }

  fromJSON(json) {
    this.data = {
      id: json.id,
      on: json.on || '',
      outs: (json.outs || []).map((o) => ({ name: o[0], type: o[1], fallback: o[2] })),
      cases: (json.cases || []).map(([value, set]) => ({ value: String(value), set: set || {} })),
      defaultSet: (typeof json.default === 'object' && !Array.isArray(json.default)) ? json.default : {},
    };
  }

  renderBody(idx) {
    return `
      <div class="mb-2">
        <label class="form-label small mb-1">Switch on ($var)</label>
        <input type="text" class="form-control form-control-sm"
               data-field="on" data-block-i="${idx}" value="${escapeAttr(this.data.on)}"
               placeholder="$tier">
      </div>

      <div class="section-title">Outputs</div>
      <div data-outs-list="${idx}">
        ${this.data.outs.map((o, i) => outDeclRow(idx, i, o.name, o.type, o.fallback)).join('')}
      </div>
      <button class="btn btn-sm btn-outline-secondary mb-3" data-act="add-out" data-block-i="${idx}">
        <i class="bi bi-plus"></i> Add Output
      </button>

      <div class="section-title">Cases</div>
      <div data-cases-list="${idx}">
        ${this.data.cases.map((c, i) => this.renderCase(idx, i, c)).join('')}
      </div>
      <button class="btn btn-sm btn-outline-secondary mb-3" data-act="add-case" data-block-i="${idx}">
        <i class="bi bi-plus"></i> Add Case
      </button>

      <div class="section-title">Default (fallback)</div>
      ${setMapEditor(idx, this.data.outs, this.data.defaultSet, '', 'default')}
    `;
  }

  renderCase(idx, caseIdx, c) {
    return `
      <div class="row-item flex-column align-items-stretch">
        <div class="d-flex gap-1 mb-2 align-items-center">
          <span class="badge bg-warning text-dark" style="min-width:60px">CASE</span>
          <input type="text" class="form-control form-control-sm"
                 data-case-field="value" data-block-i="${idx}" data-case-i="${caseIdx}"
                 value="${escapeAttr(c.value)}"
                 placeholder="literal value">
          <button class="btn btn-sm btn-outline-danger" data-act="remove-case" data-block-i="${idx}" data-case-i="${caseIdx}">
            <i class="bi bi-x"></i>
          </button>
        </div>
        ${setMapEditor(idx, this.data.outs, c.set, 'set', `case_${caseIdx}`)}
      </div>
    `;
  }
}
