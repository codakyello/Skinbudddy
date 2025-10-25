import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import path from "node:path";
import { registerTools } from "./tools"; // adjust to your file location
import { NextRequest, NextResponse } from "next/server";

// --- Load env variables (Next automatically loads .env, but we keep your helper for parity)

/**
 * Helper to manually apply .env and .env.local files.
 * (Next.js loads them automatically, but we keep this for parity with standalone usage.)
 */
function applyEnvFile(fileName: string): void {
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
        if (!process.env[key]) process.env[key] = value;
      });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to load ${fileName}:`, error);
    }
  }
}

applyEnvFile(".env");
applyEnvFile(".env.local");

const createServer = (): McpServer => {
  const server = new McpServer({
    name: "skinbuddy-mcp",
    version: "1.0.0",
    capabilities: {
      resources: {},
      tools: {},
    },
  });
  registerTools(server);
  return server;
};

/**
 * Handles POST requests from the Responses API or other clients.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();

    const isJsonRpcMessage = (value: unknown): boolean => {
      if (!value || typeof value !== "object") return false;
      const record = value as Record<string, unknown>;
      if (record.jsonrpc !== "2.0") return false;
      if (typeof record.method === "string") return true;
      if (Object.prototype.hasOwnProperty.call(record, "result")) return true;
      if (Object.prototype.hasOwnProperty.call(record, "error")) return true;
      return false;
    };

    const isJsonRpcPayload = (value: unknown): boolean => {
      if (Array.isArray(value)) {
        return value.length > 0 && value.every(isJsonRpcMessage);
      }
      return isJsonRpcMessage(value);
    };

    if (!isJsonRpcPayload(body)) {
      return NextResponse.json({ message: "MCP tools registered" });
    }

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);

    const headersObject: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headersObject[key.toLowerCase()] = value;
    });

  const responseState = {
    status: 200,
    headers: new Headers(),
    bodyChunks: [] as string[],
  };

  const nodeReq = {
    method: req.method,
    headers: headersObject,
    url: req.url,
  } as any;

  const accept = headersObject["accept"] ?? "";
  const pieces = accept
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!pieces.includes("application/json")) {
    pieces.push("application/json");
  }
  if (!pieces.includes("text/event-stream")) {
    pieces.push("text/event-stream");
  }
  headersObject["accept"] = pieces.join(", ");

  const emitter = new EventEmitter();
  emitter.on("error", () => {
    /* swallow transport error events */
  });

  const nodeRes = {
    statusCode: responseState.status,
    setHeader(name: string, value: string) {
      responseState.headers.set(name, value);
    },
    writeHead(statusCode: number, headers?: Record<string, string>) {
      responseState.status = statusCode;
      if (headers) {
        Object.entries(headers).forEach(([key, value]) => {
          responseState.headers.set(key, value);
        });
      }
      return nodeRes;
    },
    write(chunk: unknown) {
      if (chunk === undefined || chunk === null) return true;
      if (typeof chunk === "string") {
        responseState.bodyChunks.push(chunk);
        return true;
      }
      if (chunk instanceof Uint8Array) {
        responseState.bodyChunks.push(Buffer.from(chunk).toString("utf8"));
        return true;
      }
      responseState.bodyChunks.push(JSON.stringify(chunk));
      return true;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined && chunk !== null) {
        nodeRes.write(chunk);
      }
      emitter.emit("close");
      return nodeRes;
    },
    on(event: string, handler: (...args: any[]) => void) {
      emitter.on(event, handler);
    },
  } as any;

  await transport.handleRequest(nodeReq, nodeRes, body);

  await transport.close();
  await server.close();

  const headers = responseState.headers;
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const responseBody =
    responseState.bodyChunks.length > 0
      ? responseState.bodyChunks.join("")
      : "{}";
    return new NextResponse(responseBody, {
      status: responseState.status,
      headers,
    });
  } catch (error: unknown) {
    console.error("❌ MCP Server Error:", error);
    return new NextResponse(
      JSON.stringify({ error: "Internal MCP Server Error" }),
      { status: 500 }
    );
  }
}

/**
 * Optional GET route for health checks.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "✅ Skinbuddy MCP server is online" });
}
