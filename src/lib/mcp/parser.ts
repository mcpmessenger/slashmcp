import { findServerDefinition } from "./registry";
import type { McpInvocation, McpServerId, McpRegistryEntry } from "./types";

export interface ParseMcpCommandResult {
  invocation: McpInvocation;
  isMcpCommand: boolean;
  validationMessage?: string;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  let escapeNext = false;

  for (const char of input) {
    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\" && inQuotes) {
      escapeNext = true;
      continue;
    }

    if (char === "'" || char === "\"") {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
        continue;
      }
      if (quoteChar === char) {
        inQuotes = false;
        continue;
      }
    }

    if (!inQuotes && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeServerId(raw: string, registry?: McpRegistryEntry[]): McpServerId | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  // Dynamic, user-registered servers are stored with ids like srv_...
  if (lower.startsWith("srv_")) {
    return lower;
  }

  // Check user's registry (by id or name) - case-insensitive
  if (registry && registry.length > 0) {
    const registryMatch = registry.find(
      entry => {
        const entryIdLower = entry.id.toLowerCase();
        const entryNameLower = entry.name.toLowerCase();
        return entryIdLower === lower || entryNameLower === lower ||
               entryIdLower.includes(lower) || entryNameLower.includes(lower);
      }
    );
    if (registryMatch) {
      console.log("[MCP Parser] Found server in registry:", registryMatch.id, "for input:", raw);
      return registryMatch.id; // Return the actual ID (might be srv_...)
    }
    console.log("[MCP Parser] Server not found in registry. Registry entries:", registry.map(r => ({ id: r.id, name: r.name })));
  } else {
    console.log("[MCP Parser] Registry is empty or not provided");
  }

  // Check static registry
  const candidate = lower as McpServerId;
  const staticMatch = findServerDefinition(candidate);
  if (staticMatch) {
    console.log("[MCP Parser] Found server in static registry:", candidate);
    return candidate;
  }

  console.log("[MCP Parser] Server not found in static registry:", candidate);
  return null;
}

export function parseMcpCommand(rawInput: string, registry?: McpRegistryEntry[]): ParseMcpCommandResult | null {
  const trimmed = rawInput.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const tokens = tokenize(trimmed.slice(1));
  if (tokens.length === 0) {
    return null;
  }

  // Debug logging
  console.log("[MCP Parser] Parsing command:", trimmed.slice(0, 100));
  console.log("[MCP Parser] Tokens:", tokens);
  console.log("[MCP Parser] Registry entries:", registry?.map(r => ({ id: r.id, name: r.name })));

  const serverId = normalizeServerId(tokens[0], registry);
  if (!serverId) {
    console.log("[MCP Parser] Server ID not found for:", tokens[0]);
    return null;
  }

  console.log("[MCP Parser] Resolved server ID:", serverId);

  // Check if second token is a command or a parameter
  // If it contains "=", it's a parameter, not a command
  const secondToken = tokens[1];
  const isParameter = secondToken && secondToken.includes("=");
  
  const invocation: McpInvocation = {
    serverId,
    command: isParameter ? undefined : tokens[1], // Only set command if it's not a parameter
    args: {},
    positionalArgs: [],
    rawInput,
  };

  // Start parsing args from token 2 if command exists, otherwise from token 1
  const argStartIndex = invocation.command ? 2 : 1;
  const argTokens = tokens.slice(argStartIndex);
  
  for (const token of argTokens) {
    const equalIndex = token.indexOf("=");
    if (equalIndex === -1) {
      invocation.positionalArgs.push(stripWrappingQuotes(token));
      continue;
    }

    const key = token.slice(0, equalIndex);
    const value = token.slice(equalIndex + 1);
    if (!key) {
      invocation.positionalArgs.push(stripWrappingQuotes(value));
      continue;
    }
    invocation.args[key] = stripWrappingQuotes(value);
  }

  // If no command specified, try to infer from common patterns
  if (!invocation.command) {
    // For langchain-agent, default to agent_executor if query parameter exists
    if (serverId.toLowerCase().includes("langchain") && invocation.args.query) {
      invocation.command = "agent_executor";
      console.log("[MCP Parser] Auto-detected command: agent_executor for langchain-agent");
    } else {
      // Check static registry for available commands
      const server = findServerDefinition(serverId);
      // Also check user registry
      const registryServer = registry?.find(
        entry => entry.id === serverId || entry.name === serverId
      );
      
      if (server || registryServer) {
        return {
          invocation,
          isMcpCommand: true,
          validationMessage: server
            ? `Available commands: ${server.commands.map(cmd => cmd.name).join(", ")}. Usage: /${serverId} <command> <params>`
            : `Server found but no command specified. Usage: /${serverId} <command> <params>`,
        };
      }
      
      // If server not found in either registry, return null (not an MCP command)
      console.log("[MCP Parser] Server not found in static or user registry:", serverId);
      return null;
    }
  }

  return { invocation, isMcpCommand: true };
}

