#!/usr/bin/env node
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { readStdinRaw, parseHookEvent } from "./hook-io.mjs";

const PROXY_BIN = "/usr/local/bin/rtk-proxy";
const REESCREVIVEL = /^(git status|git diff|git log|grep|find|ls)\b/;

const evento = parseHookEvent(readStdinRaw());
if (evento === null) {
  process.exit(0); // sem evento utilizável — falha aberta
}

const comando = evento?.tool_input?.command ?? "";

if (!REESCREVIVEL.test(comando)) {
  process.exit(0); // não reconhecido — comando original roda sem alteração
}

try {
  await access(PROXY_BIN);
} catch {
  process.exit(0); // proxy não instalado — falha aberta
}

execFile(PROXY_BIN, ["run", comando], (erro, saida) => {
  if (erro) {
    process.exit(0); // proxy deu erro — falha aberta
    return;
  }
  console.log(JSON.stringify({ decision: "block", reason: saida }));
  process.exit(0);
});
