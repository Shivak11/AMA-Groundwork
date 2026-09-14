import {fileURLToPath} from 'node:url';
// Print a real local configuration. Do not mutate any client's settings.
console.log(JSON.stringify({mcpServers:{'ama-groundwork':{command:process.execPath,args:[fileURLToPath(new URL('../src/stdio.mjs',import.meta.url))]}}},null,2));
