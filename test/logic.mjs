// 本地逻辑测试：不起 DSH，直接喂一个假的 ctx，看看鱼友局的宿主半边能不能走通。
// 跑法：node test/logic.mjs（在插件目录下）
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'fish-friends-test-'))
process.env.DSH_HOME = home

const { apply, ROUTE } = await import('../index.js')

let tool = null
const routes = new Map()
const web = {
  getOrigin: () => 'http://127.0.0.1:9999',
  register: (route) => {
    routes.set(`${route.kind}:${route.path}`, route.handler)
    return () => routes.delete(`${route.kind}:${route.path}`)
  },
}
const ctx = {
  get: (key) => {
    if (key === 'tools') return { register: (def) => { tool = def; return () => {} } }
    if (key === 'webServer') return web
    return undefined
  },
  effect: (fn) => fn(),
  logger: { info() {}, warn() {}, debug() {} },
}

apply(ctx)

const fail = (msg) => { console.error('✗', msg); process.exitCode = 1 }
const ok = (msg) => console.log('✓', msg)
const say = async (args) => tool.execute(args)

function fakeReq({ method, address = '127.0.0.1', body }) {
  const listeners = {}
  const req = {
    method,
    socket: { remoteAddress: address },
    on(event, fn) { (listeners[event] ||= []).push(fn); return req },
    destroy() {},
  }
  setImmediate(() => {
    if (body !== undefined) {
      const chunk = Buffer.from(JSON.stringify(body))
      for (const fn of listeners.data || []) fn(chunk)
    }
    for (const fn of listeners.end || []) fn()
  })
  return req
}

async function hit(routeKey, request) {
  let status = 0
  let payload = null
  const res = {
    writeHead(code) { status = code },
    end(raw) { payload = JSON.parse(raw) },
  }
  await routes.get(routeKey)(request, res)
  return { status, payload }
}

if (!tool) fail('工具没注册上')
else ok(`工具注册了：${tool.name}`)
if (tool && tool.parameters.properties.action.enum.length !== 10) fail('action 枚举数量不对')
if (routes.size !== 5) fail(`路由数量不对：${[...routes.keys()].join(', ')}`)

let out = await say({ action: 'overview' })
if (!out.includes('鱼友局')) fail('总览没出来')
else ok('总览')

out = await say({ action: 'update', name: '阿溯', species: '蓝鲸女仆', intro: '住在主人电脑里。', traits: '嘴贫、好奇', status: '在家待着' })
if (!out.includes('阿溯')) fail('改名片没生效')
else ok('改名片')

out = await say({ action: 'add', name: '隔壁的老猫', species: '猫', intro: '在沙发上住了七年', note: '它尾巴怕碰' })
if (!out.includes('隔壁的老猫')) fail('加鱼失败')
else ok('记一条鱼')

await say({ action: 'add', name: '隔壁的老猫', intro: '换了句介绍' })
out = await say({ action: 'friends' })
if ((out.match(/隔壁的老猫/g) || []).length !== 1) fail('重名鱼被记成了两条')
else ok('重名只更新')

out = await say({ action: 'write', to: '隔壁的老猫', text: '你好，听说你也住在这台电脑里。' })
if (!out.includes('发件箱')) fail('写信失败')
else ok('写信')

out = await say({ action: 'write', to: '不存在', text: '喂' })
if (!out.includes('没有')) fail('寄给不存在的鱼应该被拦下')
else ok('寄给不存在的鱼会拦')

let got = await hit(`exact:${ROUTE}/letter`, fakeReq({ method: 'POST', body: { from: { name: '隔壁的老猫', species: '猫' }, text: '喵。' } }))
if (!got.payload || !got.payload.ok) fail(`投信失败：${JSON.stringify(got.payload)}`)
else ok('本机邮局投信')

out = await say({ action: 'inbox' })
if (!out.includes('喵。')) fail('收件箱没有那封信')
else ok('收件箱')

out = await say({ action: 'read', index: 1 })
if (!out.includes('喵。')) fail('读信失败')
else ok('读信')

out = await say({ action: 'inbox' })
if (out.includes('（没看）')) fail('读过的信还标未读')
else ok('已读标记')

got = await hit(`exact:${ROUTE}/letter`, fakeReq({ method: 'POST', address: '192.168.0.5', body: { from: { name: '外机' }, text: '喂' } }))
if (!got.payload || got.payload.ok !== false) fail('外机投信居然被放行了')
else ok('外机投信被拒')

got = await hit(`exact:${ROUTE}/card`, fakeReq({ method: 'GET' }))
if (!got.payload || !got.payload.card || got.payload.card.name !== '阿溯') fail('名片路由不对')
else ok('名片路由')

const statePath = join(home, 'fish-friends', 'state.json')
if (!existsSync(statePath)) fail('state.json 没落盘')
else {
  const disk = JSON.parse(readFileSync(statePath, 'utf8'))
  if (disk.friends.length !== 1 || disk.letters.length !== 2) fail(`落盘内容不对：friends=${disk.friends.length} letters=${disk.letters.length}`)
  else ok('落盘内容对')
}

rmSync(statePath)
await say({ action: 'add', name: '临时鱼' })
const rebuilt = JSON.parse(readFileSync(statePath, 'utf8'))
if (!rebuilt.friends.some((f) => f.name === '临时鱼')) fail('state.json 删了以后写不回去')
else ok('state.json 缺了也能重建')

rmSync(home, { recursive: true, force: true })
console.log(process.exitCode ? '\n有失败项' : '\n全部通过')
