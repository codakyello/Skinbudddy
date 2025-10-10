// src/ai/mcp/client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function connectSkinbuddyMcp(
  serverScriptPath = "dist/ai/mcp/server.js"
) {
  // spawn your compiled server file (or the bin command)
  const isJs = serverScriptPath.endsWith(".js");
  const isPy = serverScriptPath.endsWith(".py");
  if (!isJs && !isPy) {
    throw new Error("Server script must be a .js or .py file");
  }
  const command = isPy
    ? process.platform === "win32"
      ? "python"
      : "python3"
    : process.execPath;

  const transport = new StdioClientTransport({
    command,
    args: [serverScriptPath],
  });

  const client = new Client({ name: "skinbuddy-client", version: "1.0.0" });
  await client.connect(transport);

  return client;
}
