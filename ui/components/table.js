class TableBlock extends BaseBlock {
  constructor() {
    super();
    this.data = {
      id: this.genId(),
      table: ['$tier', '$qty'],
      outs: [{ name: 'discount', type: 'num', fallback: 0 }],
      rows: [{ cells: ['gold', '*'], set: {} }],
      defaultSet: {},
    };
  }
  kind() { return 'table'; }
  kindLabel() { return 'Table'; }

  outputNames() { return this.data.outs.map((o) => o.name).filter(Boolean); }

  toJSON() {
    const outNames = this.data.outs.map((o) => o.name);
    return {
      id: this.data.id,
      table: this.data.table.slice(),
      outs: this.data.outs.map((o) => [o.name, o.type, coerceFallback(o.type, o.fallback)]),
      rows: this.data.rows.map((r) => [...r.cells.map((c) => this.parseCellInput(c)), filterSetByOuts(r.set, outNames)]),
      default: filterSetByOuts(this.data.defaultSet, outNames),
    };
  }

  parseCellInput(v) {
    if (v === '*' || v === '' || v === null || v === undefined) return v || '*';
    if (typeof v === 'string' && v.includes('..')) return v;
    if (typeof v === 'string' && (v.startsWith('>') || v.startsWith('<') || v.startsWith('!'))) return v;
    const stripped = stripQuotes(v);
    if (stripped !== v) return stripped;
    if (!Number.isNaN(Number(v))) return Number(v);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }

  fromJSON(json) {
    this.data = {
      id: json.id,
      table: json.table || [],
      outs: (json.outs || []).map((o) => ({ name: o[0], type: o[1], fallback: o[2] })),
      rows: (json.rows || []).map((row) => {
        const cells = row.slice(0, json.table.length).map((c) => String(c));
        const set = row[json.table.length] || {};
        return { cells, set };
      }),
      defaultSet: (typeof json.default === 'object' && !Array.isArray(json.default)) ? json.default : {},
    };
  }

  renderBody(idx) {
    return `
      <div class="section-title">Table dimensions ($vars)</div>
      <div data-dims-list="${idx}">
        ${this.data.table.map((d, i) => `
          <div class="row-item">
            <input type="text" class="form-control form-control-sm" style="flex:1"
                   data-dim-field data-block-i="${idx}" data-dim-i="${i}"
                   value="${escapeAttr(d)}" placeholder="$var">
            <button class="btn btn-sm btn-outline-danger" data-act="remove-dim" data-block-i="${idx}" data-dim-i="${i}"><i class="bi bi-x"></i></button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-sm btn-outline-secondary mb-3" data-act="add-dim" data-block-i="${idx}"><i class="bi bi-plus"></i> Add Dimension</button>

      <div class="section-title">Outputs</div>
      <div data-outs-list="${idx}">
        ${this.data.outs.map((o, i) => outDeclRow(idx, i, o.name, o.type, o.fallback)).join('')}
      </div>
      <button class="btn btn-sm btn-outline-secondary mb-3" data-act="add-out" data-block-i="${idx}">
        <i class="bi bi-plus"></i> Add Output
      </button>

      <div class="section-title">Rows (first match wins)</div>
      <div data-rows-list="${idx}">
        ${this.data.rows.map((r, i) => this.renderRow(idx, i, r)).join('')}
      </div>
      <button class="btn btn-sm btn-outline-secondary mb-3" data-act="add-row" data-block-i="${idx}">
        <i class="bi bi-plus"></i> Add Row
      </button>

      <div class="section-title">Default (fallback)</div>
      ${setMapEditor(idx, this.data.outs, this.data.defaultSet, '', 'default')}
    `;
  }

  renderRow(idx, rowIdx, row) {
    const cellInputs = row.cells.map((c, i) => `
      <input type="text" class="form-control form-control-sm" style="flex:1"
             data-cell-field data-block-i="${idx}" data-row-i="${rowIdx}" data-cell-i="${i}"
             value="${escapeAttr(c)}" placeholder="${escapeAttr(this.data.table[i] || '')}">
    `).join('');

    return `
      <div class="row-item flex-column align-items-stretch">
        <div class="d-flex gap-1 mb-2 align-items-center">
          <span class="badge bg-secondary" style="min-width:50px">ROW ${rowIdx}</span>
          ${cellInputs}
          <button class="btn btn-sm btn-outline-danger" data-act="remove-row" data-block-i="${idx}" data-row-i="${rowIdx}"><i class="bi bi-x"></i></button>
        </div>
        ${setMapEditor(idx, this.data.outs, row.set, 'set', `row_${rowIdx}`)}
        <div class="text-muted small mt-1">cell patterns: literal, <code>*</code>, <code>&gt;5</code>, <code>5..10</code></div>
      </div>
    `;
  }
}
