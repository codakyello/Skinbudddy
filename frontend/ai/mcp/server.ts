import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { registerTools } from "./tools.js";

function applyEnvFile(fileName: string) {
  const filePath = path.join(process.cwd(), fileName);
  try {
    const raw = readFileSync(filePath, "utf8");
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        const equals = line.indexOf("=");
        if (equals === -1) return;
        const key = line.slice(0, equals).trim();
        const value = line.slice(equals + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to load ${fileName}:`, error);
    }
  }
}

applyEnvFile(".env");
applyEnvFile(".env.local");

// Create server instance
export const server = new McpServer({
  name: "skinbuddy mcp",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

registerTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(" MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
