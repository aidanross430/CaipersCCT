// Turns electron-builder's unpacked Windows build into the folder handed out to the lab,
// then zips it:
//
//   release/CaipersCCT/
//   ├── Condition A.bat  double-click to start, one launcher per condition
//   ├── ...              (A to D, see src/main/launchCondition.ts)
//   ├── README.txt       instructions for research assistants, including which condition is which
//   ├── Options/         editable settings (copied from defaults/Options)
//   ├── Output/          session data is written here
//   └── app/             CaipersCCT.exe and its runtime files
//
//   release/CaipersCCT-<version>.zip
//
// Run with `npm run dist`, which builds first. Windows only.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

const unpacked = join(root, 'dist', 'win-unpacked') // electron-builder's output
const releaseDir = join(root, 'release')
const outDir = join(releaseDir, 'CaipersCCT')
const zipPath = join(releaseDir, `CaipersCCT-${version}.zip`)

if (!existsSync(join(unpacked, 'CaipersCCT.exe'))) {
  console.error(`No build found at ${unpacked}. Run "npm run dist", which builds first.`)
  process.exit(1)
}

// Start clean, so files from an earlier build can't end up in this one
await rm(outDir, { recursive: true, force: true })
await rm(zipPath, { force: true })
await mkdir(outDir, { recursive: true })

// The app itself goes one level down, so the top of the folder stays tidy
await cp(unpacked, join(outDir, 'app'), { recursive: true })

// The launchers, one per condition. The packaged app refuses to start without --condition, so
// these are the only way in. Neutral names, so a participant who sees the folder can't tell the
// conditions apart; README.txt has the key. Must match CONDITIONS in src/main/launchCondition.ts.
// %~dp0 is the folder the .bat is in, so they work wherever the folder is copied to. Written
// with Windows line endings, which .bat files need
for (const condition of ['A', 'B', 'C', 'D']) {
  await writeFile(
    join(outDir, `Condition ${condition}.bat`),
    ['@echo off', `start "" "%~dp0app\\CaipersCCT.exe" --condition=${condition}`, ''].join('\r\n')
  )
}

await cp(join(root, 'packaging', 'README.txt'), join(outDir, 'README.txt'))

// The key templates must hold instructions only: a key pasted into one by mistake would be
// shipped in the zip (and is already in the build via extraResources)
for (const keyFile of ['api-key.txt', 'relay-key.txt']) {
  const keyTemplate = await readFile(join(root, 'defaults', 'Options', keyFile), 'utf8')
  if (keyTemplate.split(/\r?\n/).some((line) => line.trim() !== '' && !line.trim().startsWith('#'))) {
    console.error(`defaults/Options/${keyFile} contains more than # comment lines. Remove the key, then package again.`)
    process.exit(1)
  }
}

// Default options. Files starting with "." (like .gitkeep) are repository housekeeping
await cp(join(root, 'defaults', 'Options'), join(outDir, 'Options'), {
  recursive: true,
  filter: (src) => !basename(src).startsWith('.')
})
await mkdir(join(outDir, 'Output'))

// Windows 10 and 11 include bsdtar, which can write zip files. Called by its full path,
// because Git Bash puts a GNU tar (which can't) first on the PATH
const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
execFileSync(tar, ['-a', '-c', '-f', zipPath, '-C', releaseDir, 'CaipersCCT'], { stdio: 'inherit' })

console.log(`Packaged ${outDir}`)
console.log(`Zipped   ${zipPath}`)
