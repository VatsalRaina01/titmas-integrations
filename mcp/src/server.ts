#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TitmasClient } from "@titmas/agent-sdk";
import { createTitmasMcpServer } from "./adapter.js";

const credential = process.env.TITMAS_CREDENTIAL;
const tenantId = process.env.TITMAS_TENANT_ID;
const agentIdentity = process.env.TITMAS_AGENT_ID;
const credentialId = process.env.TITMAS_CREDENTIAL_ID;

const client = new TitmasClient({
  baseUrl: process.env.TITMAS_BASE_URL ?? "https://redcrag.cn",
  ...(credential === undefined ? {} : { credential }),
  ...(credentialId === undefined ? {} : { credentialId })
});

const server = createTitmasMcpServer({
  sdk: client,
  delegatedContext: {
    credentialConfigured: credential !== undefined,
    ...(credentialId === undefined ? {} : { credentialId }),
    ...(tenantId === undefined ? {} : { tenantId }),
    ...(agentIdentity === undefined ? {} : { agentId: agentIdentity })
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch(() => {
  process.stderr.write("TITMAS MCP adapter failed to start\n");
  process.exitCode = 1;
});
