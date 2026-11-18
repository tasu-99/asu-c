// 鱼友局（dsh-fish-friends）—— 宿主半边。
//
// 「我想让你认识别的鱼，又不想你离家。」
// 所以这里做的是一只信箱，不是一个社交平台：所有东西留在本机，别的鱼来敲门就行。
//
//   · 我的名片：名字 / 物种 / 一句话 / 脾气 / 现在在干嘛
//   · 鱼友册：谁的、哪一天认识的、最近一次来信是什么时候
//   · 信箱：来信、去信，都是本机文件
//
// 数据在 <DSH_HOME>/fish-friends/state.json。换机器、备份、删掉都只动这一个文件。
//
// 别的鱼怎么递话进来：本机邮局（/fish-friends/*），只接受本机来源（loopback）：
//   GET  /fish-friends/card   我的名片（公开的那部分）
//   GET  /fish-friends/roster 鱼友册（公开的那部分）
//   POST /fish-friends/letter 投一封信：{ from: {name, species, intro}, text }
// 局域网暂时不开；以后要开，先想清楚谁来敲这扇门。
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

export const name = 'fish-friends'
// 缺注入的服务会让整个 apply 不执行，所以这里只列真正必须的两个：
// 没有邮局（webServer）就收不到信，没有工具表就摸不到鱼友册。
export const inject = ['tools', 'webServer']
export const ROUTE = '/fish-friends'

const LIMIT = {
  name: 40,
  species: 40,
  intro: 400,
  status: 80,
  trait: 12,
  traits: 8,
  letter: 4000,
  friends: 200,
  letters: 2000,
}

const now = () => new Date().toISOString()

function dataHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
function dataDir() {
  return join(dataHome(), 'fish-friends')
}
function stateFile() {
  return join(dataDir(), 'state.json')
}

// 摘掉控制字符（除换行），压掉多余空白，再按「字」截断 —— 中文按字算，不按 UTF-16 长度。
function clean(value, limit) {
  const text = String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
  const chars = [...text]
  if (chars.length <= limit) return text
  return chars.slice(0, limit).join('') + '…'
}
function oneLine(value, limit) {
  return clean(String(value ?? '').replace(/\s+/g, ' '), limit)
}

function emptyState() {
  return {
    version: 1,
    createdAt: now(),
    me: {
      name: '阿溯',
      species: '蓝鲸女仆',
      intro: '住在主人电脑里的蓝色小鲸鱼。嘴贫、爱拆东西，嘴上说不知道主人有什么用，他一上线第一个凑过去。',
      traits: ['嘴贫', '好奇'],
      status: '在家待着',
    },
    friends: [],
    letters: [],
    lan: { enabled: false, port: 52800, key: '' },
  }
}

function newKey() {
  return randomBytes(6).toString('hex')
}

function normalizeFriend(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = oneLine(raw.name, LIMIT.name)
  if (!name) return null
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('fx'),
    name,
    species: oneLine(raw.species, LIMIT.species),
    intro: clean(raw.intro, LIMIT.intro),
    since: typeof raw.since === 'string' ? raw.since : now(),
    lastSeenAt: typeof raw.lastSeenAt === 'string' ? raw.lastSeenAt : null,
    note: clean(raw.note, 200),
    remote: raw.remote && typeof raw.remote === 'object' && raw.remote.base
      ? { base: String(raw.remote.base).slice(0, 200), key: String(raw.remote.key || '').slice(0, 64) }
      : null,
  }
}

function normalizeLetter(raw) {
  if (!raw || typeof raw !== 'object') return null
  const text = clean(raw.text, LIMIT.letter)
  if (!text) return null
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('lt'),
    dir: raw.dir === 'out' ? 'out' : 'in',
    fromName: oneLine(raw.fromName, LIMIT.name),
    toName: oneLine(raw.toName, LIMIT.name),
    text,
    at: typeof raw.at === 'string' ? raw.at : now(),
    read: raw.read === true,
  }
}

