// Bundles the relay into one file, dist/server.js. The shared envelope code
// (@shared/partner/relay and @shared/check) is copied into the bundle, so the running server has
// no link to frontend/. esbuild reads the @shared alias from tsconfig.json's paths.
// `ws` stays external: it's installed as a normal dependency in the runtime image
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: ['ws'],
  logLevel: 'info'
})
