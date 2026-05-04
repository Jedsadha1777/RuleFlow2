$(document).ready(function () {
  const RF = window.RuleFlow2;
  const rf = new RF.RuleFlow();

  // Pre-load all themes so listFunctions() returns every sig — needed for
  // function→theme mapping (auto-detect) and complete autocomplete.
  ['date', 'str', 'money'].forEach((t) => rf.loadTheme(t));

  const DEFAULT_THEMES = ['math', 'logic', 'conv'];
  const FN_TO_THEME = (() => {
    const map = {};
    for (const sig of rf.listFunctions()) map[sig.name] = sig.theme;
    return map;
  })();

  const state = {
    name: 'my_module',
    inputs: [],
    blocks: [],
    formInputs: {},
  };
  const DEFAULT_VER = '1';

  function collectExprStrings(blocks, out = []) {
    for (const b of blocks) {
      if ('expr' in b) out.push(b.expr);
      if ('branches' in b) {
        for (const [cond, payload] of b.branches) {
          out.push(cond);
          collectPayloadStrings(payload, out);
        }
        collectPayloadStrings(b.else, out);
      }
      if ('cases' in b) {
        for (const [, payload] of b.cases) collectPayloadStrings(payload, out);
        collectPayloadStrings(b.default, out);
      }
      if ('table' in b) {
        for (const row of b.rows) collectPayloadStrings(row[b.table.length], out);
        collectPayloadStrings(b.default, out);
      }
    }
    return out;
  }

  function collectPayloadStrings(payload, out) {
    if (!payload) return;
    if (Array.isArray(payload)) {
      collectExprStrings(payload, out);
      return;
    }
    if (typeof payload === 'object') {
      for (const v of Object.values(payload)) {
        if (typeof v === 'string') out.push(v);
      }
    }
  }

  function detectThemes(blocks) {
    const themes = new Set();
    for (const expr of collectExprStrings(blocks)) {
      if (!expr) continue;
      const r = rf.tryParseExpr(expr);
      if (!r.ast) continue;
      for (const fn of RF.collectFuncCalls(r.ast)) {
        const theme = FN_TO_THEME[fn];
        if (theme && !DEFAULT_THEMES.includes(theme)) themes.add(theme);
      }
    }
    return Array.from(themes).sort();
  }

  function buildModule() {
    const blocks = state.blocks.map((b) => b.toJSON());
    const outputs = [];
    for (const b of state.blocks) {
      for (const n of b.exposedOutputNames()) outputs.push(n);
    }
    const uses = detectThemes(blocks);
    return {
      name: state.name,
      ver: DEFAULT_VER,
      ...(uses.length > 0 ? { uses } : {}),
      inputs: state.inputs.map((i) => {
        const obj = { name: i.name, type: i.type };
        if (i.nullable) obj.nullable = true;
        if (i.enum) obj.enum = i.enum;
        if (i.min !== undefined && i.min !== '') obj.min = isNaN(Number(i.min)) ? i.min : Number(i.min);
        if (i.max !== undefined && i.max !== '') obj.max = isNaN(Number(i.max)) ? i.max : Number(i.max);
        return obj;
      }),
      outputs,
      blocks,
    };
  }

  function refreshAll() {
    refreshInputs();
    refreshBlocks();
    refreshOutputs();
    refreshJson();
    refreshThemes();
    refreshForm();
    refreshValidation();
  }

  function refreshThemes() {
    const uses = detectThemes(state.blocks.map((b) => b.toJSON()));
    if (uses.length === 0) {
      $('#themeChecks').html('<span class="text-muted">none required (using default themes only)</span>');
    } else {
      $('#themeChecks').html(uses.map((t) => `<span class="badge bg-info">${t}</span>`).join(' '));
    }
  }

  function refreshInputs() {
    if (state.inputs.length === 0) {
      $('#inputsList').html('<div class="text-muted small">No inputs yet</div>');
      return;
    }
    $('#inputsList').html(state.inputs.map((i, idx) => `
      <div class="input-row" data-input-i="${idx}">
        <input type="text" class="form-control form-control-sm" style="flex:2"
               data-input-field="name" data-input-i="${idx}" value="${escapeAttr(i.name)}" placeholder="name">
        <select class="form-select form-select-sm" style="width:90px"
                data-input-field="type" data-input-i="${idx}">
          ${typeOptions(i.type)}
        </select>
        <input type="text" class="form-control form-control-sm" style="width:60px"
               data-input-field="min" data-input-i="${idx}" value="${escapeAttr(i.min || '')}" placeholder="min">
        <input type="text" class="form-control form-control-sm" style="width:60px"
               data-input-field="max" data-input-i="${idx}" value="${escapeAttr(i.max || '')}" placeholder="max">
        <input type="text" class="form-control form-control-sm" style="flex:2"
               data-input-field="enum" data-input-i="${idx}" value="${escapeAttr((i.enum || []).join(','))}" placeholder="enum (comma)">
        <label class="form-check-label small">
          <input type="checkbox" data-input-field="nullable" data-input-i="${idx}" ${i.nullable ? 'checked' : ''}> null
        </label>
        <button class="btn btn-sm btn-outline-danger" data-act="remove-input" data-input-i="${idx}"><i class="bi bi-x"></i></button>
      </div>
    `).join(''));
  }

  function refreshBlocks() {
    if (state.blocks.length === 0) {
      $('#blocksEmpty').show();
      $('#blocksList').empty();
      return;
    }
    $('#blocksEmpty').hide();
    $('#blocksList').html(state.blocks.map((b, i) => b.render(i)).join(''));
  }

  function refreshOutputs() {
    const outs = [];
    for (const b of state.blocks) for (const n of b.exposedOutputNames()) outs.push(n);
    $('#outputsList').html(outs.length === 0 ? 'No outputs' : outs.map((o) => `<code>${escapeHtml(o)}</code>`).join(', '));
  }

  function refreshJson() {
    const m = buildModule();
    $('#jsonOutput').text(JSON.stringify(m, null, 2));
  }

  function refreshForm() {
    if (state.inputs.length === 0) {
      $('#runForm').html('<div class="text-muted small">Add inputs to see form</div>');
      return;
    }
    const m = buildModule();
    $('#runForm').html(state.inputs.map((decl) => renderFormField(decl, m)).join(''));
    runLivePreview();
  }

  function renderFormField(decl, m) {
    const val = state.formInputs[decl.name];
    const valStr = val === undefined ? '' : String(val);
    const suggestions = (() => {
      try { return rf.fieldSuggestions(decl.name, m); } catch { return []; }
    })();
    let inputHtml;
    if (decl.type === 'bool') {
      inputHtml = `
        <select class="form-control form-control-sm" data-input-name="${escapeAttr(decl.name)}">
          <option value="">—</option>
          <option value="true" ${val === true ? 'selected' : ''}>true</option>
          <option value="false" ${val === false ? 'selected' : ''}>false</option>
        </select>
      `;
    } else if (suggestions.length > 0 && decl.type === 'str') {
      inputHtml = `
        <select class="form-control form-control-sm" data-input-name="${escapeAttr(decl.name)}">
          <option value="">—</option>
          ${suggestions.map((s) => `<option value="${escapeAttr(s)}" ${val === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      `;
    } else if (decl.type === 'date' || decl.type === 'time' || decl.type === 'datetime') {
      inputHtml = renderDateTimeParts(decl.name, decl.type, valStr);
    } else {
      inputHtml = `
        <input type="text" class="form-control form-control-sm"
               data-input-name="${escapeAttr(decl.name)}" value="${escapeAttr(valStr)}" placeholder="${decl.type}">
      `;
    }
    return `
      <div class="mb-2">
        <label class="form-label small mb-1">${escapeHtml(decl.name)} <span class="text-muted">(${decl.type})</span></label>
        ${inputHtml}
        <div class="field-error" data-field-error="${escapeAttr(decl.name)}"></div>
      </div>
    `;
  }

  function dateInput(name, val) {
    return `<input type="date" class="form-control form-control-sm" style="width:160px"
      data-dt-input="${escapeAttr(name)}" data-dt-part="date" value="${escapeAttr(val)}">`;
  }

  function timeDropdown(name, part, val, max) {
    let opts = '<option value="">--</option>';
    for (let i = 0; i <= max; i++) {
      const v = String(i).padStart(2, '0');
      opts += `<option value="${v}" ${v === val ? 'selected' : ''}>${v}</option>`;
    }
    return `<select class="form-select form-select-sm" style="width:75px"
      data-dt-input="${escapeAttr(name)}" data-dt-part="${part}">${opts}</select>`;
  }

  function renderDateTimeParts(name, type, val) {
    const p = partsFromIso(type, val);
    const time = `${timeDropdown(name, 'hour', p.hour, 23)}<span class="px-1">:</span>${timeDropdown(name, 'minute', p.minute, 59)}`;
    if (type === 'date') return `<div class="d-flex gap-1 align-items-center">${dateInput(name, p.date)}</div>`;
    if (type === 'time') return `<div class="d-flex gap-1 align-items-center">${time}</div>`;
    const tz = browserTzOffset();
    const tzLabel = tz === 'Z' ? 'UTC' : `local (${tz})`;
    return `<div class="d-flex gap-1 align-items-center flex-wrap">${dateInput(name, p.date)}<span class="text-muted px-1">·</span>${time}<small class="text-muted ms-1" title="local time + browser timezone offset, sent to engine in ISO-8601">${tzLabel}</small></div>`;
  }

  function refreshValidation() {
    const m = buildModule();
    let result;
    try { result = rf.validate(m); } catch (e) { result = { valid: false, errors: [{ code: 'INTERNAL', message: e.message }], warnings: [] }; }
    const errs = result.errors || [];
    const warns = result.warnings || [];
    if (errs.length === 0 && warns.length === 0) {
      $('#errorsPanel').html('<div class="text-success small">No errors</div>');
    } else {
      const errHtml = errs.map((e) => `
        <div class="error-item">
          <div class="error-code">${escapeHtml(e.code)}${e.loc?.block ? ` @ ${escapeHtml(e.loc.block)}` : ''}</div>
          <div>${escapeHtml(e.message)}</div>
        </div>
      `).join('');
      const warnHtml = warns.map((w) => `
        <div class="warning-item">
          <div class="error-code">${escapeHtml(w.code)}${w.loc?.block ? ` @ ${escapeHtml(w.loc.block)}` : ''}</div>
          <div>${escapeHtml(w.message)}</div>
        </div>
      `).join('');
      $('#errorsPanel').html(errHtml + warnHtml);
    }
    if (errs.length > 0) $('#errorCount').text(errs.length).show();
    else $('#errorCount').hide();

    // Mark blocks with errors
    $('.block-card').removeClass('has-error');
    for (const e of errs) {
      if (e.loc?.block) {
        const idx = state.blocks.findIndex((b) => b.getId() === e.loc.block);
        if (idx >= 0) $(`.block-card[data-block-index="${idx}"]`).addClass('has-error');
      }
    }
  }

  function runLivePreview() {
    const m = buildModule();
    let outValid = true;
    for (const decl of state.inputs) {
      const val = state.formInputs[decl.name];
      const fr = rf.validateField(decl.name, val, m);
      if (!fr.valid) {
        $(`[data-field-error="${decl.name}"]`).text(fr.errors.join(', '));
        $(`[data-input-name="${decl.name}"]`).addClass('is-invalid');
        outValid = false;
      } else {
        $(`[data-field-error="${decl.name}"]`).text('');
        $(`[data-input-name="${decl.name}"]`).removeClass('is-invalid');
      }
    }

    let status;
    try { status = rf.validationStatus(state.formInputs, m); } catch { status = { score: 0 }; }
    $('#formStatus').text((status.score || 0) + '%');

    let preview;
    try { preview = rf.livePreview(state.formInputs, m); } catch (e) { preview = { error: e.message, ready: false, missing_required: [] }; }
    if (preview.outputs) {
      $('#runOutput').text(JSON.stringify(preview.outputs, null, 2));
    } else if (preview.error) {
      $('#runOutput').text('Error: ' + preview.error);
    } else if (preview.missing_required && preview.missing_required.length > 0) {
      $('#runOutput').text('Missing: ' + preview.missing_required.join(', '));
    } else {
      $('#runOutput').text('—');
    }
  }

  function existingOutputNames() {
    const names = new Set();
    for (const b of state.blocks) for (const n of b.outputNames()) names.add(n);
    return names;
  }
  function uniqueOutputName(base) {
    const taken = existingOutputNames();
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}${i}`)) i++;
    return `${base}${i}`;
  }
  function setBlockFirstOutputName(block, name) {
    if (block instanceof FormulaBlock) block.data.out_name = name;
    else if (block.data.outs && block.data.outs.length > 0) block.data.outs[0].name = name;
  }

  // ===== Add block =====
  $(document).on('click', '[data-add]', function (e) {
    e.preventDefault();
    const kind = $(this).data('add');
    let block;
    let baseName;
    if (kind === 'formula') { block = new FormulaBlock(); baseName = 'value'; }
    else if (kind === 'if') { block = new IfBlock(); baseName = 'result'; }
    else if (kind === 'switch') { block = new SwitchBlock(); baseName = 'category'; }
    else if (kind === 'table') { block = new TableBlock(); baseName = 'rate'; }
    else return;
    setBlockFirstOutputName(block, uniqueOutputName(baseName));
    state.blocks.push(block);
    refreshAll();
  });

  // ===== Block edits =====
  $(document).on('input change', '[data-field]', function () {
    const $el = $(this);
    const idx = parseInt($el.attr('data-block-i'));
    const field = $el.attr('data-field');
    if (isNaN(idx)) return;
    state.blocks[idx].data[field] = $el.val();
    if (field === 'id' || field === 'out_name') refreshOutputs();
    refreshJson();
    refreshValidation();
    if (field === 'id') $(`.block-card[data-block-index="${idx}"] .block-id`).text($el.val());
  });

  // Block header collapse
  $(document).on('click', '[data-toggle]', function (e) {
    if ($(e.target).closest('button').length > 0) return;
    const idx = parseInt($(this).attr('data-toggle'));
    state.blocks[idx].collapsed = !state.blocks[idx].collapsed;
    $(`.block-card[data-block-index="${idx}"]`).toggleClass('collapsed');
  });

  // Outs add/remove
  $(document).on('click', '[data-act="add-out"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    state.blocks[idx].data.outs.push({ name: '', type: 'num', fallback: '' });
    refreshBlocks();
    refreshOutputs();
    refreshJson();
    refreshValidation();
  });
  $(document).on('click', '[data-act="remove-out"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    const outIdx = parseInt($(this).attr('data-out-i'));
    state.blocks[idx].data.outs.splice(outIdx, 1);
    refreshBlocks();
    refreshOutputs();
    refreshJson();
    refreshValidation();
  });
  function renameOutputKeys(block, oldName, newName) {
    const ren = (s) => {
      if (s && oldName in s) {
        s[newName] = s[oldName];
        delete s[oldName];
      }
    };
    if (block.data.branches) {
      for (const b of block.data.branches) ren(b.set);
      ren(block.data.elseSet);
    }
    if (block.data.cases) {
      for (const c of block.data.cases) ren(c.set);
      ren(block.data.defaultSet);
    }
    if (block.data.rows) {
      for (const r of block.data.rows) ren(r.set);
      ren(block.data.defaultSet);
    }
  }

  $(document).on('input', '[data-out-field]', function () {
    const $el = $(this);
    const idx = parseInt($el.attr('data-block-i'));
    const outIdx = parseInt($el.attr('data-out-i'));
    const field = $el.attr('data-out-field');
    const newVal = $el.val();
    const block = state.blocks[idx];
    if (field === 'name') {
      const oldName = block.data.outs[outIdx].name;
      if (oldName && oldName !== newVal) renameOutputKeys(block, oldName, newVal);
    }
    block.data.outs[outIdx][field] = newVal;
    if (field === 'name') {
      refreshOutputs();
      refreshForm();
    }
    refreshJson();
    refreshValidation();
    runLivePreview();
  });

  $(document).on('change', '[data-out-field]', function () {
    const $el = $(this);
    const field = $el.attr('data-out-field');
    if (field === 'name' || field === 'type') {
      // full re-render on blur to update labels + select map keys + recompute preview
      refreshAll();
    }
  });

  // Branches add/remove
  $(document).on('click', '[data-act="add-branch"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    state.blocks[idx].data.branches.push({ cond: '', set: {} });
    refreshBlocks();
    refreshJson();
    refreshValidation();
  });
  $(document).on('click', '[data-act="remove-branch"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    const bi = parseInt($(this).attr('data-branch-i'));
    state.blocks[idx].data.branches.splice(bi, 1);
    refreshBlocks();
    refreshJson();
    refreshValidation();
  });

  // Cases add/remove
  $(document).on('click', '[data-act="add-case"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    state.blocks[idx].data.cases.push({ value: '', set: {} });
    refreshBlocks();
    refreshJson();
    refreshValidation();
  });
  $(document).on('click', '[data-act="remove-case"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    const ci = parseInt($(this).attr('data-case-i'));
    state.blocks[idx].data.cases.splice(ci, 1);
    refreshBlocks();
    refreshJson();
    refreshValidation();
  });
  $(document).on('input change', '[data-case-field]', function () {
    const $el = $(this);
    const idx = parseInt($el.attr('data-block-i'));
    const ci = parseInt($el.attr('data-case-i'));
    const field = $el.attr('data-case-field');
    state.blocks[idx].data.cases[ci][field] = $el.val();
    refreshJson();
    refreshValidation();
  });

  // Table dims add/remove
  $(document).on('click', '[data-act="add-dim"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    state.blocks[idx].data.table.push('');
    state.blocks[idx].data.rows.forEach((r) => r.cells.push('*'));
    refreshBlocks();
    refreshJson();
    refreshValidation();
  });
  $(document).on('click', '[data-act="remove-dim"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    const di = parseInt($(this).attr('data-dim-i'));
    state.blocks[idx].data.table.splice(di, 1);
    state.blocks[idx].data.rows.forEach((r) => r.cells.splice(di, 1));
    refreshBlocks();
    refreshJson();
    refreshValidation();
  });
  $(document).on('input change', '[data-dim-field]', function () {
    const $el = $(this);
    const idx = parseInt($el.attr('data-block-i'));
    const di = parseInt($el.attr('data-dim-i'));
    state.blocks[idx].data.table[di] = $el.val();
    refreshJson();
    refreshValidation();
  });

  // Table rows add/remove
  $(document).on('click', '[data-act="add-row"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    const dimCount = state.blocks[idx].data.table.length;
    state.blocks[idx].data.rows.push({ cells: new Array(dimCount).fill('*'), set: {} });
    refreshBlocks();
    refreshJson();
    refreshValidation();
  });
  $(document).on('click', '[data-act="remove-row"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    const ri = parseInt($(this).attr('data-row-i'));
    state.blocks[idx].data.rows.splice(ri, 1);
    refreshBlocks();
    refreshJson();
    refreshValidation();
  });
  $(document).on('input change', '[data-cell-field]', function () {
    const $el = $(this);
    const idx = parseInt($el.attr('data-block-i'));
    const ri = parseInt($el.attr('data-row-i'));
    const ci = parseInt($el.attr('data-cell-i'));
    state.blocks[idx].data.rows[ri].cells[ci] = $el.val();
    refreshJson();
    refreshValidation();
  });

  // Branch cond (also expression input)
  $(document).on('input change', '.expr-input[data-field^="branch_cond_"]', function () {
    const $el = $(this);
    const idx = parseInt($el.attr('data-block-i'));
    const field = $el.attr('data-field');
    const branchIdx = parseInt(field.replace('branch_cond_', ''));
    state.blocks[idx].data.branches[branchIdx].cond = $el.val();
    refreshJson();
    refreshValidation();
    inlineExprError(idx, field, $el.val());
  });

  // Set map field updates
  $(document).on('input change', '[data-set-field]', function () {
    const $el = $(this);
    const idx = parseInt($el.attr('data-block-i'));
    const ctx = $el.attr('data-ctx');
    const out = $el.attr('data-out');
    const val = $el.val();
    const block = state.blocks[idx];
    let target;
    if (ctx === 'else') target = block.data.elseSet;
    else if (ctx === 'default') target = block.data.defaultSet;
    else if (ctx.startsWith('branch_')) target = block.data.branches[parseInt(ctx.split('_')[1])].set;
    else if (ctx.startsWith('case_')) target = block.data.cases[parseInt(ctx.split('_')[1])].set;
    else if (ctx.startsWith('row_')) target = block.data.rows[parseInt(ctx.split('_')[1])].set;
    else return;
    if (val === '' || val === null) delete target[out];
    else target[out] = parseSetValue(val);
    refreshJson();
    refreshValidation();
  });

  function parseSetValue(s) {
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (!Number.isNaN(Number(s)) && s !== '') return Number(s);
    return s;
  }

  // Block " and ' on literal-value fields (fallback, set value, case value, table cell)
  const NO_QUOTE_SELECTOR = '[data-out-field="fallback"], [data-set-field], [data-case-field="value"], [data-cell-field]';
  $(document).on('keypress', NO_QUOTE_SELECTOR, function (e) {
    if (e.key === '"' || e.key === "'") {
      e.preventDefault();
    }
  });
  $(document).on('input', NO_QUOTE_SELECTOR, function () {
    const v = $(this).val();
    if (v.includes('"') || v.includes("'")) {
      const pos = this.selectionStart;
      const cleaned = v.split('"').join('').split("'").join('');
      $(this).val(cleaned);
      this.setSelectionRange(Math.max(0, pos - 1), Math.max(0, pos - 1));
    }
  });

  // Block actions
  $(document).on('click', '[data-act="duplicate"]', function (e) {
    e.stopPropagation();
    const idx = parseInt($(this).attr('data-i'));
    const json = state.blocks[idx].toJSON();
    json.id = json.id + '_copy';
    const kind = blockKindOf(json);
    const cls = { formula: FormulaBlock, if: IfBlock, switch: SwitchBlock, table: TableBlock }[kind];
    const newBlock = new cls();
    newBlock.fromJSON(json);
    state.blocks.splice(idx + 1, 0, newBlock);
    refreshAll();
  });
  $(document).on('click', '[data-act="delete"]', function (e) {
    e.stopPropagation();
    const idx = parseInt($(this).attr('data-i'));
    state.blocks.splice(idx, 1);
    refreshAll();
  });

  function blockKindOf(json) {
    if ('expr' in json) return 'formula';
    if ('branches' in json) return 'if';
    if ('cases' in json) return 'switch';
    if ('table' in json) return 'table';
    return 'formula';
  }

  // ===== Module meta =====
  $('#modName').on('input', function () { state.name = $(this).val(); refreshJson(); refreshValidation(); });

  // ===== Inputs =====
  $('#addInputBtn').on('click', function () {
    state.inputs.push({ name: 'input_' + (state.inputs.length + 1), type: 'num' });
    refreshInputs(); refreshJson(); refreshForm(); refreshValidation();
  });
  $(document).on('input change', '[data-input-field]', function () {
    const $el = $(this);
    const idx = parseInt($el.attr('data-input-i'));
    const field = $el.attr('data-input-field');
    if (field === 'nullable') state.inputs[idx].nullable = $el.is(':checked');
    else if (field === 'enum') state.inputs[idx].enum = $el.val().split(',').map((s) => s.trim()).filter(Boolean);
    else state.inputs[idx][field] = $el.val();
    if (field === 'name' || field === 'type') refreshForm();
    refreshJson(); refreshValidation(); runLivePreview();
  });
  $(document).on('click', '[data-act="remove-input"]', function () {
    const idx = parseInt($(this).attr('data-input-i'));
    state.inputs.splice(idx, 1);
    refreshInputs(); refreshJson(); refreshForm(); refreshValidation();
  });

  // ===== Form input changes =====
  $(document).on('input change', '[data-input-name]', function () {
    const $el = $(this);
    const name = $el.attr('data-input-name');
    const decl = state.inputs.find((i) => i.name === name);
    if (!decl) return;
    let val = $el.val();
    if (val === '') {
      delete state.formInputs[name];
    } else if (decl.type === 'bool') {
      state.formInputs[name] = val === 'true';
    } else if (decl.type === 'num') {
      const n = Number(val);
      state.formInputs[name] = Number.isFinite(n) ? n : val;
    } else {
      state.formInputs[name] = val;
    }
    runLivePreview();
  });

  // ===== Toggle output expose (eye / eye-slash) =====
  $(document).on('click', '[data-act="toggle-expose"]', function () {
    const idx = parseInt($(this).attr('data-block-i'));
    const outIdx = parseInt($(this).attr('data-out-i'));
    const block = state.blocks[idx];
    if (block instanceof FormulaBlock) {
      block.data.expose_out = block.data.expose_out === false;
    } else if (block.data.outs && block.data.outs[outIdx]) {
      block.data.outs[outIdx].expose = block.data.outs[outIdx].expose === false;
    }
    refreshBlocks();
    refreshOutputs();
    refreshJson();
    refreshValidation();
    runLivePreview();
  });

  // ===== Date/Time/DateTime part-based inputs =====
  $(document).on('input change', '[data-dt-input]', function () {
    const $el = $(this);
    const name = $el.attr('data-dt-input');
    const decl = state.inputs.find((i) => i.name === name);
    if (!decl) return;
    const parts = { date: '', hour: '', minute: '', second: '' };
    $(`[data-dt-input="${name}"]`).each(function () {
      parts[$(this).attr('data-dt-part')] = $(this).val();
    });
    if (decl.type === 'datetime') parts.tz = browserTzOffset();
    const built = isoFromParts(decl.type, parts);
    if (built === '') delete state.formInputs[name];
    else state.formInputs[name] = built;
    runLivePreview();
  });

  // ===== Expression autocomplete =====
  let popupEl = null;
  function hidePopup() { if (popupEl) { popupEl.remove(); popupEl = null; } }
  function showPopup(target, completions) {
    hidePopup();
    if (!completions.suggestions || completions.suggestions.length === 0) return;
    const rect = target.getBoundingClientRect();
    popupEl = document.createElement('div');
    popupEl.className = 'completion-popup';
    popupEl.style.left = rect.left + 'px';
    popupEl.style.top = (rect.bottom + 2) + 'px';
    popupEl.innerHTML = completions.suggestions.map((s, i) => `
      <div class="completion-item ${i === 0 ? 'active' : ''}" data-completion="${escapeAttr(s)}" data-prefix="${escapeAttr(completions.prefix)}" data-kind="${completions.kind}">
        ${completions.kind === 'var' ? '$' : ''}${escapeHtml(s)}<span class="completion-kind">${completions.kind}</span>
      </div>
    `).join('');
    document.body.appendChild(popupEl);
  }
  function applyCompletion(input, item) {
    const text = input.value;
    const pos = input.selectionStart;
    const sug = item.dataset.completion;
    const prefix = item.dataset.prefix;
    const kind = item.dataset.kind;
    const inserted = (kind === 'var' ? '' : '') + sug.slice(prefix.length) + (kind === 'function' ? '(' : '');
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    input.value = before + inserted + after;
    const newPos = pos + inserted.length;
    input.setSelectionRange(newPos, newPos);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    hidePopup();
  }

  $(document).on('input keyup focus', '.expr-input', function (e) {
    const target = e.target;
    const text = target.value;
    const pos = target.selectionStart;
    const blockIdx = parseInt(target.dataset.blockI);
    if (isNaN(blockIdx)) { hidePopup(); return; }
    const m = buildModule();
    const blockId = state.blocks[blockIdx].getId();
    let scope;
    try { scope = rf.scopeAt(m, blockId); } catch { hidePopup(); return; }
    const completion = rf.completionAt(text, pos, scope);
    showPopup(target, completion);

    // Inline parse error
    inlineExprError(blockIdx, target.dataset.field, text);
  });

  $(document).on('keydown', '.expr-input', function (e) {
    if (!popupEl) return;
    const items = Array.from(popupEl.querySelectorAll('.completion-item'));
    let activeIdx = items.findIndex((i) => i.classList.contains('active'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[activeIdx]?.classList.remove('active');
      activeIdx = (activeIdx + 1) % items.length;
      items[activeIdx].classList.add('active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[activeIdx]?.classList.remove('active');
      activeIdx = (activeIdx - 1 + items.length) % items.length;
      items[activeIdx].classList.add('active');
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      const active = items[activeIdx >= 0 ? activeIdx : 0];
      if (active) applyCompletion(e.target, active);
    } else if (e.key === 'Escape') {
      hidePopup();
    }
  });

  $(document).on('click', '.completion-item', function () {
    const input = document.activeElement;
    if (input && input.classList.contains('expr-input')) applyCompletion(input, this);
  });

  $(document).on('click', function (e) {
    if (!$(e.target).closest('.expr-input, .completion-popup').length) hidePopup();
  });

  function inlineExprError(blockIdx, field, text) {
    const $err = $(`[data-expr-error="${blockIdx}_${field}"]`);
    if (!text || text.trim() === '') { $err.text(''); return; }
    const r = rf.tryParseExpr(text);
    if (r.error) {
      $err.text(`${r.error.code}: ${r.error.message}`);
      return;
    }
    try {
      const m = buildModule();
      const blockId = state.blocks[blockIdx].getId();
      const scope = rf.scopeAt(m, blockId);
      const undef = [];
      for (const v of RF.collectVarRefs(r.ast)) {
        if (!scope.vars.includes(v)) undef.push('$' + v);
      }
      if (undef.length > 0) { $err.text(`undefined: ${undef.join(', ')}`); return; }
      const unknownFn = [];
      for (const f of RF.collectFuncCalls(r.ast)) {
        if (!scope.functions.includes(f)) unknownFn.push(f);
      }
      if (unknownFn.length > 0) { $err.text(`unknown function: ${unknownFn.join(', ')}`); return; }
    } catch { /* skip scope check on error */ }
    $err.text('');
  }

  // ===== JSON copy =====
  $('#copyJsonBtn').on('click', function () {
    navigator.clipboard.writeText($('#jsonOutput').text());
    const $btn = $(this);
    $btn.html('<i class="bi bi-check"></i> Copied');
    setTimeout(() => $btn.html('<i class="bi bi-clipboard"></i> Copy'), 1500);
  });

  // ===== Templates =====
  function loadTemplateList() {
    try {
      const list = rf.getTemplates();
      $('#templateSelect').html(
        '<option value="">— Load template —</option>' +
        list.map((t) => `<option value="${escapeAttr(t.name)}">${escapeHtml(t.name)} (${t.category})</option>`).join('')
      );
    } catch (e) { /* engine not ready */ }
  }
  $('#templateSelect').on('change', function () {
    const name = $(this).val();
    if (!name) return;
    const tpl = rf.getTemplate(name);
    if (!tpl) return;
    loadModule(tpl.config);
    if (tpl.examples && tpl.examples[0]) state.formInputs = { ...tpl.examples[0].inputs };
    refreshAll();
  });

  // ===== Import / Export / New =====
  $('#exportBtn').on('click', function () {
    const json = JSON.stringify(buildModule(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.name || 'module'}.json`;
    a.click();
  });
  $('#importFile').on('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        loadModule(json);
        refreshAll();
      } catch (err) { alert('Invalid JSON: ' + err.message); }
    };
    reader.readAsText(file);
  });
  $('#newBtn').on('click', function () {
    if (!confirm('Discard current module?')) return;
    state.name = 'my_module';
    state.inputs = []; state.blocks = []; state.formInputs = {};
    refreshAll();
  });

  function loadModule(m) {
    state.name = m.name || 'imported';
    state.inputs = (m.inputs || []).map((i) => ({ ...i }));
    state.formInputs = {};
    state.blocks = (m.blocks || []).map((blk) => {
      const kind = blockKindOf(blk);
      const cls = { formula: FormulaBlock, if: IfBlock, switch: SwitchBlock, table: TableBlock }[kind];
      const inst = new cls();
      inst.fromJSON(blk);
      return inst;
    });
    if (Array.isArray(m.outputs)) {
      const exposedSet = new Set(m.outputs);
      for (const b of state.blocks) b.applyExposeFromSet(exposedSet);
    }
    $('#modName').val(state.name);
  }

  // ===== Bottom tabs =====
  $('#runDebugBtn').on('click', function () {
    const m = buildModule();
    try {
      const r = rf.debug(m, state.formInputs);
      $('#debugPanel').text(JSON.stringify(r, null, 2));
    } catch (e) {
      $('#debugPanel').text('Error: ' + e.message);
    }
  });

  function refreshCodegen() {
    try {
      const m = buildModule();
      const code = rf.generateCode(m);
      $('#codegenPanel').text(code);
    } catch (e) { $('#codegenPanel').text('Error: ' + e.message); }
  }
  function refreshSchema() {
    try {
      const m = buildModule();
      const fmt = $('#schemaFormat').val();
      $('#schemaPanel').text(rf.generateSchema(m, fmt));
    } catch (e) { $('#schemaPanel').text('Error: ' + e.message); }
  }
  function refreshDocs() {
    try {
      const m = buildModule();
      $('#docsPanel').text(rf.generateDocs(m));
    } catch (e) { $('#docsPanel').text('Error: ' + e.message); }
  }
  $('#schemaFormat').on('change', refreshSchema);
  $('button[data-bs-target="#tabCodegen"]').on('click', refreshCodegen);
  $('button[data-bs-target="#tabSchema"]').on('click', refreshSchema);
  $('button[data-bs-target="#tabDocs"]').on('click', refreshDocs);

  // ===== Resizers =====
  $('.resizer').on('mousedown', function (e) {
    const which = $(this).data('resize');
    const $left = which === 'editor' ? $('.pane-editor') : $('.pane-json');
    const startX = e.pageX;
    const startW = $left.width();
    function move(ev) { $left.css('flex', '0 0 ' + (startW + ev.pageX - startX) + 'px'); }
    function up() { $(document).off('mousemove', move).off('mouseup', up); }
    $(document).on('mousemove', move).on('mouseup', up);
  });

  // ===== Init =====
  loadTemplateList();
  refreshAll();
});