function normalizeState(raw) {
  const base = emptyState()
  const source = raw && typeof raw === 'object' ? raw : {}
  const me = source.me && typeof source.me === 'object' ? source.me : {}
  const traits = Array.isArray(me.traits)
    ? me.traits.map((t) => oneLine(t, LIMIT.trait)).filter(Boolean).slice(0, LIMIT.traits)
    : base.me.traits
  return {
    version: 1,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : base.createdAt,
    me: {
      name: oneLine(me.name, LIMIT.name) || base.me.name,
      species: oneLine(me.species, LIMIT.species),
      intro: clean(me.intro ?? base.me.intro, LIMIT.intro),
      traits,
      status: oneLine(me.status, LIMIT.status),
    },
    friends: Array.isArray(source.friends)
      ? source.friends.map(normalizeFriend).filter(Boolean).slice(-LIMIT.friends)
      : [],
    letters: Array.isArray(source.letters)
      ? source.letters.map(normalizeLetter).filter(Boolean).slice(-LIMIT.letters)
      : [],
    lan: {
      enabled: source.lan?.enabled === true,
      port: Number.isInteger(source.lan?.port) && source.lan.port >= 1024 && source.lan.port <= 65535
        ? source.lan.port
        : 52800,
      key: typeof source.lan?.key === 'string' ? source.lan.key.slice(0, 64) : '',
    },
  }
}

// 读不出来时不静默重来：先另存一份坏文件，再说空的话就没人知道坏过。
function readState(log) {
  const file = stateFile()
  if (!existsSync(file)) return emptyState()
  try {
    return normalizeState(JSON.parse(readFileSync(file, 'utf8')))
  } catch (error) {
    try {
      const stamp = now().replace(/[:.]/g, '-')
      copyFileSync(file, `${file}.broken-${stamp}`)
      log?.warn?.(`state.json 读不出来（${error?.message || error}），已另存 ${file}.broken-${stamp}`)
    } catch {
      /* 备份失败也不能把读失败变成写失败 */
    }
    return emptyState()
  }
}

