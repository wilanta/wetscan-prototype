// Internal Node 22 CLI loader. Resolves this module's extensionless TS imports only.
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        error.code === "ERR_MODULE_NOT_FOUND" &&
        specifier.startsWith(".") &&
        context.parentURL?.includes("/features/canvas/")
      )
        return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});
await import("./cli.ts");
