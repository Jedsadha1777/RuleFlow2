class IfBlock extends BaseBlock {
  constructor() {
    super();
    this.data = {
      id: this.genId(),
      outs: [{ name: 'result', type: 'str', fallback: '', expose: true }],
      branches: [{ cond: '', set: {} }],
      elseSet: {},
    };
  }
  kind() { return 'if'; }
  kindLabel() { return 'If'; }

  outputNames() { return this.data.outs.map((o) => o.name).filter(Boolean); }
  exposedOutputNames() { return this.data.outs.filter((o) => o.expose !== false && o.name).map((o) => o.name); }
  applyExposeFromSet(set) {
    for (const o of this.data.outs) o.expose = set.has(o.name);
  }

  toJSON() {
    const outNames = this.data.outs.map((o) => o.name);
    return {
      id: this.data.id,
      outs: this.data.outs.map((o) => [o.name, o.type, coerceFallback(o.type, o.fallback)]),
      branches: this.data.branches.map((b) => [b.cond, filterSetByOuts(b.set, outNames)]),
      else: filterSetByOuts(this.data.elseSet, outNames),
    };
  }

  fromJSON(json) {
    this.data = {
      id: json.id,
      outs: (json.outs || []).map((o) => ({ name: o[0], type: o[1], fallback: o[2], expose: true })),
      branches: (json.branches || []).map(([cond, set]) => ({ cond, set: set || {} })),
      elseSet: (typeof json.else === 'object' && !Array.isArray(json.else)) ? json.else : {},
    };
  }

  renderBody(idx) {
    return `
      <div class="section-title">Outputs</div>
      <div data-outs-list="${idx}">
        ${this.data.outs.map((o, i) => outDeclRow(idx, i, o.name, o.type, o.fallback, o.expose)).join('')}
      </div>
      <button class="btn btn-sm btn-outline-secondary mb-3" data-act="add-out" data-block-i="${idx}">
        <i class="bi bi-plus"></i> Add Output
      </button>

      <div class="section-title">Branches (first match wins)</div>
      <div data-branches-list="${idx}">
        ${this.data.branches.map((b, i) => this.renderBranch(idx, i, b)).join('')}
      </div>
      <button class="btn btn-sm btn-outline-secondary mb-3" data-act="add-branch" data-block-i="${idx}">
        <i class="bi bi-plus"></i> Add Branch
      </button>

      <div class="section-title">Else (fallback)</div>
      ${setMapEditor(idx, this.data.outs, this.data.elseSet, '', 'else')}
    `;
  }

  renderBranch(idx, branchIdx, branch) {
    return `
      <div class="row-item flex-column align-items-stretch">
        <div class="d-flex gap-1 mb-2 align-items-center">
          <span class="badge bg-info" style="min-width:60px">${branchIdx === 0 ? 'IF' : 'ELIF'}</span>
          <input type="text"
                 class="form-control form-control-sm expr-input"
                 data-expr-input data-block-i="${idx}" data-field="branch_cond_${branchIdx}"
                 value="${escapeAttr(branch.cond)}"
                 placeholder="$x > 5 AND $y == 'a'"
                 autocomplete="off">
          <button class="btn btn-sm btn-outline-danger" data-act="remove-branch" data-block-i="${idx}" data-branch-i="${branchIdx}">
            <i class="bi bi-x"></i>
          </button>
        </div>
        <div class="expr-error" data-expr-error="${idx}_branch_cond_${branchIdx}"></div>
        ${setMapEditor(idx, this.data.outs, branch.set, 'set', `branch_${branchIdx}`)}
      </div>
    `;
  }
}