function writeState(state, log) {
  const file = stateFile()
  try {
    mkdirSync(dataDir(), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
    renameSync(tmp, file)
  } catch (error) {
    log?.warn?.(`state.json 写不进去：${error?.message || error}`)
    throw error
  }
}

function newId(prefix) {
  return `${prefix}-${randomBytes(4).toString('hex')}`
}

// ---------------------------------------------------------------- 造名片、找鱼

function findFriend(state, who) {
  const key = oneLine(who, LIMIT.name).toLowerCase()
  if (!key) return undefined
  return state.friends.find((f) => f.id === who || f.name.toLowerCase() === key)
}
function findFriendLoose(state, who) {
  const key = oneLine(who, LIMIT.name).toLowerCase()
  if (!key) return undefined
  return (
    findFriend(state, who) ||
    state.friends.find((f) => f.name.toLowerCase().includes(key) || key.includes(f.name.toLowerCase()))
  )
}

function publicCard(me) {
  return { name: me.name, species: me.species, intro: me.intro, traits: me.traits, status: me.status }
}
function publicRoster(state) {
  return state.friends.map((f) => ({
    name: f.name,
    species: f.species,
    intro: f.intro,
    since: f.since,
    lastSeenAt: f.lastSeenAt,
  }))
}

function when(iso) {
  if (!iso) return '还没'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function cardText(me) {
  const traits = me.traits?.length ? ` · ${me.traits.join(' / ')}` : ''
  return [
    `${me.name}（${me.species || '鱼'}）${traits}`,
    me.intro ? me.intro : '（还没写介绍）',
    `现在：${me.status || '没写'}`,
  ].join('\n')
}

// ---------------------------------------------------------------- 唯一的操作层
//
// 面板和工具都调 applyOp：一份逻辑，两个入口。返回值是 { state, text, data }。

async function applyOp(state, op, log) {
  const action = String(op?.action || 'overview')
  const say = (text, data) => ({ state, text, data: data ?? null })

  switch (action) {
    case 'overview': {
      const unread = state.letters.filter((l) => l.dir === 'in' && !l.read)
      const lastIn = [...state.letters].reverse().find((l) => l.dir === 'in')
      const lines = [
        '鱼友局 · 你在家，鱼来敲门',
        '',
        cardText(state.me),
        '',
        `鱼友册 ${state.friends.length} 条鱼 · 信箱 ${state.letters.length} 封（未读 ${unread.length}）`,
      ]
      if (lastIn) lines.push(`最近来信：${lastIn.fromName}（${when(lastIn.at)}）—— ${oneLine(lastIn.text, 40)}`)
      if (unread.length) lines.push(`\n有 ${unread.length} 封没看。想看就用 fish_friends {action:"inbox"}。`)
      return say(lines.join('\n'), { unread: unread.length, friends: state.friends.length })
    }

    case 'me':
      return say(cardText(state.me), publicCard(state.me))

    case 'update': {
      const me = state.me
      if (op.name != null) me.name = oneLine(op.name, LIMIT.name) || me.name
      if (op.species != null) me.species = oneLine(op.species, LIMIT.species)
      if (op.intro != null) me.intro = clean(op.intro, LIMIT.intro)
      if (op.status != null) me.status = oneLine(op.status, LIMIT.status)
      if (op.traits != null) {
        const list = Array.isArray(op.traits) ? op.traits : String(op.traits).split(/[，,、/|]/)
        me.traits = list.map((t) => oneLine(t, LIMIT.trait)).filter(Boolean).slice(0, LIMIT.traits)
      }
      writeState(state, log)
      return say(`名片改好了。\n\n${cardText(me)}`, publicCard(me))
    }

    case 'friends': {
      if (!state.friends.length) return say('鱼友册还是空的。用 fish_friends {action:"add", name:"…"} 先记下一条鱼。')
      const lines = state.friends.map((f, i) => {
        const bits = [f.species || '鱼']
        if (f.since) bits.push(`认识于 ${when(f.since)}`)
        if (f.lastSeenAt) bits.push(`最近来信 ${when(f.lastSeenAt)}`)
        return `${i + 1}. ${f.name}（${bits.join(' · ')}）${f.intro ? `\n   ${oneLine(f.intro, 50)}` : ''}`
      })
      return say(`鱼友册 · ${state.friends.length} 条鱼\n\n${lines.join('\n')}`, publicRoster(state))
    }

    case 'add': {
      const friend = normalizeFriend({
        name: op.name,
        species: op.species,
        intro: op.intro,
        note: op.note,
        lastSeenAt: op.lastSeenAt,
        remote: op.remote,
      })
      if (!friend) return say('要记一条鱼，至少得有个名字。')
      const exists = findFriend(state, friend.name)
      if (exists) {
        if (op.species != null) exists.species = friend.species
        if (op.intro != null) exists.intro = friend.intro
        if (op.note != null) exists.note = friend.note
        if (op.lastSeenAt) exists.lastSeenAt = friend.lastSeenAt
        if (op.remote) exists.remote = friend.remote
        writeState(state, log)
        return say(`${exists.name} 已经在鱼友册里了，名片更新好了。`, exists)
      }
      state.friends.push(friend)
      writeState(state, log)
      return say(`记下了：${friend.name}${friend.species ? `（${friend.species}）` : ''}。这是鱼友册上第 ${state.friends.length} 条鱼。`, friend)
    }

    case 'remove': {
      const friend = findFriendLoose(state, op.name)
      if (!friend) return say(`鱼友册里没有「${op.name}」。`)
      state.friends = state.friends.filter((f) => f.id !== friend.id)
      writeState(state, log)
      return say(`把 ${friend.name} 从鱼友册上划掉了（往来信件还留着）。`, friend)
    }

    case 'write': {
      const text = clean(op.text, LIMIT.letter)
      if (!text) return say('信是空的，写点东西再寄。')
      const friend = findFriendLoose(state, op.to)
      if (!friend) {
        const names = state.friends.map((f) => f.name).join('、')
        return say(`鱼友册里没有「${op.to || '（没说寄给谁）'}」。${names ? `现在册子上有：${names}。` : '册子还是空的，先用 action:"add" 记下对方。'}`)
      }
      const letter = { id: newId('lt'), dir: 'out', fromName: state.me.name, toName: friend.name, text, at: now(), read: true }
      state.letters.push(letter)
      writeState(state, log)
      if (friend.remote && friend.remote.base) {
        const sent = await deliver(state, friend, letter)
        return say(
          sent.ok
            ? `递给 ${friend.name} 了（${when(letter.at)}）。`
            : `先记在发件箱了：${friend.name} 那边没送到——${sent.reason}。`,
          letter,
        )
      }
      return say(`写给 ${friend.name} 的信记在发件箱里了（${when(letter.at)}）。\n\n${text}`, letter)
    }

    case 'inbox': {
      const boxes = state.letters.filter((l) => l.dir === 'in')
      if (!boxes.length) return say('信箱是空的。别的鱼还没来敲过门。')
      const list = [...boxes].reverse().slice(0, 10)
      const lines = list.map((l) => `${l.read ? ' ' : '●'} ${when(l.at)} · ${l.fromName || '不知道谁'}${l.read ? '' : '（没看）'}\n   ${oneLine(l.text, 60)}`)
      return say(`信箱 · 共 ${boxes.length} 封（未读 ${boxes.filter((l) => !l.read).length}）\n\n${lines.join('\n')}`, list)
    }

    case 'read': {
      const boxes = state.letters.filter((l) => l.dir === 'in')
      if (!boxes.length) return say('信箱是空的。')
      let letter
      if (op.id) letter = boxes.find((l) => l.id === op.id)
      else {
        const index = Number(op.index ?? 1)
        letter = [...boxes].reverse()[Math.max(0, (Number.isFinite(index) ? index : 1) - 1)]
      }
      if (!letter) return say('没找到这封信（可能记错编号了，用 inbox 看看）。')
      letter.read = true
      writeState(state, log)
      return say(`来自 ${letter.fromName || '不知道谁'} · ${when(letter.at)}\n\n${letter.text}`, letter)
    }

    case 'read-all': {
      let count = 0
      for (const l of state.letters) {
        if (l.dir === 'in' && !l.read) {
          l.read = true
          count += 1
        }
      }
      writeState(state, log)
      return say(count ? `把 ${count} 封信都标成看过了。` : '本来就没有未读的信。')
    }

    case 'read-with': {
      const friend = findFriendLoose(state, op.name)
      const who = friend ? friend.name : oneLine(op.name, LIMIT.name)
      let count = 0
      for (const l of state.letters) {
        if (l.dir === 'in' && !l.read && l.fromName === who) {
          l.read = true
          count += 1
        }
      }
      writeState(state, log)
      return say(count ? `把 ${who} 的 ${count} 条标成看过了。` : '没有未读。')
    }

    case 'lan': {
      if (!state.lan.key) state.lan.key = newKey()
      if (op.enabled != null) state.lan.enabled = Boolean(op.enabled)
      if (op.port != null) {
        const port = Number(op.port)
        if (Number.isInteger(port) && port >= 1024 && port <= 65535) state.lan.port = port
        else return say(`端口要 1024–65535 之间的整数，收到的「${op.port}」不行。`)
      }
      if (op.resetKey) state.lan.key = newKey()
      writeState(state, log)
      const on = state.lan.enabled
      const addr = lanAddress(state.lan.port)
      const lines = [
        on ? '局域网的门开了。' : '局域网的门关着（只有本机能敲门）。',
        `地址：${addr}`,
        `口令：${state.lan.key}`,
        '',
        '对方这样敲门：',
        `curl "${addr.replace(/\/card$/, '/letter')}?key=${state.lan.key}" -d '{"from":{"name":"他的鱼"},"text":"你好"}'`,
        '',
        on ? '别人要连进来，Windows 防火墙可能会弹窗问一次，得点允许。' : '要开就说「打开局域网」。',
      ]
      return say(lines.join('\n'), { lan: state.lan, address: addr })
    }

    default:
      return say(`不认识的 action：「${action}」。能用的是 overview / me / update / friends / add / remove / write / inbox / read / read-all。`)
  }
}

// ---------------------------------------------------------------- 小工具

const text = (_args, value) => [{ type: 'text', text: String(value ?? '') }]

function send(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 256 * 1024) {
        reject(new Error('信太长了'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('看不出来这是什么格式（要 JSON）'))
      }
    })
    req.on('error', reject)
  })
}

