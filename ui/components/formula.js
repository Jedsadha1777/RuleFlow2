class FormulaBlock extends BaseBlock {
  constructor() {
    super();
    this.data = { id: this.genId(), out_name: 'result', out_type: 'num', expr: '', expose_out: true };
  }
  kind() { return 'formula'; }
  kindLabel() { return 'Formula'; }

  outputNames() { return [this.data.out_name].filter(Boolean); }
  exposedOutputNames() { return this.data.expose_out !== false && this.data.out_name ? [this.data.out_name] : []; }
  applyExposeFromSet(set) { this.data.expose_out = set.has(this.data.out_name); }

  toJSON() {
    return { id: this.data.id, out: [this.data.out_name, this.data.out_type], expr: this.data.expr };
  }

  fromJSON(json) {
    this.data = {
      id: json.id,
      out_name: json.out ? json.out[0] : '',
      out_type: json.out ? json.out[1] : 'num',
      expr: json.expr || '',
      expose_out: true,
    };
  }

  renderBody(idx) {
    return `
      <div class="row g-2 mb-2 align-items-end">
        <div class="col-8">
          <label class="form-label small mb-1">Output name</label>
          <input type="text" class="form-control form-control-sm"
                 data-field="out_name" data-block-i="${idx}" value="${escapeAttr(this.data.out_name)}">
        </div>
        <div class="col-3">
          <label class="form-label small mb-1">Type</label>
          <select class="form-select form-select-sm" data-field="out_type" data-block-i="${idx}">
            ${typeOptions(this.data.out_type)}
          </select>
        </div>
        <div class="col-1">
          ${exposeToggle(idx, 0, this.data.expose_out)}
        </div>
      </div>
      ${exprField('Expression', idx, 'expr', this.data.expr, '$x * 2 + 1')}
    `;
  }
}
