import concurrently from 'concurrently';

// Capture any extra arguments passed via command line (e.g. --host)
const args = process.argv.slice(2);

// Forward the arguments to dev:client (Vite)
// Vite expects arguments after -- if run via pnpm/npm, or directly if called directly.
// Let's use pnpm dev:client -- [args] to pass them through pnpm, or we can run vite directly!
// Running pnpm dev:client with -- forwards the arguments perfectly.
const clientCmd = args.length > 0
  ? `pnpm dev:client ${args.join(' ')}`
  : 'pnpm dev:client';

const serverCmd = 'pnpm dev:server';

console.log(`🚀 Starting NexusFlow services...`);
const isSslDisabled = process.env.HTTPS === 'false' || process.env.SSL === 'false' || process.env.NO_SSL === 'true';
if (!isSslDisabled) {
  console.log(`🔒 SSL mode active: Serving over HTTPS for secure mobile WebRTC & camera live scanning.`);
} else {
  console.log(`⚠️ HTTP mode active: Note that mobile camera WebRTC requires HTTPS or chrome://flags.`);
}
console.log(`📡 Forwarding arguments to client: ${args.length > 0 ? args.join(' ') : 'None'}\n`);

const { result } = concurrently(
  [
    { command: serverCmd, name: 'server', prefixColor: 'blue' },
    { command: clientCmd, name: 'client', prefixColor: 'green' }
  ],
  {
    prefix: 'name',
    killOthersOn: ['failure', 'success'],
    killOthers: true,
    restartTries: 0,
  }
);

result.then(
  () => process.exit(0),
  (err) => process.exit(1)
);
