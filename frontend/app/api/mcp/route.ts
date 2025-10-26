import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
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

type ResponseState = {
  status: number;
  headers: Headers;
  bodyChunks: string[];
};

class IncomingMessageAdapter extends EventEmitter {
  constructor(
    public method: string,
    public headers: IncomingHttpHeaders,
    public url: string
  ) {
    super();
  }

  auth?: undefined;
}

class ServerResponseAdapter extends EventEmitter {
  statusCode: number;

  constructor(private readonly state: ResponseState) {
    super();
    this.statusCode = state.status;
  }

  setHeader(
    name: string,
    value: string | number | readonly string[]
  ): this {
    const normalizedValue = Array.isArray(value)
      ? value.join(", ")
      : value.toString();
    this.state.headers.set(name, normalizedValue);
    return this;
  }

  writeHead(statusCode: number, headers?: OutgoingHttpHeaders): this {
    this.statusCode = statusCode;
    this.state.status = statusCode;
    if (headers) {
      Object.entries(headers).forEach(([key, value]) => {
        if (value !== undefined) {
          this.setHeader(key, value);
        }
      });
    }
    return this;
  }

  write(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    let encoding: BufferEncoding | undefined;
    let cb: ((error?: Error | null) => void) | undefined;

    if (typeof encodingOrCallback === "function") {
      cb = encodingOrCallback;
    } else {
      encoding = encodingOrCallback;
      cb = callback;
    }

    const normalized =
      typeof chunk === "string"
        ? chunk
        : Buffer.from(chunk).toString(encoding ?? "utf8");

    this.state.bodyChunks.push(normalized);
    cb?.(null);
    return true;
  }

  end(
    chunk?: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void
  ): this {
    let encoding: BufferEncoding | undefined;
    let cb: (() => void) | undefined;

    if (typeof encodingOrCallback === "function") {
      cb = encodingOrCallback;
    } else {
      encoding = encodingOrCallback;
      cb = callback;
    }

    if (chunk !== undefined) {
      this.write(chunk, encoding);
    }

    cb?.();
    this.emit("finish");
    this.emit("close");
    return this;
  }

  flushHeaders(): void {
    // No-op: headers are committed when the NextResponse is constructed.
  }

  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }
}

type NodeServerResponse = ServerResponse<IncomingMessage>;

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

    const headersObject: IncomingHttpHeaders = {};
    req.headers.forEach((value, key) => {
      headersObject[key.toLowerCase()] = value;
    });

    const responseState: ResponseState = {
      status: 200,
      headers: new Headers(),
      bodyChunks: [],
    };

    const nodeReq = new IncomingMessageAdapter(
      req.method,
      headersObject,
      req.url ?? ""
    );

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

    const nodeRes = new ServerResponseAdapter(responseState);
    nodeRes.on("error", () => {
      /* swallow transport error events */
    });

    await transport.handleRequest(
      nodeReq as unknown as IncomingMessage,
      nodeRes as unknown as NodeServerResponse,
      body
    );

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
