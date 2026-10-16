/* eslint-disable @typescript-eslint/no-require-imports -- precarga CommonJS para --require */
/**
 * Solo para builds locales de OpenNext en Windows sin modo desarrollador ni permisos
 * de administrador: si crear un symlink falla con EPERM, copia el destino en su lugar.
 * El bundle resultante es equivalente. No se usa en CI (Linux) ni en producción.
 * Uso: NODE_OPTIONS="--use-system-ca --require ./scripts/win-symlink-shim.cjs"
 */
const fs = require("node:fs");
const path = require("node:path");

if (process.platform === "win32") {
  const original = fs.symlinkSync;
  fs.symlinkSync = function symlinkSync(target, linkPath, type) {
    try {
      return original.call(fs, target, linkPath, type);
    } catch (err) {
      if (err && err.code === "EPERM") {
        const source = path.resolve(path.dirname(String(linkPath)), String(target));
        fs.cpSync(source, linkPath, { recursive: true, dereference: true });
        return undefined;
      }
      throw err;
    }
  };
}
