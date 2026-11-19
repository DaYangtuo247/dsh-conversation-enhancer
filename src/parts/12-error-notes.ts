/*!
 * dsh-error-notes — browser half.
 *
 * dsh prints a failed model request as the provider sent it: 「429 {"detail":{"error":{"message":…,
 * "type":"rate_limit_error","code":"model_concurrency_rate_limit_exceeded"}}}」 after 本轮运行失败 or
 * under a retry — a sentence buried in JSON. This part does not guess what an error means (there
 * are too many); it lays the body out: the error's `message` is the sentence, and the other fields
 * (the HTTP status, type, code, request id …) go on one quiet line under it, key and value. A body
 * with no message is shown as indented JSON. A text that is not JSON is left as it is.
 *
 * Nothing of dsh's is redrawn. It wraps the component of dsh's own keyed entries in place
 * (lib/slot-wrap; `conversation.chat.node` · turn-error / model-retry): the node it hands on
 * carries the message, and the fields are drawn under the row (turn-error) or follow the message
 * (retry, whose details are dsh's own). The `t` handed to the retry says its delay in seconds.
 */
part({
  id: 'dsh-error-notes',
  factory(require, kit) {
    const { React, h } = kit
    const seconds = (s) => (kit.vocab.zh() ? `${s} 秒` : `${s}s`)

    // codes dsh already turns into its own sentence (MessageItem's failureMessage): its words win
    const NATIVE_CODES = new Set(['ACCOUNT_SIGNED_OUT', 'INTERRUPTED', 'ACCOUNT_SIGN_IN_REQUIRED', 'QUOTA', 'ACCOUNT_QUOTA', 'AUTH'])
    const scalar = (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

    /**
     * A failure text as {message, fields, json}: the JSON body after an optional prefix (「429 」,
     * 「Error: 400 」), its `message` (looked for down detail / error), and every other plain field
     * met on the way down, outer ones first, with the status from the prefix at the front.
     * null when the text holds no JSON object.
     */
    function readFailure(text) {
      const s = String(text || '').trim()
      const at = s.indexOf('{')
      if (at < 0) return null
      let body
      try { body = JSON.parse(s.slice(at)) } catch { return null }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null
      const prefix = s.slice(0, at).trim()
      const fields = []
      const status = /\b(\d{3})\b/.exec(prefix)
      if (status) fields.push(['HTTP', status[1]])
      else if (prefix) fields.push(['', prefix.replace(/[:\s]+$/, '')])
      let message = ''
      let o = body
      for (let depth = 0; o && typeof o === 'object' && !Array.isArray(o) && depth < 5; depth++) {
        let next = null
        for (const [k, v] of Object.entries(o)) {
          if (k === 'message' && typeof v === 'string' && !message) message = v
          else if ((k === 'detail' || k === 'error') && typeof v === 'string' && !message) message = v
          else if ((k === 'error' || k === 'detail') && v && typeof v === 'object' && !next) next = v
          else if (scalar(v) && v !== '') fields.push([k, String(v)])
        }
        o = next
      }
      return { message, fields, json: message ? null : body }
    }

    /* ---------- wrap dsh's own renderers ---------- */
    const sheet = kit.sheet('error-notes', CSS_ERROR_NOTES)

    /** Under the row: the body's other fields, or — a body with no message — the body itself. */
    function Fields({ f }) {
      return h('div', { className: 'dcd-err-note' },
        f.fields.length ? h('div', { className: 'dcd-err-fields' },
          f.fields.map(([k, v], i) => h('span', { key: i }, k ? h('i', null, k) : null, h('code', null, v)))) : null,
        f.json ? h('pre', { className: 'dcd-err-json' }, JSON.stringify(f.json, null, 2)) : null)
    }

    function wrapTurnError(Native) {
      return function TurnErrorNotes(props) {
        const data = props.node && props.node.data
        const f = React.useMemo(() => (data && !NATIVE_CODES.has(String(data.code || '')) ? readFailure(data.message) : null), [data && data.message, data && data.code])
        if (!f) return h(Native, props)
        const node = { ...props.node, data: { ...data, message: f.message } }
        return h(React.Fragment, null, h(Native, { ...props, node }), f.fields.length || f.json ? h(Fields, { f }) : null)
      }
    }

    function wrapRetry(Native) {
      return function RetryNotes(props) {
        const data = props.node && props.node.data
        const cur = data && data.current
        const failure = cur && cur.failure
        const f = React.useMemo(() => (failure && !NATIVE_CODES.has(String(failure.code || '')) ? readFailure(failure.message) : null), [failure && failure.message, failure && failure.code])
        const t0 = props.t
        const t = React.useMemo(() => (typeof t0 !== 'function' ? t0 : (key, params) => (
          key === 'duration.milliseconds' && params && params.milliseconds >= 1000
            ? seconds(Math.round(params.milliseconds / 100) / 10)
            : t0(key, params))), [t0])
        if (!f) return h(Native, { ...props, t })
        // dsh's details line holds text only: the message, then the field values
        const tail = f.fields.map(([, v]) => v).join(' · ')
        const text = f.message ? (tail ? `${f.message}（${tail}）` : f.message) : JSON.stringify(f.json)
        const node = { ...props.node, data: { ...data, current: { ...cur, failure: { ...failure, message: text } } } }
        return h(Native, { ...props, node, t })
      }
    }

    const WRAP = { 'turn-error': wrapTurnError, 'model-retry': wrapRetry }
    return {
      inject: ['slots'],
      apply(ctx) {
        wrapNativeEntries(ctx, {
          slot: 'conversation.chat.node',
          tag: 'error-notes',
          label: 'error-notes: lay out failed requests',
          wrap: (entry) => WRAP[entry.options && entry.options.key] || null,
          onSync: (n) => (n ? sheet.ensure() : sheet.remove()),
        })
      },
    }
  },
})
