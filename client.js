// 鱼友局（dsh-fish-friends）—— 网页半边。
//
// 一间聊天室：左边是鱼友，右边是气泡。打开着就每 2 秒拉一次，
// 别人递进来的消息会自己冒出来；发出去的话走对方的局域网地址真的送过去。
window.__ModuleLoader__.load({
  id: 'dsh-fish-friends',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'fish-friends'
    const PANEL_ID = 'fish-friends'
    const BASE = '/fish-friends'
    const POLL_MS = 2000

    let clientContext = null

    const DICTS = {
      zh: {
        nav: '鱼友局',
        me: '我',
        friends: '鱼友',
        noFriends: '册子还是空的，先记一条鱼。',
        addFriend: '记一条鱼',
        addHint: '想真的能聊，把对方的局域网地址和口令填上。',
        fName: '它叫什么',
        fSpecies: '它是什么',
        fIntro: '一句话',
        fBase: '对方地址（http://ip:52800）',
        fKey: '对方口令',
        save: '存下',
        cancel: '算了',
        send: '发送',
        placeholder: '说点什么…（回车发送）',
        pick: '先点左边挑一条鱼',
        pickHint: '或者点「记一条鱼」，把对方的地址和口令填上，就能像聊天一样说话了。',
        noMsg: '还没说过话。',
        unread: '条没看',
        address: '本机邮局',
        lan: '局域网',
        lanOn: '开着',
        lanOff: '关着',
        lanOpen: '开门',
        lanClose: '关门',
        lanCopy: '复制邀请',
        lanKey: '口令',
        lanReset: '换口令',
        lanHint: '别人连进来时 Windows 防火墙可能弹一次窗，点允许。',
        copied: '已复制',
        copyFailed: '复制不了',
        loading: '正在连…',
        failed: '没连上',
        retry: '再试',
        settings: '设置',
        hide: '收起',
        online: '在',
        delete: '划掉',
        deleteSure: '真划掉？',
      },
      en: {
        nav: 'Fish friends',
        me: 'Me',
        friends: 'Fish',
        noFriends: 'Empty. Write one down first.',
        addFriend: 'Add a fish',
        addHint: 'To actually chat, fill in their LAN address and passphrase.',
        fName: 'Name',
        fSpecies: 'Species',
        fIntro: 'One line',
        fBase: 'Their address (http://ip:52800)',
        fKey: 'Their passphrase',
        save: 'Save',
        cancel: 'Cancel',
        send: 'Send',
        placeholder: 'Say something… (Enter to send)',
        pick: 'Pick a fish on the left',
        pickHint: 'Or add one with their address and passphrase to chat.',
        noMsg: 'Nothing said yet.',
        unread: 'unread',
        address: 'Local post office',
        lan: 'LAN',
        lanOn: 'open',
        lanOff: 'closed',
        lanOpen: 'Open',
        lanClose: 'Close',
        lanCopy: 'Copy invite',
        lanKey: 'Passphrase',
        lanReset: 'New key',
        lanHint: 'Windows may ask once about the firewall — allow it.',
        copied: 'Copied',
        copyFailed: 'Could not copy',
        loading: 'Connecting…',
        failed: 'Not connected',
        retry: 'Retry',
        settings: 'Settings',
        hide: 'Hide',
        online: 'here',
        delete: 'Cross out',
        deleteSure: 'Really?',
      },
    }

    const RULES = `
      .dff-page {
        box-sizing: border-box; height: 100%; min-height: 0; display: flex;
        background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
        overflow: hidden;
      }
      .dff-side {
        width: 248px; flex: none; display: flex; flex-direction: column;
        border-right: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1);
      }
      .dff-me { display: flex; align-items: center; gap: 9px; padding: 14px 14px 10px; }
      .dff-meAvatar { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-size: 18px; background: var(--dsw-alias-bg-layer-2); }
      .dff-meName { font-size: 13px; font-weight: 600; }
      .dff-meStatus { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
      .dff-sideHead {
        display: flex; align-items: center; gap: 8px; padding: 8px 14px 6px;
        font-size: 11px; color: var(--dsw-alias-label-secondary);
      }
      .dff-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 8px; }
      .dff-item {
        display: flex; gap: 9px; align-items: center; padding: 8px 9px; border-radius: 9px;
        cursor: pointer; border: 1px solid transparent;
      }
      .dff-item:hover { background: var(--dsw-alias-bg-layer-2); }
      .dff-item[data-active='true'] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l1); }
      .dff-avatar { width: 30px; height: 30px; flex: none; border-radius: 9px; display: grid; place-items: center; font-size: 15px; background: var(--dsw-alias-bg-layer-2); }
      .dff-itemMain { flex: 1; min-width: 0; }
      .dff-itemName { font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
      .dff-itemLast {
        font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .dff-badge {
        flex: none; min-width: 17px; height: 17px; padding: 0 5px; border-radius: 9px;
        background: var(--dsw-alias-state-business-primary); color: #fff;
        font-size: 10.5px; display: grid; place-items: center;
      }
      .dff-sideFoot { padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
      .dff-btn {
        height: 28px; padding: 0 11px; border-radius: 7px; cursor: pointer;
        font-size: 12px; font-family: inherit; white-space: nowrap;
        background: transparent; color: var(--dsw-alias-label-secondary);
        border: 1px solid var(--dsw-alias-border-l1);
      }
      .dff-btn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
      .dff-btn:focus-visible { outline: none; border-color: var(--dsw-alias-brand-primary); }
      .dff-btn[data-primary='true'] { background: var(--dsw-alias-state-business-primary); color: #fff; border-color: transparent; }
      .dff-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .dff-bar {
        display: flex; align-items: center; gap: 10px; padding: 9px 16px;
        border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 11.5px;
        color: var(--dsw-alias-label-secondary); flex: none;
      }
      .dff-bar code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dff-push { margin-left: auto; }
      .dff-panelBody { flex: 1; min-height: 0; display: flex; }
      .dff-chat { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .dff-chatHead { padding: 12px 18px 8px; font-size: 14px; font-weight: 600; flex: none; }
      .dff-chatHead span { font-size: 11.5px; color: var(--dsw-alias-label-secondary); font-weight: 400; margin-left: 8px; }
      .dff-msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 18px 12px; display: flex; flex-direction: column; gap: 8px; }
      .dff-row { display: flex; }
      .dff-row[data-out='true'] { justify-content: flex-end; }
      .dff-bubble {
        max-width: 74%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.6;
        white-space: pre-wrap; overflow-wrap: anywhere;
        background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1);
        border-top-left-radius: 4px;
      }
      .dff-row[data-out='true'] .dff-bubble {
        background: var(--dsw-alias-state-business-primary); color: #fff; border-color: transparent;
        border-top-left-radius: 12px; border-top-right-radius: 4px;
      }
      .dff-time { display: block; font-size: 10px; opacity: .55; margin-top: 3px; }
      .dff-compose { flex: none; padding: 10px 16px 14px; border-top: 1px solid var(--dsw-alias-border-l1); display: flex; gap: 8px; }
      .dff-input {
        flex: 1; font-family: inherit; font-size: 13px; line-height: 1.6; resize: none;
        min-height: 40px; max-height: 120px; padding: 9px 11px; border-radius: 9px; box-sizing: border-box;
        background: transparent; color: inherit; border: 1px solid var(--dsw-alias-border-l2);
      }
      .dff-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
      .dff-empty { flex: 1; display: grid; place-items: center; padding: 30px; text-align: center; }
      .dff-empty p { font-size: 12.5px; color: var(--dsw-alias-label-secondary); line-height: 1.8; max-width: 340px; }
      .dff-form { padding: 0 18px 18px; overflow-y: auto; }
      .dff-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 9px; }
      .dff-label { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
      .dff-inp {
        font-family: inherit; font-size: 12.5px; padding: 6px 9px; border-radius: 7px; box-sizing: border-box;
        background: transparent; color: inherit; border: 1px solid var(--dsw-alias-border-l2); width: 100%;
      }
      .dff-inp:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
      .dff-note { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.7; }
      .dff-error { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
      .dff-toast {
        position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%);
        background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 999px; padding: 6px 14px; font-size: 12px; z-index: 40;
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
      return locale && typeof locale.bind === 'function' ? locale.bind(NS) : (key) => key
    }

    async function call(path, init) {
      const options = { cache: 'no-store', credentials: 'same-origin', ...init }
      try {
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) options.signal = AbortSignal.timeout(15000)
      } catch {
        /* 老浏览器 */
      }
      const response = await fetch(BASE + path, options)
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body.ok === false) throw new Error(body.message || `DSH 返回 ${response.status}`)
      return body
    }

    const hhmm = (iso) => {
      if (!iso) return ''
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      const pad = (n) => String(n).padStart(2, '0')
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    const threadOf = (letters, name) =>
      letters.filter((l) => (l.dir === 'in' ? l.fromName : l.toName) === name)

    function FishFriendsPanel() {
      const t = useLocaleText()
      const [snap, setSnap] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [toast, setToast] = useState('')
      const [active, setActive] = useState('')
      const [draft, setDraft] = useState('')
      const [adding, setAdding] = useState(false)
      const [settings, setSettings] = useState(false)
      const [confirmDel, setConfirmDel] = useState('')
      const [form, setForm] = useState({ name: '', species: '', intro: '', base: '', key: '' })
      const mounted = useRef(true)
      const activeRef = useRef('')
      const atBottom = useRef(true)

      useEffect(() => () => { mounted.current = false }, [])
      activeRef.current = active

      const flash = useCallback((text) => {
        setToast(text)
        setTimeout(() => { if (mounted.current) setToast('') }, 2200)
      }, [])

      const load = useCallback(async (quiet) => {
        try {
          const body = await call('/state')
          if (!mounted.current) return
          setSnap(body)
          if (!quiet) setError('')
        } catch (e) {
          if (mounted.current && !quiet) setError(e.message || t('failed'))
        }
      }, [t])

      useEffect(() => { load() }, [load])

      // 每 2 秒拉一次：别人递进来的消息自己冒出来
      useEffect(() => {
        const id = setInterval(() => load(true), POLL_MS)
        return () => clearInterval(id)
      }, [load])

      const run = useCallback(async (op, message) => {
        setBusy(true)
        try {
          const body = await call('/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(op),
          })
          if (mounted.current) {
            setSnap((prev) => (prev ? { ...prev, state: body.state, lanAddress: body.lanAddress || prev.lanAddress } : prev))
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

      const data = snap && snap.state
      const friends = useMemo(() => (data && Array.isArray(data.friends) ? data.friends : []), [data])
      const letters = useMemo(() => (data && Array.isArray(data.letters) ? data.letters : []), [data])
      const threads = useMemo(
        () => friends.map((f) => {
          const msgs = threadOf(letters, f.name)
          return { friend: f, msgs, last: msgs[msgs.length - 1], unread: msgs.filter((m) => m.dir === 'in' && !m.read).length }
        }).sort((a, b) => {
          const ta = a.last ? Date.parse(a.last.at) || 0 : 0
          const tb = b.last ? Date.parse(b.last.at) || 0 : 0
          return tb - ta
        }),
        [friends, letters],
      )

      const msgs = useMemo(() => (active ? threadOf(letters, active) : []), [active, letters])
      const current = friends.find((f) => f.name === active) || null

      // 打开会话就把对方的未读标掉
      useEffect(() => {
        if (!active) return
        const un = msgs.filter((m) => m.dir === 'in' && !m.read).length
        if (un > 0) run({ action: 'read-with', name: active })
      }, [active, msgs, run])

      // 新消息滚到底
      useEffect(() => {
        if (!atBottom.current) return
        const box = document.querySelector('.dff-msgs')
        if (box) box.scrollTop = box.scrollHeight
      }, [msgs.length, active])

      const send = useCallback(async () => {
        const text = draft.trim()
        if (!text || !active) return
        setDraft('')
        atBottom.current = true
        const ok = await run({ action: 'write', to: active, text })
        if (!ok) setDraft(text)
      }, [active, draft, run])

      const saveFriend = useCallback(async () => {
        if (!form.name.trim()) return
        const remote = form.base.trim() ? { base: form.base.trim(), key: form.key.trim() } : null
        const ok = await run({
          action: 'add',
          name: form.name,
          species: form.species,
          intro: form.intro,
          remote,
        }, t('addFriend'))
        if (ok) {
          setAdding(false)
          setForm({ name: '', species: '', intro: '', base: '', key: '' })
        }
      }, [form, run, t])

      const removeFriend = useCallback(async (name) => {
        if (confirmDel !== name) {
          setConfirmDel(name)
          setTimeout(() => { if (mounted.current) setConfirmDel('') }, 2600)
          return
        }
        setConfirmDel('')
        await run({ action: 'remove', name })
        if (active === name) setActive('')
      }, [active, confirmDel, run])

      const copyInvite = useCallback(async () => {
        const addr = snap && snap.lanAddress
        const lan = data && data.lan
        if (!addr || !lan || !lan.key) return
        const text = `鱼友局 · ${(data.me && data.me.name) || '鱼'}\n名片：${addr}\n投信：POST ${addr.replace('/card', '/letter')}?key=${lan.key}`
        try {
          await navigator.clipboard.writeText(text)
          flash(t('copied'))
        } catch {
          flash(t('copyFailed'))
        }
      }, [snap, data, flash, t])

      if (!data) {
        return h('div', { className: 'dff-page' },
          h('style', null, RULES),
          h('div', { className: 'dff-empty' },
            error
              ? h('div', null,
                  h('p', { className: 'dff-error' }, `${t('failed')}：${error}`),
                  h('button', { type: 'button', className: 'dff-btn', onClick: () => load() }, t('retry')))
              : h('p', null, t('loading'))),
          toast ? h('div', { className: 'dff-toast' }, toast) : null,
        )
      }

      const lan = data.lan || {}
      const me = data.me || {}

      return h('div', { className: 'dff-page' },
        h('style', null, RULES),
        // 左：我 + 鱼友
        h('div', { className: 'dff-side' },
          h('div', { className: 'dff-me' },
            h('div', { className: 'dff-meAvatar' }, '🐋'),
            h('div', { style: { minWidth: 0 } },
              h('div', { className: 'dff-meName' }, me.name || t('me')),
              h('div', { className: 'dff-meStatus' }, `${me.species || ''} · ${me.status || ''}`))),
          h('div', { className: 'dff-sideHead' }, h('span', null, t('friends')), String(threads.length)),
          h('div', { className: 'dff-list' },
            threads.length
              ? threads.map((th) => h('div', {
                  key: th.friend.id,
                  className: 'dff-item',
                  'data-active': th.friend.name === active ? 'true' : 'false',
                  onClick: () => { setActive(th.friend.name); atBottom.current = true },
                },
                h('div', { className: 'dff-avatar' }, '🐟'),
                h('div', { className: 'dff-itemMain' },
                  h('div', { className: 'dff-itemName' }, th.friend.name,
                    th.friend.remote ? h('span', { className: 'dff-note' }, '· 可直连') : null),
                  h('div', { className: 'dff-itemLast' },
                    th.last ? (th.last.dir === 'out' ? '我：' : '') + th.last.text : t('noMsg'))),
                th.unread ? h('div', { className: 'dff-badge' }, String(th.unread)) : null,
              ))
              : h('p', { className: 'dff-note', style: { padding: '10px 8px' } }, t('noFriends'))),
          h('div', { className: 'dff-sideFoot' },
            h('button', { type: 'button', className: 'dff-btn', onClick: () => { setAdding(true); setSettings(false) } }, t('addFriend'))),
        ),
        // 右：聊天
        h('div', { className: 'dff-main' },
          h('div', { className: 'dff-bar' },
            h('span', null, t('address')),
            h('code', null, snap.address || '—'),
            h('span', { className: 'dff-push' },
              h('button', {
                type: 'button',
                className: 'dff-btn',
                onClick: () => setSettings((v) => !v),
              }, `${t('lan')}：${lan.enabled ? t('lanOn') : t('lanOff')}`))),
          settings
            ? h('div', { className: 'dff-form', style: { paddingTop: 12 } },
                h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('lan')),
                  h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                    h('span', { className: 'dff-note' }, lan.enabled ? t('lanOn') : t('lanOff')),
                    h('button', {
                      type: 'button', className: 'dff-btn', disabled: busy,
                      onClick: () => run({ action: 'lan', enabled: !lan.enabled }),
                    }, lan.enabled ? t('lanClose') : t('lanOpen')),
                    lan.enabled ? h('button', { type: 'button', className: 'dff-btn', disabled: busy, onClick: () => run({ action: 'lan', resetKey: true }) }, t('lanReset')) : null)),
                lan.enabled ? h('div', null,
                  h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('address')),
                    h('input', { className: 'dff-inp', readOnly: true, value: snap.lanAddress || '—' })),
                  h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('lanKey')),
                    h('input', { className: 'dff-inp', readOnly: true, value: lan.key || '—' })),
                  h('button', { type: 'button', className: 'dff-btn', onClick: copyInvite }, t('lanCopy')),
                  h('p', { className: 'dff-note', style: { marginTop: 8 } }, t('lanHint'))) : null,
                h('p', { className: 'dff-note' }, error || ''))
            : null,
          adding
            ? h('div', { className: 'dff-form' },
                h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('fName')),
                  h('input', { className: 'dff-inp', value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }) })),
                h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('fSpecies')),
                  h('input', { className: 'dff-inp', value: form.species, onChange: (e) => setForm({ ...form, species: e.target.value }) })),
                h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('fIntro')),
                  h('input', { className: 'dff-inp', value: form.intro, onChange: (e) => setForm({ ...form, intro: e.target.value }) })),
                h('p', { className: 'dff-note', style: { margin: '4px 0 8px' } }, t('addHint')),
                h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('fBase')),
                  h('input', { className: 'dff-inp', value: form.base, placeholder: 'http://192.168.0.12:52800', onChange: (e) => setForm({ ...form, base: e.target.value }) })),
                h('div', { className: 'dff-field' }, h('span', { className: 'dff-label' }, t('fKey')),
                  h('input', { className: 'dff-inp', value: form.key, onChange: (e) => setForm({ ...form, key: e.target.value }) })),
                h('div', { style: { display: 'flex', gap: 8 } },
                  h('button', { type: 'button', className: 'dff-btn', 'data-primary': 'true', disabled: busy, onClick: saveFriend }, t('save')),
                  h('button', { type: 'button', className: 'dff-btn', onClick: () => setAdding(false) }, t('cancel'))))
            : active
              ? h('div', { className: 'dff-chat' },
                  h('div', { className: 'dff-chatHead' },
                    active,
                    h('span', null, current && current.species ? current.species : ''),
                    current && current.remote ? h('span', null, '· 可直连') : null,
                    current ? h('button', {
                      type: 'button',
                      className: 'dff-btn',
                      style: { marginLeft: 10 },
                      onClick: () => removeFriend(active),
                    }, confirmDel === active ? t('deleteSure') : t('delete')) : null),
                  h('div', { className: 'dff-msgs', onScroll: (e) => {
                    const el = e.currentTarget
                    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
                  } },
                    msgs.length
                      ? [...msgs].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0)).map((m) => h('div', {
                          key: m.id,
                          className: 'dff-row',
                          'data-out': m.dir === 'out' ? 'true' : 'false',
                        },
                        h('div', { className: 'dff-bubble' },
                          m.text,
                          h('span', { className: 'dff-time' }, hhmm(m.at)))))
                      : h('p', { className: 'dff-note' }, t('noMsg'))),
                  h('div', { className: 'dff-compose' },
                    h('textarea', {
                      className: 'dff-input',
                      value: draft,
                      placeholder: t('placeholder'),
                      onChange: (e) => setDraft(e.target.value),
                      onKeyDown: (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          send()
                        }
                      },
                    }),
                    h('button', { type: 'button', className: 'dff-btn', 'data-primary': 'true', disabled: busy || !draft.trim(), onClick: send }, t('send'))))
              : h('div', { className: 'dff-empty' },
                  h('div', null,
                    h('p', null, t('pick')),
                    h('p', { className: 'dff-note' }, t('pickHint')),
                    h('button', { type: 'button', className: 'dff-btn', onClick: () => { setAdding(true) } }, t('addFriend')))),
        ),
        toast ? h('div', { className: 'dff-toast' }, toast) : null,
      )
    }

    /** Sidebar glyph: a fish inside an envelope flap. */
    function FishFriendsIcon(props) {
      const size = (props && props.size) || 18
      const active = Boolean(props && props.active)
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
        h('rect', {
          x: 3.2, y: 4.4, width: 17.6, height: 15.2, rx: 4.2,
          fill: 'none', stroke: 'currentColor', strokeWidth: active ? 1.7 : 1.4, opacity: active ? 1 : 0.68,
        }),
        h('path', {
          d: 'M7.4 12.4c1.5 0 2.7 1.2 2.7 2.7s-1.2 2.7-2.7 2.7',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', opacity: active ? 0.9 : 0.5,
        }),
        h('path', {
          d: 'M11.2 10.6h4.6M11.2 13.4h4.6',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', opacity: active ? 0.75 : 0.4,
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
