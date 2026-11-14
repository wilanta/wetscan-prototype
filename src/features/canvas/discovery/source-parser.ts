import ts from "typescript";
export interface SourceImport {
  module: string;
  line: number;
  used: boolean;
}
export interface ParsedSource {
  imports: SourceImport[];
  methods: string[];
  methodLines?: Record<string, number>;
  malformed: boolean;
}
const methods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
/** TypeScript's syntax parser never resolves packages, typechecks, or executes repository code. */
export function parseSource(path: string, text: string): ParsedSource {
  const file = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports: SourceImport[] = [];
  const http = new Set<string>();
  const methodLines: Record<string, number> = {};
  const references = new Map<string, number>();
  function walk(node: ts.Node) {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const nonReference =
        (ts.isPropertyAccessExpression(p) && p.name === node) ||
        ((ts.isVariableDeclaration(p) ||
          ts.isParameter(p) ||
          ts.isFunctionDeclaration(p) ||
          ts.isPropertyAssignment(p)) &&
          p.name === node);
      if (!nonReference)
        references.set(node.text, (references.get(node.text) ?? 0) + 1);
    }
    ts.forEachChild(node, walk);
  }
  walk(file);
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const clause = statement.importClause;
      const bindings: string[] = [];
      if (clause?.name) bindings.push(clause.name.text);
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings))
          bindings.push(clause.namedBindings.name.text);
        else
          bindings.push(
            ...clause.namedBindings.elements
              .filter((e) => !e.isTypeOnly)
              .map((e) => e.name.text),
          );
      }
      imports.push({
        module: statement.moduleSpecifier.text,
        line:
          file.getLineAndCharacterOfPosition(statement.getStart(file)).line + 1,
        used:
          !clause?.isTypeOnly &&
          bindings.some((b) => (references.get(b) ?? 0) > 0),
      });
    }
    const exported =
      ts.canHaveModifiers(statement) &&
      ts
        .getModifiers(statement)
        ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const addMethod = (name: string) => {
      http.add(name);
      methodLines[name] =
        file.getLineAndCharacterOfPosition(statement.getStart(file)).line + 1;
    };
    if (
      exported &&
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      methods.has(statement.name.text)
    )
      addMethod(statement.name.text);
    if (exported && ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        if (
          ts.isIdentifier(declaration.name) &&
          methods.has(declaration.name.text)
        )
          addMethod(declaration.name.text);
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    )
      for (const element of statement.exportClause.elements)
        if (methods.has(element.name.text) && !element.isTypeOnly)
          addMethod(element.name.text);
  }
  const diagnostics = (
    file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  return {
    imports,
    methods: [...http].sort(),
    methodLines,
    malformed: Boolean(diagnostics?.length),
  };
}
/** JSONC tsconfig parsing with TypeScript's parser, not execution of a config module. */
export function configAliases(
  text: string,
): { prefix: string; targets: string[] }[] {
  const result = ts.parseConfigFileTextToJson("tsconfig.json", text);
  if (result.error) return [];
  const paths = result.config?.compilerOptions?.paths;
  if (!paths || typeof paths !== "object") return [];
  return Object.entries(paths).flatMap(([key, values]) =>
    key.endsWith("/*") && Array.isArray(values)
      ? [
          {
            prefix: key.slice(0, -1),
            targets: values
              .filter(
                (v): v is string => typeof v === "string" && v.endsWith("/*"),
              )
              .map((v) => v.slice(0, -1).replace(/^\.\//, "")),
          },
        ]
      : [],
  );
}
export function routeInfo(
  path: string,
  parsed: ParsedSource,
): { route: string; methods: string[]; router: string } | null {
  const app = /(?:^|\/)(?:src\/)?app\/(.*)\/route\.[cm]?[jt]sx?$/.exec(path);
  if (app) {
    const segments = app[1]
      .split("/")
      .filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith("@"));
    if (segments[0] !== "api") return null;
    return {
      route: `/${segments.join("/")}`,
      methods: parsed.methods,
      router: "App Router",
    };
  }
  const pages = /(?:^|\/)(?:src\/)?pages\/(api\/.*)\.[cm]?[jt]sx?$/.exec(path);
  if (!pages) return null;
  return {
    route: `/${pages[1].replace(/(?:^|\/)index$/, "")}`,
    methods: [],
    router: "Pages Router · request methods not statically resolved",
  };
}
