#!/usr/bin/env node
// The command `benchfleet-mcp` (npx benchfleet-mcp): see ../benchfleet-mcp.mjs.
import { main } from '../benchfleet-mcp.mjs';

process.exitCode = await main();
