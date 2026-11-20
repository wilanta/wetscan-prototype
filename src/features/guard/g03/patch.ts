import ts from "typescript";
import { fingerprint } from "../../../platform/identity";
import type { Finding } from "../contracts";
import { G03Error, type Edit, type Patch, type SourceFile } from "./contracts";
import {
  assertPublic,
  gitBlob,
  object,
  patchPath,
  sha256,
  sanitizeSource,
} from "./safety";

export function validateSource(file: SourceFile) {
  patchPath(file.path);
  if (
    Buffer.byteLength(file.content) > 24000 ||
    !file.content ||
    file.content.includes("\0") ||
    /\r(?!\n)/.test(file.content) ||
    sha256(file.content) !== file.sourceSha256 ||
    gitBlob(file.content) !== file.blob
  )
    throw new G03Error("source_integrity");
}
export function syntaxCheck(path: string, content: string) {
  try {
    if (path.endsWith(".json")) {
      JSON.parse(content);
      return;
    }
    const tree = ts.createSourceFile(
      path,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    if (
      (tree as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
        .parseDiagnostics.length
    )
      throw Error();
  } catch {
    throw new G03Error("patch_syntax_invalid");
  }
}
export function applyEdit(source: string, edit: Edit) {
  if (
    !edit.oldText ||
    edit.oldText === edit.newText ||
    edit.oldText.length > 3000 ||
    edit.newText.length > 3000 ||
    edit.oldText.split("\n").length > 40 ||
    edit.newText.split("\n").length > 40
  )
    throw new G03Error("patch_not_minimal");
  const at = source.indexOf(edit.oldText);
  if (at < 0 || source.indexOf(edit.oldText, at + 1) !== -1)
    throw new G03Error("patch_ambiguous");
  return (
    source.slice(0, at) + edit.newText + source.slice(at + edit.oldText.length)
  );
}
/** One replacement, one exact authorized file; no model-supplied paths or shell commands. */
export function makePatch(
  file: SourceFile,
  finding: Finding,
  value: unknown,
): Patch {
  validateSource(file);
  const v = object(value, ["oldText", "newText"]);
  if (typeof v.oldText !== "string" || typeof v.newText !== "string")
    throw new G03Error("invalid_patch");
  const edit = v as unknown as Edit;
  assertPublic(edit.oldText);
  assertPublic(edit.newText);
  if (
    file.path !== finding.location.path ||
    finding.location.artifactKind === "image" ||
    finding.source.engine === "sca"
  )
    throw new G03Error("patch_outside_scope");
  const at = file.content.indexOf(edit.oldText);
  const line = file.content.slice(0, at).split("\n").length;
  if (finding.location.line && Math.abs(line - finding.location.line) > 10)
    throw new G03Error("patch_outside_scope");
  if (
    /\b(?:nosemgrep|nosec|gitleaks:allow|eslint-disable)\b|(?:semgrep|opengrep|gitleaks|trivy)[-_ :]*(?:ignore|skip|disable)/i.test(
      edit.newText,
    )
  )
    throw new G03Error("patch_disables_security");
  if (
    /\b(?:eval|Function|fetch|require|import|exec|execSync|spawn|spawnSync|XMLHttpRequest|WebSocket)\b|\b(?:child_process|process|globalThis|Deno|window|document|navigator)\s*[.\[]|\b(?:fs|fsPromises|http|https|net|tls|dns|axios)\s*[.\[]|(?:\.|\[\s*["'])\s*(?:constructor|__proto__|prototype)\b|https?:\/\//.test(
      edit.newText,
    )
  )
    throw new G03Error("unsafe_patch_change");
  const after = applyEdit(file.content, edit);
  syntaxCheck(file.path, after);
  const oldLines = file.content.match(/[^\n]*\n|[^\n]+$/g) ?? [],
    newLines = after.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let start = 0,
    end = 0;
  while (
    start < Math.min(oldLines.length, newLines.length) &&
    oldLines[start] === newLines[start]
  )
    start++;
  while (
    end < Math.min(oldLines.length, newLines.length) - start &&
    oldLines[oldLines.length - end - 1] === newLines[newLines.length - end - 1]
  )
    end++;
  const from = Math.max(0, start - 3),
    toOld = Math.min(oldLines.length, oldLines.length - end + 3),
    toNew = Math.min(newLines.length, newLines.length - end + 3);
  const publicLines =
    sanitizeSource(file.content).match(/[^\n]*\n|[^\n]+$/g) ?? [];
  if (
    oldLines.slice(from, toOld).join("") !==
    publicLines.slice(from, toOld).join("")
  )
    throw new G03Error("sensitive_content");
  const lines = [
    ...oldLines.slice(from, start).map((s) => " " + s),
    ...oldLines.slice(start, oldLines.length - end).map((s) => "-" + s),
    ...newLines.slice(start, newLines.length - end).map((s) => "+" + s),
    ...oldLines.slice(oldLines.length - end, toOld).map((s) => " " + s),
  ];
  const render = (line: string) =>
    line.endsWith("\n") ? line : line + "\n\\ No newline at end of file\n";
  const diff = `--- a/${file.path}\n+++ b/${file.path}\n@@ -${oldLines.length ? from + 1 : 0},${toOld - from} +${newLines.length ? from + 1 : 0},${toNew - from} @@\n${lines.map(render).join("")}`;
  assertPublic(diff);
  const { content: _, ...binding } = file;
  void _;
  const body = {
    ...binding,
    ...edit,
    diff,
    afterSha256: sha256(after),
    syntax: "passed" as const,
    repositoryTests: "NOT_RUN" as const,
  };
  return { ...body, digest: fingerprint(body) };
}
export function verifyPatch(file: SourceFile, finding: Finding, patch: Patch) {
  const computed = makePatch(file, finding, {
    oldText: patch.oldText,
    newText: patch.newText,
  });
  if (fingerprint(computed) !== fingerprint(patch))
    throw new G03Error("stale_patch");
  return applyEdit(file.content, patch);
}