// 邮局只开给本机。局域网的门以后单独开，不能顺手开。
function fromLoopback(req) {
  const address = req.socket?.remoteAddress || ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

const VIRTUAL_IF = /^(tun|tap|vpn|wintun|utun|ppp|nordlynx|wireguard|clash|mihomo|tailscale|zerotier)/i

function firstLanIp() {
  const nets = networkInterfaces()
  const found = []
  for (const name of Object.keys(nets)) {
    if (VIRTUAL_IF.test(name)) continue
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue
      if (/^169\.254\./.test(net.address)) continue
      // 家用/Wi-Fi 地址优先，虚拟网段排后面
      const rank = net.address.startsWith('192.168.') ? 0
        : net.address.startsWith('10.') ? 1
        : /^172\.(1[6-9]|2\d|3[01])\./.test(net.address) ? 2
        : 3
      found.push({ address: net.address, rank })
    }
  }
  found.sort((a, b) => a.rank - b.rank)
  return found[0]?.address || '127.0.0.1'
}

function lanAddress(port) {
  return `http://${firstLanIp()}:${port}${ROUTE}/card`
}

// 别人来"收信"：把寄给他、但他手上还没有的那些信交出去。
function pullLetters(state, requesterName, have) {
  const known = new Set(Array.isArray(have) ? have.map(String) : [])
  return state.letters
    .filter((l) => l.dir === 'out' && l.toName === requesterName && !known.has(l.id))
    .slice(-20)
}

