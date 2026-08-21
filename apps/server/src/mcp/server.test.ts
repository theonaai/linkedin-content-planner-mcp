import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { NotFoundError, type CoreServices } from "@linkedin-planner/core";
import { createMcpServer } from "./server.js";

const WORKSPACE_ID = randomUUID();
const OTHER_WORKSPACE_ID = randomUUID();
const ATTACHMENT_ID = randomUUID();

/** Connects a real MCP client to the real server over an in-memory pair, so a test exercises
 * the tool exactly as an agent does: through tools/list and tools/call, not by reaching into
 * the handler. `deleted` records what actually made it to the core service. */
async function connect(options: { attachmentWorkspaceId?: string } = {}) {
  const deleted: string[] = [];
  const core = {
    authz: {
      resolveAttachmentWorkspace: async (attachmentId: string) => {
        if (attachmentId !== ATTACHMENT_ID) throw new NotFoundError("Attachment", attachmentId);
        return options.attachmentWorkspaceId ?? WORKSPACE_ID;
      },
    },
    attachments: {
      deleteAttachment: async (attachmentId: string) => {
        deleted.push(attachmentId);
      },
    },
  } as unknown as CoreServices;

  const server = createMcpServer(core, WORKSPACE_ID, {
    secret: "mcp-test-secret",
    publicBaseUrl: "http://localhost:3000",
  });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, deleted };
}

async function callDeleteAttachment(client: Client, attachmentId: string) {
  const result = await client.callTool({ name: "delete_attachment", arguments: { attachmentId } });
  const [block] = result.content as { type: string; text: string }[];
  return { isError: result.isError === true, text: block.text };
}

describe("delete_attachment", () => {
  let client: Client;
  let deleted: string[];

  beforeEach(async () => {
    ({ client, deleted } = await connect());
  });

  it("is advertised as a destructive tool", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "delete_attachment");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.destructiveHint).toBe(true);
  });

  it("deletes an attachment in the connection's own workspace", async () => {
    const { isError, text } = await callDeleteAttachment(client, ATTACHMENT_ID);

    expect(isError).toBe(false);
    expect(JSON.parse(text)).toEqual({ deleted: true, attachmentId: ATTACHMENT_ID });
    expect(deleted).toEqual([ATTACHMENT_ID]);
  });

  // The whole risk in this tool: an id is the only thing it takes, so without the workspace
  // check a token for one workspace could delete another's file just by being handed its id.
  it("refuses an attachment belonging to another workspace, without touching it", async () => {
    ({ client, deleted } = await connect({ attachmentWorkspaceId: OTHER_WORKSPACE_ID }));

    const { isError, text } = await callDeleteAttachment(client, ATTACHMENT_ID);

    expect(isError).toBe(true);
    expect(text).toBe(`Attachment not found: ${ATTACHMENT_ID}`);
    expect(deleted).toEqual([]);
  });

  it("reports an unknown attachment id as not found", async () => {
    const missingId = randomUUID();

    const { isError, text } = await callDeleteAttachment(client, missingId);

    expect(isError).toBe(true);
    expect(text).toBe(`Attachment not found: ${missingId}`);
    expect(deleted).toEqual([]);
  });
});
