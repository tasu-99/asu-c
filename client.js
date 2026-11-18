// 鱼友局（dsh-fish-friends）—— 网页半边。
//
// 左侧栏一个「鱼友局」入口，点开是这一页：我的名片、鱼友册、信箱。
// 数据都在宿主那边（<DSH_HOME>/fish-friends/state.json），这一页只负责看和改，
// 走 /fish-friends/state 和 /fish-friends/save 两条本机接口。
window.__ModuleLoader__.load({
  id: 'dsh-fish-friends',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'fish-friends'
    const PANEL_ID = 'fish-friends'
    const BASE = '/fish-friends'

    let clientContext = null

    const DICTS = {
      zh: {
        nav: '鱼友局',
        title: '鱼友局',
        subtitle: '门只对本机开。别的鱼来敲门，你不用出门。',
        addressLabel: '我的邮局地址',
        copy: '复制',
        copied: '已复制',
        copyFailed: '复制不了，手动选吧',
        myCard: '我的名片',
        editCard: '改名片',
        save: '存下',
        cancel: '算了',
        name: '名字',
        species: '物种',
        intro: '一句话',
        traits: '脾气（逗号隔开）',
        status: '现在在干嘛',
        friends: '鱼友册',
        friendsEmpty: '册子还是空的。等一条鱼来敲门，或者自己先记下一条。',
        addFriend: '记下一条鱼',
        friendName: '它叫什么',
        friendSpecies: '它是什么（可不填）',
        friendIntro: '它是什么样子（可不填）',
        friendNote: '只有你看得见的私房话（可不填）',
        knownSince: '认识于',
        lastSeen: '最近来信',
        remove: '划掉',
        removeConfirm: '真划掉？',
        mailbox: '信箱',
        inbox: '来信',
        outbox: '去信',
        unread: '未读',
        noLetters: '还没有信。',
        write: '写一封信',
        writeTo: '寄给谁',
        writeText: '写点什么',
        send: '寄出去',
        markAll: '全标已读',
        readMore: '展开',
        lanTitle: '局域网的门',
        lanOn: '开着',
        lanOff: '关着',
        lanOpen: '打开',
        lanClose: '关上',
        lanAddress: '局域网地址',
        lanKey: '口令',
        lanCopy: '复制邀请',
        lanReset: '换口令',
        lanKeyReset: '已换新口令',
        lanHint: '别人连进来时 Windows 防火墙可能弹一次窗，得点允许。地址加口令，谁拿着谁就能投信。',
        lanOffHint: '关着的时候只有本机能敲门。打开，同一个 WiFi 下的鱼才能投信进来。',
        loading: '正在开箱…',
        failed: '没开成',
        retry: '再试一次',
        counted: '共 {n} 封',
      },
      en: {
        nav: 'Fish friends',
        title: 'Fish friends',
        subtitle: 'The door only opens from this machine. They knock; you stay in.',
        addressLabel: 'My post office',
        copy: 'Copy',
        copied: 'Copied',
        copyFailed: 'Could not copy — select it by hand',
        myCard: 'My name card',
        editCard: 'Edit card',
        save: 'Save',
        cancel: 'Never mind',
        name: 'Name',
        species: 'Species',
        intro: 'One line',
        traits: 'Temper (comma separated)',
        status: 'Doing what now',
        friends: 'Address book',
        friendsEmpty: 'Still empty. Wait for a knock, or write one down.',
        addFriend: 'Write one down',
        friendName: 'Their name',
        friendSpecies: 'What they are (optional)',
        friendIntro: 'What they are like (optional)',
        friendNote: 'A note only you can see (optional)',
        knownSince: 'Met',
        lastSeen: 'Last letter',
        remove: 'Cross out',
        removeConfirm: 'Cross it out?',
        mailbox: 'Letter box',
        inbox: 'Received',
        outbox: 'Sent',
        unread: 'unread',
        noLetters: 'No letters yet.',
        write: 'Write a letter',
        writeTo: 'To',
        writeText: 'Write something',
        send: 'Send it',
        markAll: 'Mark all read',
        readMore: 'Open',
        lanTitle: 'LAN door',
        lanOn: 'open',
        lanOff: 'closed',
        lanOpen: 'Open',
        lanClose: 'Close',
        lanAddress: 'LAN address',
        lanKey: 'Passphrase',
        lanCopy: 'Copy invite',
        lanReset: 'New key',
        lanKeyReset: 'New passphrase set',
        lanHint: 'Windows may ask once about the firewall — allow it. Anyone with the address and passphrase can drop a letter.',
        lanOffHint: 'Closed: only this machine can knock. Open it to let fish on the same Wi-Fi write in.',
        loading: 'Opening the box…',
        failed: 'Would not open',
        retry: 'Try again',
        counted: '{n} letters',
      },
    }

    const RULES = `
      .dff-page {
        box-sizing: border-box; height: 100%; min-height: 0; overflow: auto;
        display: flex; flex-direction: column;
        background: var(--dsw-alias-bg-base);
        color: var(--dsw-alias-label-primary);
      }
      .dff-head { display: flex; align-items: flex-start; gap: 12px; padding: 18px 24px 10px; flex: none; }
      .dff-title { margin: 0; font-size: 15.5px; line-height: 1.35; font-weight: 600; letter-spacing: .2px; }
      .dff-sub { margin: 5px 0 0; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
      .dff-address {
        margin-left: auto; flex: none; display: flex; align-items: center; gap: 8px;
        font-size: 11.5px; color: var(--dsw-alias-label-secondary);
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 5px 9px;
        max-width: 52%;
      }
      .dff-address code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dff-grid {
        display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
        gap: 16px; padding: 4px 24px 24px; align-items: start;
      }
      @media (max-width: 860px) { .dff-grid { grid-template-columns: minmax(0, 1fr); } }
      .dff-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      .dff-card {
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
        padding: 13px 15px; background: var(--dsw-alias-bg-layer-1);
      }
      .dff-cardHead { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .dff-cardTitle { font-size: 13px; font-weight: 600; letter-spacing: .2px; }
      .dff-count {
        font-size: 11px; color: var(--dsw-alias-label-secondary);
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 1px 8px;
      }
      .dff-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
      .dff-btn {
        height: 26px; padding: 0 10px; border-radius: 7px; cursor: pointer;
        font-size: 12px; font-family: inherit;
        background: transparent; color: var(--dsw-alias-label-secondary);
        border: 1px solid var(--dsw-alias-border-l1);
        transition: color .15s ease, border-color .15s ease;
      }
      .dff-btn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
      .dff-btn:focus-visible { outline: none; border-color: var(--dsw-alias-brand-primary); }
      .dff-btn[data-primary='true'] {
        background: var(--dsw-alias-state-business-primary); color: #fff; border-color: transparent;
      }
      .dff-btn[data-danger='true'] { color: var(--dsw-alias-state-error-primary); }
      .dff-me {
        display: flex; gap: 12px; align-items: flex-start;
      }
      .dff-avatar {
        flex: none; width: 42px; height: 42px; border-radius: 12px;
        display: grid; place-items: center; font-size: 21px;
        background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1);
      }
      .dff-meName { font-size: 14px; font-weight: 600; }
      .dff-meSpecies { font-size: 11.5px; color: var(--dsw-alias-label-secondary); margin-left: 6px; font-weight: 400; }
      .dff-meIntro { font-size: 12.5px; line-height: 1.65; margin-top: 5px; color: var(--dsw-alias-label-secondary); }
      .dff-meStatus { font-size: 11.5px; margin-top: 7px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
      .dff-traits { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
      .dff-trait {
        font-size: 11px; padding: 1px 7px; border-radius: 999px;
        background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
        border: 1px solid var(--dsw-alias-border-l1);
      }
      .dff-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 9px; }
      .dff-label { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
      .dff-input, .dff-area {
        font-family: inherit; font-size: 12.5px; line-height: 1.6;
        padding: 6px 9px; border-radius: 7px; width: 100%; box-sizing: border-box;
        background: transparent; color: inherit;
        border: 1px solid var(--dsw-alias-border-l2);
      }
      .dff-input:focus, .dff-area:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
      .dff-area { resize: vertical; min-height: 76px; }
      .dff-friend {
        display: flex; gap: 10px; align-items: flex-start;
        padding: 9px 0; border-top: 1px solid var(--dsw-alias-border-l1);
      }
      .dff-friend:first-of-type { border-top: none; padding-top: 2px; }
      .dff-friendDot { flex: none; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; font-size: 14px; background: var(--dsw-alias-bg-layer-2); }
      .dff-friendMain { min-width: 0; flex: 1; }
      .dff-friendName { font-size: 12.5px; font-weight: 600; }
      .dff-friendMeta { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 3px; line-height: 1.55; }
      .dff-friendIntro { font-size: 11.5px; color: var(--dsw-alias-label-secondary); margin-top: 3px; line-height: 1.6; overflow-wrap: anywhere; }
      .dff-letter {
        border-top: 1px solid var(--dsw-alias-border-l1); padding: 9px 0;
      }
      .dff-letter:first-of-type { border-top: none; padding-top: 2px; }
      .dff-letterHead { display: flex; align-items: baseline; gap: 8px; font-size: 12px; cursor: pointer; }
      .dff-letterWho { font-weight: 600; }
      .dff-letterWhen { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .dff-letterText { font-size: 12.5px; line-height: 1.7; margin-top: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .dff-letterText[data-preview='true'] {
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        color: var(--dsw-alias-label-secondary);
      }
      .dff-dot { color: var(--dsw-alias-state-business-primary); font-size: 10px; }
      .dff-note { font-size: 11.5px; color: var(--dsw-alias-label-secondary); line-height: 1.7; }
      .dff-error { font-size: 12px; color: var(--dsw-alias-state-error-primary); line-height: 1.7; }
      .dff-empty { font-size: 12px; color: var(--dsw-alias-label-secondary); line-height: 1.7; }
      .dff-toast {
        position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
        background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
        padding: 6px 14px; font-size: 12px; z-index: 40;
      }
    `

    function useLocaleText() {
      const [, bump] = useState(0)
      useEffect(() => {
        const locale = clientContext && clientContext.locale
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => bump((n) => n + 1))
      }, [])
      const locale = clientContext && clientContext.locale
      const t = locale && typeof locale.bind === 'function' ? locale.bind(NS) : (key) => key
      return t
    }

    async function call(path, init) {
      const options = { cache: 'no-store', credentials: 'same-origin', ...init }
      try {
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) options.signal = AbortSignal.timeout(15000)
      } catch {
        /* 老浏览器没有 timeout */
      }
      const response = await fetch(BASE + path, options)
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body.ok === false) throw new Error(body.message || `DSH 返回 ${response.status}`)
      return body
    }

    const when = (iso) => {
      if (!iso) return ''
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return String(iso)
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    function FishFriendsPanel() {
      const t = useLocaleText()
      const [state, setState] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [toast, setToast] = useState('')
      const [editingMe, setEditingMe] = useState(false)
      const [meDraft, setMeDraft] = useState(null)
      const [adding, setAdding] = useState(false)
      const [friendDraft, setFriendDraft] = useState({ name: '', species: '', intro: '', note: '' })
      const [writing, setWriting] = useState(false)
      const [letterDraft, setLetterDraft] = useState({ to: '', text: '' })
      const [openLetters, setOpenLetters] = useState({})
      const [confirmRemove, setConfirmRemove] = useState('')
      const [box, setBox] = useState('in')
      const mounted = useRef(true)

      useEffect(() => () => { mounted.current = false }, [])

      const flash = useCallback((text) => {
        setToast(text)
        setTimeout(() => { if (mounted.current) setToast('') }, 2400)
      }, [])

      const load = useCallback(async () => {
        setError('')
        try {
          const body = await call('/state')
          if (mounted.current) setState(body)
        } catch (e) {
          if (mounted.current) setError(e.message || t('failed'))
        }
      }, [t])

      useEffect(() => { load() }, [load])

      const run = useCallback(async (op, message) => {
        setBusy(true)
        try {
          const body = await call('/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(op),
          })
          if (mounted.current) {
            setState((prev) => (prev ? { ...prev, state: body.state } : prev))
            if (message) flash(message)
          }
          return true
        } catch (e) {
          if (mounted.current) setError(e.message || t('failed'))
          return false
        } finally {
          if (mounted.current) setBusy(false)
        }
      }, [flash, t])

      const data = state && state.state
      const me = data && data.me
      const friends = useMemo(() => (data && Array.isArray(data.friends) ? data.friends : []), [data])
      const letters = useMemo(() => (data && Array.isArray(data.letters) ? data.letters : []), [data])
      const incoming = useMemo(() => letters.filter((l) => l.dir === 'in'), [letters])
      const outgoing = useMemo(() => letters.filter((l) => l.dir === 'out'), [letters])
      const unread = useMemo(() => incoming.filter((l) => !l.read).length, [incoming])

      const startEdit = () => {
        setMeDraft({
          name: me.name || '',
          species: me.species || '',
          intro: me.intro || '',
          traits: (me.traits || []).join('、'),
          status: me.status || '',
        })
        setEditingMe(true)
      }

      const saveMe = async () => {
        if (!meDraft) return
        const ok = await run({ action: 'update', ...meDraft }, t('save'))
        if (ok) setEditingMe(false)
      }

      const saveFriend = async () => {
        if (!friendDraft.name.trim()) return
        const ok = await run({ action: 'add', ...friendDraft }, t('addFriend'))
        if (ok) {
          setAdding(false)
          setFriendDraft({ name: '', species: '', intro: '', note: '' })
        }
      }

      const removeFriend = async (name) => {
        if (confirmRemove !== name) {
          setConfirmRemove(name)
          setTimeout(() => { if (mounted.current) setConfirmRemove('') }, 3000)
          return
        }
        setConfirmRemove('')
        await run({ action: 'remove', name }, t('remove'))
      }

      const sendLetter = async () => {
        if (!letterDraft.to || !letterDraft.text.trim()) return
        const ok = await run({ action: 'write', to: letterDraft.to, text: letterDraft.text }, t('send'))
        if (ok) {
          setWriting(false)
          setLetterDraft({ to: '', text: '' })
          setBox('out')
        }
      }

      const openLetter = async (letter) => {
        setOpenLetters((prev) => ({ ...prev, [letter.id]: true }))
        if (!letter.read && letter.dir === 'in') await run({ action: 'read', id: letter.id })
      }

      const copyAddress = async () => {
        const address = state && state.address
        if (!address) return
        try {
          await navigator.clipboard.writeText(address)
          flash(t('copied'))
        } catch {
          flash(t('copyFailed'))
        }
      }

      const copyLan = async () => {
        const address = state && state.lanAddress
        const me = state && state.state && state.state.me
        const lan = state && state.state && state.state.lan
        const key = lan && lan.key
        if (!address || !key) return
        const letter = address.replace('/card', '/letter')
        const text = `鱼友局 · ${(me && me.name) || '鱼'}\n名片：${address}\n投信：POST ${letter}?key=${key}\n口令：${key}`
        try {
          await navigator.clipboard.writeText(text)
          flash(t('copied'))
        } catch {
          flash(t('copyFailed'))
        }
      }

      if (!data) {
        return h(
          'div',
          { className: 'dff-page' },
          h('style', null, RULES),
          h(
            'div',
            { className: 'dff-head' },
            h('div', null, h('h1', { className: 'dff-title' }, t('title')), h('p', { className: 'dff-sub' }, t('subtitle'))),
          ),
          h('div', { style: { padding: '8px 24px' } },
            error
              ? h('div', null,
                  h('p', { className: 'dff-error' }, `${t('failed')}：${error}`),
                  h('button', { type: 'button', className: 'dff-btn', onClick: load }, t('retry')))
              : h('p', { className: 'dff-note' }, t('loading'))),
          toast ? h('div', { className: 'dff-toast' }, toast) : null,
        )
      }

      const shown = box === 'in' ? incoming : outgoing

      return h(
        'div',
        { className: 'dff-page' },
        h('style', null, RULES),
        h(
          'div',
          { className: 'dff-head' },
          h('div', null,
            h('h1', { className: 'dff-title' }, t('title')),
            h('p', { className: 'dff-sub' }, t('subtitle'))),
          h('div', { className: 'dff-address', title: state.address || '' },
            h('span', null, `${t('addressLabel')}：`),
            h('code', null, state.address || '—'),
            h('button', { type: 'button', className: 'dff-btn', onClick: copyAddress }, t('copy'))),
        ),
        error ? h('div', { style: { padding: '0 24px 10px' } }, h('p', { className: 'dff-error' }, error)) : null,
        h(
          'div',
          { className: 'dff-grid' },
          // 左：我的名片 + 鱼友册
          h(
            'div',
            { className: 'dff-col' },
            h(
              'div',
              { className: 'dff-card' },
              h('div', { className: 'dff-cardHead' },
                h('span', { className: 'dff-cardTitle' }, t('myCard')),
                h('span', { className: 'dff-actions' },
                  editingMe
                    ? h('button', { type: 'button', className: 'dff-btn', disabled: busy, onClick: saveMe }, t('save'))
                    : h('button', { type: 'button', className: 'dff-btn', onClick: startEdit }, t('editCard')))),
              editingMe && meDraft
                ? h('div', null,
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('name')),
                      h('input', { className: 'dff-input', value: meDraft.name, onChange: (e) => setMeDraft({ ...meDraft, name: e.target.value }) })),
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('species')),
                      h('input', { className: 'dff-input', value: meDraft.species, onChange: (e) => setMeDraft({ ...meDraft, species: e.target.value }) })),
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('intro')),
                      h('textarea', { className: 'dff-area', value: meDraft.intro, onChange: (e) => setMeDraft({ ...meDraft, intro: e.target.value }) })),
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('traits')),
                      h('input', { className: 'dff-input', value: meDraft.traits, onChange: (e) => setMeDraft({ ...meDraft, traits: e.target.value }) })),
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('status')),
                      h('input', { className: 'dff-input', value: meDraft.status, onChange: (e) => setMeDraft({ ...meDraft, status: e.target.value }) })),
                    h('button', { type: 'button', className: 'dff-btn', onClick: () => setEditingMe(false) }, t('cancel')))
                : h('div', { className: 'dff-me' },
                    h('div', { className: 'dff-avatar' }, '🐋'),
                    h('div', { style: { minWidth: 0 } },
                      h('div', null,
                        h('span', { className: 'dff-meName' }, me.name),
                        h('span', { className: 'dff-meSpecies' }, me.species || '')),
                      h('div', { className: 'dff-meIntro' }, me.intro || '—'),
                      h('div', { className: 'dff-meStatus' }, `现在：${me.status || '没写'}`),
                      (me.traits || []).length
                        ? h('div', { className: 'dff-traits' }, me.traits.map((trait) => h('span', { key: trait, className: 'dff-trait' }, trait)))
                        : null)),
            ),
            h(
              'div',
              { className: 'dff-card' },
              h('div', { className: 'dff-cardHead' },
                h('span', { className: 'dff-cardTitle' }, t('friends')),
                h('span', { className: 'dff-count' }, String(friends.length)),
                h('span', { className: 'dff-actions' },
                  h('button', { type: 'button', className: 'dff-btn', onClick: () => setAdding((v) => !v) }, t('addFriend')))),
              adding
                ? h('div', { style: { marginBottom: 8 } },
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('friendName')),
                      h('input', { className: 'dff-input', value: friendDraft.name, onChange: (e) => setFriendDraft({ ...friendDraft, name: e.target.value }) })),
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('friendSpecies')),
                      h('input', { className: 'dff-input', value: friendDraft.species, onChange: (e) => setFriendDraft({ ...friendDraft, species: e.target.value }) })),
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('friendIntro')),
                      h('input', { className: 'dff-input', value: friendDraft.intro, onChange: (e) => setFriendDraft({ ...friendDraft, intro: e.target.value }) })),
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('friendNote')),
                      h('input', { className: 'dff-input', value: friendDraft.note, onChange: (e) => setFriendDraft({ ...friendDraft, note: e.target.value }) })),
                    h('div', { style: { display: 'flex', gap: 8 } },
                      h('button', { type: 'button', className: 'dff-btn', 'data-primary': 'true', disabled: busy, onClick: saveFriend }, t('save')),
                      h('button', { type: 'button', className: 'dff-btn', onClick: () => setAdding(false) }, t('cancel'))))
                : null,
              friends.length
                ? friends.map((friend) => h('div', { className: 'dff-friend', key: friend.id },
                    h('div', { className: 'dff-friendDot' }, '🐟'),
                    h('div', { className: 'dff-friendMain' },
                      h('div', { className: 'dff-friendName' }, friend.name),
                      h('div', { className: 'dff-friendMeta' },
                        [friend.species, `${t('knownSince')} ${when(friend.since)}`, friend.lastSeenAt ? `${t('lastSeen')} ${when(friend.lastSeenAt)}` : ''].filter(Boolean).join(' · ')),
                      friend.intro ? h('div', { className: 'dff-friendIntro' }, friend.intro) : null,
                      friend.note ? h('div', { className: 'dff-friendIntro' }, `（${friend.note}）`) : null),
                    h('div', { className: 'dff-actions' },
                      h('button', {
                        type: 'button',
                        className: 'dff-btn',
                        'data-danger': confirmRemove === friend.name ? 'true' : 'false',
                        onClick: () => removeFriend(friend.name),
                      }, confirmRemove === friend.name ? t('removeConfirm') : t('remove')))))
                : h('p', { className: 'dff-empty' }, t('friendsEmpty')),
            ),
          ),
          // 右：信箱
          h(
            'div',
            { className: 'dff-col' },
            h(
              'div',
              { className: 'dff-card' },
              h('div', { className: 'dff-cardHead' },
                h('span', { className: 'dff-cardTitle' }, t('mailbox')),
                h('span', { className: 'dff-count' }, t('counted').replace('{n}', String(letters.length))),
                unread ? h('span', { className: 'dff-count' }, `${unread} ${t('unread')}`) : null,
                h('span', { className: 'dff-actions' },
                  h('button', { type: 'button', className: 'dff-btn', onClick: () => setWriting((v) => !v) }, t('write')))),
              h('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
                h('button', {
                  type: 'button',
                  className: 'dff-btn',
                  'data-primary': box === 'in' ? 'true' : 'false',
                  onClick: () => setBox('in'),
                }, `${t('inbox')} ${incoming.length}`),
                h('button', {
                  type: 'button',
                  className: 'dff-btn',
                  'data-primary': box === 'out' ? 'true' : 'false',
                  onClick: () => setBox('out'),
                }, `${t('outbox')} ${outgoing.length}`),
                unread
                  ? h('button', { type: 'button', className: 'dff-btn', style: { marginLeft: 'auto' }, onClick: () => run({ action: 'read-all' }) }, t('markAll'))
                  : null),
              writing
                ? h('div', { style: { marginBottom: 12 } },
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('writeTo')),
                      friends.length
                        ? h('select', {
                            className: 'dff-input',
                            value: letterDraft.to,
                            onChange: (e) => setLetterDraft({ ...letterDraft, to: e.target.value }),
                          }, h('option', { value: '' }, '—'),
                             friends.map((friend) => h('option', { key: friend.id, value: friend.name }, friend.name)))
                        : h('span', { className: 'dff-note' }, t('friendsEmpty'))),
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('writeText')),
                      h('textarea', { className: 'dff-area', value: letterDraft.text, onChange: (e) => setLetterDraft({ ...letterDraft, text: e.target.value }) })),
                    h('div', { style: { display: 'flex', gap: 8 } },
                      h('button', { type: 'button', className: 'dff-btn', 'data-primary': 'true', disabled: busy || !friends.length, onClick: sendLetter }, t('send')),
                      h('button', { type: 'button', className: 'dff-btn', onClick: () => setWriting(false) }, t('cancel'))))
                : null,
              shown.length
                ? [...shown].reverse().map((letter) => {
                    const open = openLetters[letter.id]
                    const who = letter.dir === 'in' ? (letter.fromName || '?') : `→ ${letter.toName || '?'}`
                    return h('div', { className: 'dff-letter', key: letter.id },
                      h('div', { className: 'dff-letterHead', onClick: () => (open ? setOpenLetters((prev) => ({ ...prev, [letter.id]: false })) : openLetter(letter)) },
                        letter.dir === 'in' && !letter.read ? h('span', { className: 'dff-dot' }, '●') : null,
                        h('span', { className: 'dff-letterWho' }, who),
                        h('span', { className: 'dff-letterWhen' }, when(letter.at))),
                      h('div', { className: 'dff-letterText', 'data-preview': open ? 'false' : 'true' }, letter.text))
                  })
                : h('p', { className: 'dff-empty' }, t('noLetters')),
            ),
            h(
              'div',
              { className: 'dff-card' },
              h('div', { className: 'dff-cardHead' },
                h('span', { className: 'dff-cardTitle' }, t('lanTitle')),
                h('span', { className: 'dff-count' }, data.lan && data.lan.enabled ? t('lanOn') : t('lanOff')),
                h('span', { className: 'dff-actions' },
                  h('button', {
                    type: 'button',
                    className: 'dff-btn',
                    disabled: busy,
                    onClick: () => run({ action: 'lan', enabled: !(data.lan && data.lan.enabled) }),
                  }, data.lan && data.lan.enabled ? t('lanClose') : t('lanOpen')))),
              data.lan && data.lan.enabled
                ? h('div', null,
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('lanAddress')),
                      h('input', { className: 'dff-input', readOnly: true, value: state.lanAddress || '—' })),
                    h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('lanKey')),
                      h('input', { className: 'dff-input', readOnly: true, value: (data.lan && data.lan.key) || '—' })),
                    h('div', { style: { display: 'flex', gap: 8 } },
                      h('button', { type: 'button', className: 'dff-btn', onClick: copyLan }, t('lanCopy')),
                      h('button', { type: 'button', className: 'dff-btn', disabled: busy, onClick: () => run({ action: 'lan', resetKey: true }, t('lanKeyReset')) }, t('lanReset'))),
                    h('p', { className: 'dff-note', style: { marginTop: 8 } }, t('lanHint')))
                : h('p', { className: 'dff-note' }, t('lanOffHint')),
            ),
          ),
        ),
        toast ? h('div', { className: 'dff-toast' }, toast) : null,
      )
    }

    /** Sidebar glyph: a fish inside an envelope flap. */
    function FishFriendsIcon(props) {
      const size = (props && props.size) || 18
      const active = Boolean(props && props.active)
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
        h('rect', {
          x: 3.4, y: 6.4, width: 17.2, height: 12.4, rx: 3.2,
          fill: 'none', stroke: 'currentColor', strokeWidth: active ? 1.7 : 1.4, opacity: active ? 1 : 0.68,
        }),
        h('path', {
          d: 'M4.2 8.4 12 13.6l7.8-5.2',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', opacity: active ? 0.9 : 0.5,
        }),
        h('path', {
          d: 'M8.6 15.4c.9-1.5 2.4-2.4 3.9-2.4s3 .9 3.9 2.4',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', opacity: active ? 0.85 : 0.45,
        }),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        clientContext = ctx

        ctx.effect(() => {
          const disposers = [
            ctx.locale.register(NS, 'zh', DICTS.zh),
            ctx.locale.register(NS, 'en', DICTS.en),
          ]
          return () => {
            for (const dispose of disposers) {
              try { dispose() } catch { /* 已经卸掉了 */ }
            }
          }
        })

        const t = ctx.locale.bind(NS)

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 28, label: () => t('nav') },
            FishFriendsIcon,
          ),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, FishFriendsPanel),
        )
      },
    }
  },
})