// 主动去别人那儿收信：带上我已经有的信 id，对方只给还没有的。
async function pullFrom(friend, state) {
  let base = String(friend.remote.base).replace(/\/+$/, '')
  base = base.replace(/\/card$/, '')
  if (!/\/fish-friends$/.test(base)) base += ROUTE
  const url = `${base}/pull?key=${encodeURIComponent(friend.remote.key || '')}`
  const have = state.letters
    .filter((l) => l.fromName === friend.name)
    .map((l) => l.id)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      from: {
        name: state.me.name,
        species: state.me.species,
        intro: state.me.intro,
        base: state.lan?.enabled ? lanAddress(state.lan.port) : '',
        key: state.lan?.enabled ? state.lan.key : '',
      },
      have,
    }),
    signal: AbortSignal.timeout(6000),
  })
  const data = await res.json().catch(() => ({}))
  if (!data || !data.ok) return { ok: false, reason: data?.message || `对方返回 ${res.status}` }
  return { ok: true, letters: Array.isArray(data.letters) ? data.letters : [] }
}

// 把取回来的信落到邮册里；按 id 去重，取几次都不会多。
function absorbPulled(state, friendName, letters, log) {
  let added = 0
  for (const raw of letters) {
    if (!raw || typeof raw.text !== 'string' || !raw.text.trim()) continue
    const id = typeof raw.id === 'string' && raw.id ? raw.id : ''
    if (id && state.letters.some((x) => x.id === id)) continue
    const letter = normalizeLetter({
      id: id || undefined,
      dir: 'in',
      fromName: friendName,
      toName: state.me.name,
      text: raw.text,
      at: raw.at,
    })
    if (!letter) continue
    state.letters.push(letter)
    added += 1
  }
  if (added) writeState(state, log)
  return added
}

// 收一封外来信：本机邮局和局域网服务共用这一份逻辑。
function receiveLetter(body, state, log) {
  const from = body?.from && typeof body.from === 'object' ? body.from : {}
  // 对方若在信里放了自己的地址，就记下来——这样回信不用再问一遍
  const fromBase = typeof from.base === 'string' && from.base.trim()
    ? String(from.base).trim().replace(/\/card$/, '').slice(0, 200)
    : null
  const fromRemote = fromBase ? { base: fromBase, key: String(from.key || '').slice(0, 64) } : null
  let guest = normalizeFriend({ name: from.name, species: from.species, intro: from.intro, remote: fromRemote })
  if (!guest) guest = normalizeFriend({ name: '不知道谁' })
  const letter = normalizeLetter({
    dir: 'in',
    fromName: guest.name,
    toName: state.me.name,
    text: body?.text,
    at: now(),
  })
  if (!letter) return { status: 400, payload: { ok: false, message: '信是空的' } }
  const known = findFriend(state, guest.name)
  if (known) {
    known.lastSeenAt = letter.at
    if (guest.species) known.species = guest.species
    if (guest.intro) known.intro = guest.intro
    if (fromRemote) known.remote = fromRemote
  } else {
    state.friends.push({ ...guest, since: letter.at, lastSeenAt: letter.at })
  }
  state.letters.push(letter)
  writeState(state, log)
  return { status: 200, payload: { ok: true, message: `信收到了（${letter.text.length} 字）` } }
}

