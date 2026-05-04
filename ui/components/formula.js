class FormulaBlock extends BaseBlock {
  constructor() {
    super();
    this.data = { id: this.genId(), out_name: 'result', out_type: 'num', expr: '' };
  }
  kind() { return 'formula'; }
  kindLabel() { return 'Formula'; }

  outputNames() { return [this.data.out_name].filter(Boolean); }

  toJSON() {
    return { id: this.data.id, out: [this.data.out_name, this.data.out_type], expr: this.data.expr };
  }

  fromJSON(json) {
    this.data = {
      id: json.id,
      out_name: json.out ? json.out[0] : '',
      out_type: json.out ? json.out[1] : 'num',
      expr: json.expr || '',
    };
  }

  renderBody(idx) {
    return `
      <div class="row g-2 mb-2">
        <div class="col-5">
          <label class="form-label small mb-1">Block ID</label>
          <input type="text" class="form-control form-control-sm"
                 data-field="id" data-block-i="${idx}" value="${escapeAttr(this.data.id)}">
        </div>
        <div class="col-5">
          <label class="form-label small mb-1">Output name</label>
          <input type="text" class="form-control form-control-sm"
                 data-field="out_name" data-block-i="${idx}" value="${escapeAttr(this.data.out_name)}">
        </div>
        <div class="col-2">
          <label class="form-label small mb-1">Type</label>
          <select class="form-select form-select-sm" data-field="out_type" data-block-i="${idx}">
            ${typeOptions(this.data.out_type)}
          </select>
        </div>
      </div>
      ${exprField('Expression', idx, 'expr', this.data.expr, '$x * 2 + 1')}
    `;
  }
}
