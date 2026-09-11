import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createWorkshopServer } from './server.mjs';
const server = await createWorkshopServer();
await server.connect(new StdioServerTransport(process.stdin,process.stdout,{maxBufferSize:2000000}));