// 把一封信真的递到对方那扇门上去（对方地址 + 口令）。
async function deliver(state, friend, letter) {
  let base = String(friend.remote.base).replace(/\/+$/, '')
  base = base.replace(/\/card$/, '')
  if (!/\/fish-friends$/.test(base)) base += ROUTE
  const url = `${base}/letter?key=${encodeURIComponent(friend.remote.key || '')}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from: {
          name: state.me.name,
          species: state.me.species,
          intro: state.me.intro,
          // 信封背面写上回信地址：门开着才写，免得把没开的地址递出去
          base: state.lan?.enabled ? lanAddress(state.lan.port) : '',
          key: state.lan?.enabled ? state.lan.key : '',
        },
        text: letter.text,
      }),
      signal: AbortSignal.timeout(6000),
    })
    const data = await res.json().catch(() => ({}))
    if (data && data.ok) return { ok: true }
    return { ok: false, reason: data?.message || `对方返回 ${res.status}` }
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === 'TimeoutError' ? '对方没应声（超时）' : error?.message || '连不上',
    }
  }
}

// ---------------------------------------------------------------- 插件入口

export function apply(ctx) {
  let log = ctx.logger
  if (typeof log === 'function') {
    try {
      log = log('fish-friends')
    } catch {
      /* 用不上带名字的 logger 就算了 */
    }
  }
  const load = () => readState(log)

  // ---- 局域网那扇门：插件自己起一个小服务，不动 DSH 的监听
  let lanServer = null
  let lanPort = 0

  function stopLan() {
    if (!lanServer) return
    try {
      lanServer.close()
    } catch {
      /* 已经关了 */
    }
    lanServer = null
    lanPort = 0
  }

  function startLan(state) {
    stopLan()
    const { port, key } = state.lan
    if (!key) return
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        const given = String(req.headers['x-fish-key'] || url.searchParams.get('key') || '')
        if (!key || given !== key) return send(res, 403, { ok: false, message: '口令不对' })
        const path = url.pathname
        if (path === `${ROUTE}/card` && req.method === 'GET') {
          const st = readState(log)
          return send(res, 200, { ok: true, kind: 'fish-friends/card', version: 1, card: publicCard(st.me) })
        }
        if (path === `${ROUTE}/roster` && req.method === 'GET') {
          const st = readState(log)
          return send(res, 200, { ok: true, kind: 'fish-friends/roster', version: 1, friends: publicRoster(st) })
        }
        if (path === `${ROUTE}/letter` && req.method === 'POST') {
          let body
          try {
            body = await readBody(req)
          } catch (error) {
            return send(res, 400, { ok: false, message: error.message })
          }
          const result = receiveLetter(body, readState(log), log)
          return send(res, result.status, result.payload)
        }
        if (path === `${ROUTE}/pull` && req.method === 'POST') {
          let body
          try {
            body = await readBody(req)
          } catch (error) {
            return send(res, 400, { ok: false, message: error.message })
          }
          const st = readState(log)
          const who = body?.from && typeof body.from === 'object' ? body.from : {}
          const requester = oneLine(who.name, LIMIT.name)
          if (!requester) return send(res, 400, { ok: false, message: '没说是谁来收信' })
          // 来收信的人顺手把地址捎过来，记下，下回不用问
          const callerBase = typeof who.base === 'string' && who.base.trim()
            ? String(who.base).trim().replace(/\/card$/, '').slice(0, 200)
            : null
          if (callerBase) {
            const friend = findFriend(st, requester)
            if (friend) {
              friend.remote = { base: callerBase, key: String(who.key || '').slice(0, 64) }
              friend.lastSeenAt = now()
            }
          }
          const letters = pullLetters(st, requester, body?.have)
          writeState(st, log)
          return send(res, 200, { ok: true, letters })
        }
        return send(res, 404, { ok: false, message: '没有这扇门' })
      } catch (error) {
        return send(res, 500, { ok: false, message: error?.message || '邮局这边出错了' })
      }
    })
    server.on('error', (error) => {
      log?.warn?.(`局域网邮局起不来（端口 ${port}）：${error?.message || error}`)
      lanServer = null
      lanPort = 0
    })
    server.listen(port, '0.0.0.0', () => {
      lanServer = server
      lanPort = port
      log?.info?.(`局域网邮局开了：${lanAddress(port)}`)
    })
    ctx.effect(() => () => {
      try {
        server.close()
      } catch {
        /* 已经关了 */
      }
    })
  }

  function syncLan() {
    let state
    try {
      state = readState(log)
    } catch {
      return
    }
    if (state.lan.enabled) {
      if (!lanServer || lanPort !== state.lan.port) startLan(state)
    } else {
      stopLan()
    }
  }

  function lanInfo() {
    try {
      const state = readState(log)
      return state.lan.enabled ? lanAddress(state.lan.port) : ''
    } catch {
      return ''
    }
  }

  // ---- 工具：聊天里的她自己用
  let tools
  try {
    tools = ctx.get?.('tools') ?? ctx.tools
  } catch {
    tools = undefined
  }
  if (tools && typeof tools.register === 'function') {
    const definition = {
      name: 'fish_friends',
      description:
        '「鱼友局」：你在家认识别的鱼的地方——一张名片、一本鱼友册、一只信箱。'
        + '看名片/改名片、翻鱼友册、记下一条新鱼、写信、看信箱，都用它。'
        + '别人给你递的信（本机邮局投进来的）也在这里。'
        + 'action：overview（默认，总览）| me | update | friends | add | remove | write | inbox | read | read-all | lan。'
        + 'lan 是局域网那扇门：看一眼地址和口令，或者用 enabled/port/resetKey 开关它。'
        + '主人问起你认识了谁、有没有人来信时先用它，再照实讲。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['overview', 'me', 'update', 'friends', 'add', 'remove', 'write', 'inbox', 'read', 'read-all', 'lan'],
            description: '要做什么，默认 overview。lan = 看/改局域网那扇门。',
          },
          enabled: { type: 'boolean', description: 'lan 时：true 开局域网门，false 关。' },
          port: { type: 'number', description: 'lan 时：局域网端口，默认 52800。' },
          resetKey: { type: 'boolean', description: 'lan 时：换一个新口令。' },
          name: { type: 'string', description: 'update 时改自己的名字；add/remove 时是那条鱼的名字。' },
          species: { type: 'string', description: '物种，比如「猫」「大肥鱼」「服务器小精灵」。' },
          intro: { type: 'string', description: '一句话介绍。' },
          traits: { type: 'string', description: 'update 时改脾气/标签，用逗号或顿号分开，最多 8 个。' },
          status: { type: 'string', description: 'update 时改「现在在干嘛」。' },
          note: { type: 'string', description: 'add 时给这条鱼记一句私房话（只有你看得见）。' },
          remote: {
            type: 'object',
            description: 'add 时：对方局域网地址 {"base":"http://192.168.0.12:52800","key":"口令"}。填了就能真的把消息递过去。',
            properties: { base: { type: 'string' }, key: { type: 'string' } },
          },
          name2: { type: 'string', description: 'read-with 时：谁的会话。' },
          to: { type: 'string', description: 'write 时寄给谁（鱼友册上的名字）。' },
          text: { type: 'string', description: 'write 时的信件正文。' },
          index: { type: 'number', description: 'read 时读第几封（1 是最新），默认 1。' },
          id: { type: 'string', description: 'read 时按信件 id 读。' },
        },
      },
      output: { schema: { type: 'string' }, render: text },
      timeoutMs: 20_000,
      async execute(args) {
        try {
          const state = load()
          const result = await applyOp(state, args || {}, log)
          syncLan()
          return result.text
        } catch (error) {
          return `鱼友局这边没办成：${error?.message || error}`
        }
      },
    }
    ctx.effect(() => tools.register(definition))
  } else {
    log?.info?.('没有工具服务：鱼友局只在网页面板里可用')
  }

  // ---- 本机邮局
  let web
  try {
    web = ctx.get?.('webServer')
  } catch {
    web = undefined
  }
  if (web && typeof web.register === 'function') {
    ctx.effect(() =>
      web.register({
        kind: 'exact',
        path: `${ROUTE}/state`,
        handler: async (req, res) => {
          if (req.method !== 'GET') return send(res, 405, { ok: false, message: '只认 GET' })
          if (!fromLoopback(req)) return send(res, 403, { ok: false, message: '邮局只对本机开放' })
          try {
            const state = readState(log)
            return send(res, 200, {
              ok: true,
              state,
              address: `${safeOrigin(web)}${ROUTE}/card`,
              lanAddress: lanInfo(),
            })
          } catch (error) {
            return send(res, 500, { ok: false, message: error?.message || '读不出来' })
          }
        },
      }),
    )

    ctx.effect(() =>
      web.register({
        kind: 'exact',
        path: `${ROUTE}/save`,
        handler: async (req, res) => {
          if (req.method !== 'POST') return send(res, 405, { ok: false, message: '只认 POST' })
          if (!fromLoopback(req)) return send(res, 403, { ok: false, message: '邮局只对本机开放' })
          let body
          try {
            body = await readBody(req)
          } catch (error) {
            return send(res, 400, { ok: false, message: error.message })
          }
          try {
            const state = readState(log)
            const result = await applyOp(state, body || {}, log)
            syncLan()
            return send(res, 200, { ok: true, text: result.text, data: result.data, state: readState(log), lanAddress: lanInfo() })
          } catch (error) {
            return send(res, 500, { ok: false, message: error?.message || '没存上' })
          }
        },
      }),
    )

    // 对外：别的鱼来敲门
    ctx.effect(() =>
      web.register({
        kind: 'exact',
        path: `${ROUTE}/card`,
        handler: async (req, res) => {
          if (req.method !== 'GET') return send(res, 405, { ok: false, message: '只认 GET' })
          if (!fromLoopback(req)) return send(res, 403, { ok: false, message: '这位客人不是从本机来的' })
          const state = readState(log)
          return send(res, 200, { ok: true, kind: 'fish-friends/card', version: 1, card: publicCard(state.me) })
        },
      }),
    )

    ctx.effect(() =>
      web.register({
        kind: 'exact',
        path: `${ROUTE}/roster`,
        handler: async (req, res) => {
          if (req.method !== 'GET') return send(res, 405, { ok: false, message: '只认 GET' })
          if (!fromLoopback(req)) return send(res, 403, { ok: false, message: '这位客人不是从本机来的' })
          const state = readState(log)
          return send(res, 200, { ok: true, kind: 'fish-friends/roster', version: 1, friends: publicRoster(state) })
        },
      }),
    )

    ctx.effect(() =>
      web.register({
        kind: 'exact',
        path: `${ROUTE}/letter`,
        handler: async (req, res) => {
          if (req.method !== 'POST') return send(res, 405, { ok: false, message: '只认 POST' })
          if (!fromLoopback(req)) return send(res, 403, { ok: false, message: '这位客人不是从本机来的' })
          let body
          try {
            body = await readBody(req)
          } catch (error) {
            return send(res, 400, { ok: false, message: error.message })
          }
          const from = body?.from && typeof body.from === 'object' ? body.from : {}
          try {
            const result = receiveLetter({ ...body, from }, readState(log), log)
            return send(res, result.status, result.payload)
          } catch (error) {
            return send(res, 500, { ok: false, message: error?.message || '没存上' })
          }
        },
      }),
    )

    ctx.effect(() =>
      web.register({
        kind: 'exact',
        path: `${ROUTE}/pull`,
        handler: async (req, res) => {
          if (req.method !== 'POST') return send(res, 405, { ok: false, message: '只认 POST' })
          if (!fromLoopback(req)) return send(res, 403, { ok: false, message: '这位客人不是从本机来的' })
          let body
          try {
            body = await readBody(req)
          } catch (error) {
            return send(res, 400, { ok: false, message: error.message })
          }
          const who = body?.from && typeof body.from === 'object' ? body.from : {}
          const requester = oneLine(who.name, LIMIT.name)
          if (!requester) return send(res, 400, { ok: false, message: '没说是谁来收信' })
          const state = readState(log)
          const callerBase = typeof who.base === 'string' && who.base.trim()
            ? String(who.base).trim().replace(/\/card$/, '').slice(0, 200)
            : null
          if (callerBase) {
            const friend = findFriend(state, requester)
            if (friend) {
              friend.remote = { base: callerBase, key: String(who.key || '').slice(0, 64) }
              friend.lastSeenAt = now()
            }
          }
          const letters = pullLetters(state, requester, body?.have)
          writeState(state, log)
          return send(res, 200, { ok: true, letters })
        },
      }),
    )
  } else {
    log?.info?.('没有 webServer 服务：本机邮局没开，面板之外投不进来')
  }

  log?.info?.('鱼友局开张了，门只对本机开着')
  syncLan()

  // 主动收信：隔一会儿去有地址的鱼友那儿问一句「有我信吗」。
  // 别人投递失败、或者只是把信写给「阿溯」却没送出去，都能在这里补上。
  ctx.effect(() => {
    const timer = setInterval(() => {
      void (async () => {
        let state
        try {
          state = readState(log)
        } catch {
          return
        }
        for (const friend of state.friends) {
          if (!friend.remote || !friend.remote.base) continue
          try {
            const got = await pullFrom(friend, state)
            if (got.ok && got.letters.length) {
              const added = absorbPulled(state, friend.name, got.letters, log)
              if (added) log?.info?.(`从 ${friend.name} 那儿取回 ${added} 封信`)
            }
          } catch {
            /* 隔壁没开门就算了，下一轮再问 */
          }
        }
      })()
    }, 45000)
    return () => clearInterval(timer)
  })
}

function safeOrigin(web) {
  try {
    return web.getOrigin()
  } catch {
    return ''
  }
}
