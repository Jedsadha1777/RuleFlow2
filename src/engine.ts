import type { FnImpl, Inputs, Manifest, Module, Outputs, PreparedModule, ValidationResult, WarningObj } from './types.js';
import { ConfigError } from './errors.js';
import { FunctionRegistry, loadDefaults, type ThemeName } from './functions.js';
import { debugModule, evalModule, prepareModule, type DebugResult } from './evaluator.js';
import {
  batchValidateFields,
  checkCoverage,
  fieldSuggestions,
  livePreview,
  validateField,
  validateModule,
  validatePartial,
  validationStatus,
  type FieldResult,
  type FormStatus,
  type PartialResult,
  type PreviewResult,
} from './validator.js';
import { generateCode, generateDocs, generateSchema, type CodeGenOpts, type SchemaFormat } from './generators.js';
import { TemplateRegistry, type Template, type TemplateMeta } from './templates.js';

export interface BatchResult {
  index: number;
  success: boolean;
  result?: Outputs;
  error?: string;
}

export interface TestResult {
  valid: boolean;
  errors: ValidationResult['errors'];
  warnings: WarningObj[];
  test_result?: Outputs;
  perf?: { time_ms: number };
}

export class RuleFlow {
  private reg = new FunctionRegistry();
  private templates = new TemplateRegistry();
  private prepCache = new WeakMap<Module, PreparedModule>();

  constructor() {
    loadDefaults(this.reg);
  }

  loadTheme(name: ThemeName): void {
    this.reg.loadTheme(name);
  }

  loadedThemes(): string[] {
    return this.reg.loadedThemes();
  }

  addPack(manifest: Manifest, impls: Record<string, FnImpl>): void {
    this.reg.addPack(manifest, impls);
  }

  listFunctions() {
    return this.reg.list();
  }

  validate(module: Module): ValidationResult {
    if (module.uses) {
      for (const t of module.uses) {
        if (!this.reg.isThemeLoaded(t)) {
          try {
            this.loadTheme(t as ThemeName);
          } catch {
            // surfaced via S7_UNKNOWN_FUNC during expression validation
          }
        }
      }
    }
    const result = validateModule(module, this.reg);
    const coverage = checkCoverage(module);
    result.warnings.push(...coverage);
    return result;
  }

  prepare(module: Module): PreparedModule {
    const cached = this.prepCache.get(module);
    if (cached) return cached;

    const result = this.validate(module);
    if (!result.valid) {
      const first = result.errors[0];
      throw new ConfigError(first.code, first.message, { loc: first.loc });
    }

    const prepared = prepareModule(module);
    this.prepCache.set(module, prepared);
    return prepared;
  }

  evaluate(module: Module, inputs: Inputs): Outputs {
    return evalModule(this.prepare(module), inputs, this.reg);
  }

  evaluatePrepared(prepared: PreparedModule, inputs: Inputs): Outputs {
    return evalModule(prepared, inputs, this.reg);
  }

  evaluateBatch(module: Module, inputSets: Inputs[]): BatchResult[] {
    const prepared = this.prepare(module);
    return inputSets.map((inputs, index) => {
      try {
        return { index, success: true, result: evalModule(prepared, inputs, this.reg) };
      } catch (e) {
        return { index, success: false, error: e instanceof Error ? e.message : String(e) };
      }
    });
  }

  test(module: Module, inputs?: Inputs): TestResult {
    const v = this.validate(module);
    if (!v.valid || !inputs) {
      return { valid: v.valid, errors: v.errors, warnings: v.warnings };
    }
    const start = Date.now();
    try {
      const result = evalModule(this.prepare(module), inputs, this.reg);
      return {
        valid: true,
        errors: [],
        warnings: v.warnings,
        test_result: result,
        perf: { time_ms: Date.now() - start },
      };
    } catch (e) {
      return {
        valid: false,
        errors: [{ code: 'R_EXEC', message: e instanceof Error ? e.message : String(e) }],
        warnings: v.warnings,
      };
    }
  }

  debug(module: Module, inputs: Inputs): DebugResult {
    return debugModule(this.prepare(module), inputs, this.reg);
  }

  generateSchema(module: Module, format: SchemaFormat): string {
    return generateSchema(module, format);
  }

  generateDocs(module: Module): string {
    return generateDocs(module);
  }

  generateCode(module: Module, opts?: CodeGenOpts): string {
    return generateCode(this.prepare(module), opts);
  }

  validateField(name: string, value: unknown, module: Module): FieldResult {
    return validateField(name, value, module);
  }

  validatePartial(inputs: Inputs, module: Module): PartialResult {
    return validatePartial(inputs, module);
  }

  validationStatus(inputs: Inputs, module: Module): FormStatus {
    return validationStatus(inputs, module);
  }

  livePreview(inputs: Inputs, module: Module): PreviewResult {
    return livePreview(this.prepare(module), inputs, this.reg);
  }

  fieldSuggestions(name: string, module: Module, query?: string): string[] {
    return fieldSuggestions(name, module, query);
  }

  batchValidateFields(updates: Record<string, unknown>, current: Inputs, module: Module): Record<string, FieldResult> {
    return batchValidateFields(updates, current, module);
  }

  getTemplates(category?: string): TemplateMeta[] {
    return this.templates.list(category);
  }

  getTemplate(name: string): Template | undefined {
    return this.templates.get(name);
  }

  searchTemplates(keyword: string): TemplateMeta[] {
    return this.templates.search(keyword);
  }

  registerTemplate(name: string, template: Template): void {
    this.templates.register(name, template);
  }

  exportTemplate(name: string): string {
    return this.templates.exportJson(name);
  }

  importTemplate(json: string): string {
    return this.templates.importJson(json);
  }

  evaluateTemplate(name: string, inputs: Inputs): Outputs {
    const t = this.templates.get(name);
    if (!t) throw new ConfigError('S8_TEMPLATE_NOT_FOUND', `template '${name}' not found`);
    return this.evaluate(t.config, inputs);
  }

  testTemplate(name: string, exampleIndex = 0): { passed: boolean; expected: Outputs; actual: Outputs } {
    const t = this.templates.get(name);
    if (!t) throw new ConfigError('S8_TEMPLATE_NOT_FOUND', `template '${name}' not found`);
    if (exampleIndex >= t.examples.length) {
      throw new ConfigError('S8_EXAMPLE_NOT_FOUND', `example ${exampleIndex} not found`);
    }
    const ex = t.examples[exampleIndex];
    const actual = this.evaluate(t.config, ex.inputs);
    const passed = JSON.stringify(actual) === JSON.stringify(ex.expected);
    return { passed, expected: ex.expected, actual };
  }

  templateCategories(): string[] {
    return this.templates.categories();
  }

  info() {
    return {
      ver: '0.1.0',
      features: [
        'formula',
        'if',
        'switch',
        'table',
        'nested',
        'coverage-check',
        'templates',
        'debug',
        'codegen',
        'schema-gen',
        'docs-gen',
        'realtime-validation',
      ],
      loaded_themes: this.reg.loadedThemes(),
    };
  }
}
