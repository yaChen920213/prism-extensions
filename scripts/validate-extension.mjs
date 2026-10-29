#!/usr/bin/env node
/**
 * 扩展包校验器（tap 仓库 CI / 投稿者本地自检；Prism Extensions 市场）。
 * 零依赖（node 原生）。**权威校验在 Prism 客户端**（src/main/extensions/manifest.ts 的 zod 全集）；
 * 本脚本是投稿门禁的最小同源子集：manifest 形态 / 权限词表 / entry 存在 / 白名单与限额 /
 * index.json 同步（--write-index 可再生成）。
 * 用法：node scripts/validate-extension.mjs extensions/<name> [--write-index]
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const NAME_RE = /^[a-z][a-z0-9-]{1,63}$/
const VERSION_RE = /^\d+\.\d+\.\d+$/
const TOOL_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const FLOW_RE = /^[a-z][a-z0-9-]{0,63}$/
const BASE_PERMS = ['capabilities:run', 'flows:run', 'assets:read', 'assets:write', 'storage']
const NET_RE = /^net:(\*\.[a-z0-9][a-z0-9.-]{0,251}[a-z0-9]|[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?|localhost)$/
const ALLOWED_EXT = /\.(js|json|md|txt|png|svg|wasm)$/i
const MAX_FILES = 100
const MAX_TOTAL = 10 * 1024 * 1024
const root = process.cwd()
const args = process.argv.slice(2)
const writeIndex = args.includes('--write-index')
const targets = args.filter((a) => !a.startsWith('--'))

const walk = (dir, depth, acc) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (depth < 6) walk(full, depth + 1, acc)
      continue
    }
    if (!e.isFile() || !ALLOWED_EXT.test(e.name)) continue
    acc.push(full)
  }
  return acc
}

const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}

const entries = []
for (const target of targets.length > 0 ? targets : readdirSync(join(root, 'extensions'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join('extensions', e.name))) {
  const dir = join(root, target)
  const label = target
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail(`${label}: 目录不存在`)
    continue
  }
  const manifestFile = join(dir, 'prism-extension.json')
  if (!existsSync(manifestFile)) {
    fail(`${label}: 缺 prism-extension.json`)
    continue
  }
  const text = readFileSync(manifestFile, 'utf8')
  let m
  try {
    m = JSON.parse(text)
  } catch (err) {
    fail(`${label}: manifest 不是合法 JSON（${err.message}）`)
    continue
  }
  if (!NAME_RE.test(m.name ?? '')) fail(`${label}: name 不合法（小写字母开头，字母数字连字符，≤64）`)
  if (!VERSION_RE.test(m.version ?? '')) fail(`${label}: version 形如 1.0.0`)
  if (typeof m.displayName !== 'string' || !m.displayName) fail(`${label}: displayName 必填`)
  if (typeof m.description !== 'string' || !m.description) fail(`${label}: description 必填`)
  if (typeof m.homepage === 'string' && !/^https:\/\//.test(m.homepage)) fail(`${label}: homepage 须为 https`)
  const perms = Array.isArray(m.permissions) ? m.permissions : []
  if (perms.length > 32) fail(`${label}: 权限数超 32`)
  for (const p of perms) {
    if (!BASE_PERMS.includes(p) && !NET_RE.test(p)) fail(`${label}: 权限不合法 ${p}`)
  }
  const tools = Array.isArray(m.tools) ? m.tools : []
  const flows = Array.isArray(m.flows) ? m.flows : []
  if (tools.length === 0 && flows.length === 0) fail(`${label}: 既无 tools 也无 flows`)
  const toolNames = new Set()
  for (const t of tools) {
    if (!TOOL_RE.test(t.name ?? '')) fail(`${label}: 工具名不合法 ${t.name}`)
    if (toolNames.has(t.name)) fail(`${label}: 工具名重复 ${t.name}`)
    toolNames.add(t.name)
    if (typeof t.title !== 'string' || typeof t.description !== 'string') fail(`${label}: 工具 ${t.name} 缺 title/description`)
    if (!t.inputSchema || t.inputSchema.type !== 'object') fail(`${label}: 工具 ${t.name} inputSchema 须为 {type:"object",...}`)
  }
  if (tools.length > 0 && typeof m.entry !== 'string') fail(`${label}: 有 tools 须给 entry`)
  if (typeof m.entry === 'string') {
    if (!/^[\w][\w./-]*\.js$/.test(m.entry) || m.entry.includes('..')) fail(`${label}: entry 不合法 ${m.entry}`)
    else if (!existsSync(join(dir, m.entry))) fail(`${label}: entry 文件不存在 ${m.entry}`)
  }
  const flowIds = new Set()
  for (const f of flows) {
    if (!FLOW_RE.test(f.id ?? '')) fail(`${label}: 流水线 id 不合法 ${f.id}`)
    if (flowIds.has(f.id)) fail(`${label}: 流水线 id 重复 ${f.id}`)
    flowIds.add(f.id)
    if (!f.def || !Array.isArray(f.def.nodes) || f.def.nodes.length === 0) fail(`${label}: 流水线 ${f.id} 缺 def.nodes`)
  }
  const files = walk(dir, 1, [])
  if (files.length === 0) fail(`${label}: 无白名单文件`)
  if (files.length > MAX_FILES) fail(`${label}: 文件数超 ${MAX_FILES}`)
  const total = files.reduce((n, f) => n + statSync(f).size, 0)
  if (total > MAX_TOTAL) fail(`${label}: 总量超 10MB`)
  const dirName = target.split('/').pop()
  if (dirName !== m.name) fail(`${label}: 目录名与 manifest.name 不一致（${dirName} vs ${m.name}）`)
  entries.push({
    name: m.name,
    version: m.version,
    displayName: m.displayName,
    description: m.description,
    author: typeof m.author === 'string' ? m.author : '',
    homepage: typeof m.homepage === 'string' ? m.homepage : '',
    industry: Array.isArray(m.industry) ? m.industry.filter((x) => typeof x === 'string') : ['通用'],
    permissions: perms,
    tools: tools.map((t) => t.name),
    subdir: target.replaceAll('\\', '/'),
    manifestSha256: createHash('sha256').update(text, 'utf8').digest('hex')
  })
  console.log(`✓ ${label} v${m.version}（${perms.join('、') || '零代码'}）`)
}

// index.json 同步校验 / 再生成
const indexFile = join(root, 'index.json')
const next = { indexVersion: 1, generatedAt: new Date().toISOString(), extensions: entries }
if (writeIndex) {
  // 再生成：全部字段以 manifests 为准（generatedAt 除外）
  writeFileSync(indexFile, JSON.stringify(next, null, 2) + '\n')
  console.log(`index.json 已再生成（${entries.length} 条）`)
} else if (existsSync(indexFile) && (process.exitCode ?? 0) === 0) {
  const current = JSON.parse(readFileSync(indexFile, 'utf8'))
  const same =
    current.indexVersion === 1 &&
    Array.isArray(current.extensions) &&
    current.extensions.length === entries.length &&
    current.extensions.every((e) => {
      const want = entries.find((x) => x.name === e.name)
      return want && want.version === e.version && want.manifestSha256 === e.manifestSha256 && want.subdir === e.subdir
    })
  if (!same) {
    fail('index.json 与 extensions/ 不同步——运行 node scripts/validate-extension.mjs --write-index 后提交')
  } else {
    console.log(`✓ index.json 同步（${entries.length} 条）`)
  }
}
