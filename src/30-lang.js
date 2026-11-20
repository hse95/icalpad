/* ================= iCalPad engine: language, units, printing ================= */

const CONSTS = { pi: PI, 'π': PI, e: E, inf: INF, deg: mulA([N(1, 180), PI]), true: TRUE, false: FALSE };

// ---------- lexer ----------
const ID0 = /[A-Za-z_Ͱ-Ͽ]/, IDC = /[A-Za-z0-9_Ͱ-Ͽ'’′]/;
const OP2 = { ':=': ':=', '->': '->', '<=': '<=', '>=': '>=', '!=': '!=', '==': '=', '**': '^' };
const OP1 = { '→': '->', '≤': '<=', '≥': '>=', '≠': '!=', '·': '*', '×': '*', '⋅': '*', '÷': '/', '−': '-', '–': '-' };
function lex(src) {
  const out = []; let i = 0, sp = false; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; sp = true; continue; }
    let tok;
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i)); tok = { k: 'num', v: m[0] }; i += m[0].length;
    } else if (ID0.test(c)) {
      let j = i + 1; while (j < n && IDC.test(src[j])) j++;
      tok = { k: 'id', v: src.slice(i, j).replace(/[’′]/g, "'") }; i = j;
    } else if (c === '∞') { tok = { k: 'id', v: 'inf' }; i++; }
    else if (OP2[src.substr(i, 2)]) { tok = { k: 'op', v: OP2[src.substr(i, 2)] }; i += 2; }
    else if (OP1[c]) { tok = { k: 'op', v: OP1[c] }; i++; }
    else if ('+-*/^()[],;=<>!°√'.includes(c)) { tok = { k: 'op', v: c }; i++; }
    else throw new CalcError(`The character "${c}" is not understood here`);
    tok.sp = sp; sp = false; out.push(tok);
  }
  return out;
}

// ---------- parser (tokens -> raw tree that mirrors what was typed) ----------
function parseTokens(toks) {
  let p = 0;
  const peek = () => toks[p], isOp = v => p < toks.length && toks[p].k === 'op' && toks[p].v === v;
  const expect = v => { if (!isOp(v)) throw new CalcError(p < toks.length ? `Expected "${v}" before "${toks[p].v}"` : `A closing "${v}" is missing`); p++; };
  const startsPrimary = t => t && (t.k === 'num' || t.k === 'id' || (t.k === 'op' && (t.v === '(' || t.v === '√' || (t.v === '[' && t.sp))));
  const expr = () => {
    let l = addx();
    while (peek() && peek().k === 'op' && ['=', '<', '>', '<=', '>=', '!='].includes(peek().v)) { const op = toks[p++].v; l = { t: 'rel', op, l, r: addx() }; }
    return l;
  };
  const addx = () => { let l = mulx(); while (isOp('+') || isOp('-')) { const op = toks[p++].v; l = { t: 'bin', op, l, r: mulx() }; } return l; };
  const mulx = () => {
    let l = unary();
    for (; ;) {
      if (isOp('*') || isOp('/')) { const op = toks[p++].v; l = { t: 'bin', op, l, r: unary() }; }
      else if (startsPrimary(peek())) l = { t: 'bin', op: '*', l, r: power(), imp: true };
      else break;
    }
    return l;
  };
  const unary = () => { if (isOp('-')) { p++; return { t: 'neg', x: unary() }; } if (isOp('+')) { p++; return unary(); } return power(); };
  const power = () => { const b = postfix(); if (isOp('^')) { p++; return { t: 'bin', op: '^', l: b, r: unary() }; } return b; };
  const list = close => { const a = []; if (isOp(close)) { p++; return a; } for (; ;) { a.push(expr()); if (isOp(',')) { p++; continue; } expect(close); return a; } };
  const postfix = () => {
    let x = primary();
    for (; ;) {
      const t = peek(); if (!t || t.k !== 'op') break;
      if (t.v === '[' && !t.sp) { p++; x = { t: 'idx', base: x, args: list(']') }; }
      else if (t.v === '!') { p++; x = { t: 'call', name: 'factorial', args: [x] }; }
      else if (t.v === '°') { p++; x = { t: 'bin', op: '*', l: x, r: { t: 'sym', name: 'deg' }, imp: true }; }
      else break;
    }
    return x;
  };
  const primary = () => {
    const t = toks[p++];
    if (!t) throw new CalcError('Something is missing at the end');
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'id') { const nx = peek(); if (nx && nx.k === 'op' && nx.v === '(' && !nx.sp) { p++; return { t: 'call', name: t.v, args: list(')') }; } return { t: 'sym', name: t.v }; }
    if (t.v === '(') { const e = expr(); expect(')'); return e; }
    if (t.v === '√') return { t: 'call', name: 'sqrt', args: [power()] };
    if (t.v === '[') {
      const rows = [[]];
      if (isOp(']')) { p++; throw new CalcError('This matrix is empty'); }
      for (; ;) { rows[rows.length - 1].push(expr()); if (isOp(',')) { p++; continue; } if (isOp(';')) { p++; rows.push([]); continue; } expect(']'); break; }
      if (rows.some(r => r.length !== rows[0].length)) throw new CalcError('Every row of a matrix needs the same number of entries');
      return { t: 'mat', rows };
    }
    throw new CalcError(`Unexpected "${t.v}"`);
  };
  const e = expr();
  if (p < toks.length) throw new CalcError(`Unexpected "${toks[p].v}"`);
  return e;
}
const parseExpr = src => { const s = src.includes('\\') ? latexToSrc(src) : src; const t = lex(s); if (!t.length) throw new CalcError('Nothing to calculate yet'); return parseTokens(t); };

/* A worksheet line is one of:   name := expr     f(x) := expr     expr =     expr = unit     expr ->     expr -> keyword, args */
function parseStatement(src0) {
  let src = src0.trim(); if (!src) return { kind: 'empty' };
  if (src.includes('\\')) src = latexToSrc(src);
  const toks = lex(src);
  let depth = 0, iDef = -1, iArrow = -1, lastEq = -1;
  toks.forEach((t, i) => {
    if (t.k !== 'op') return;
    if (t.v === '(' || t.v === '[') depth++; else if (t.v === ')' || t.v === ']') depth--;
    else if (depth === 0) { if (t.v === ':=' && iDef < 0) iDef = i; else if (t.v === '->' && iArrow < 0) iArrow = i; else if (t.v === '=') lastEq = i; }
  });
  const unitTail = ts => ts.length === 0 || (ts.some(t => t.k === 'id') && ts.every((t, i) => (t.k === 'id' && (UNITS[t.v] || t.v === 'deg')) || (t.k === 'op' && '*/^()-'.includes(t.v)) || (t.k === 'num' && i > 0 && ts[i - 1].k === 'op' && '^-(/'.includes(ts[i - 1].v) && !(ts[i - 1].v === '/' && false))));
  const st = { src }; let start = 0, end = toks.length;
  if (iDef >= 0) {
    const lhs = parseTokens(toks.slice(0, iDef));
    if (lhs.t === 'sym') st.name = lhs.name;
    else if (lhs.t === 'call' && lhs.args.length && lhs.args.every(a => a.t === 'sym')) { st.name = lhs.name; st.params = lhs.args.map(a => a.name); }
    else throw new CalcError('The left side of := must be a name such as L, or a function such as f(x)');
    st.kind = 'def'; st.lhs = lhs; start = iDef + 1;
  }
  if (iArrow >= start) {
    st.show = 'sym'; end = iArrow;
    const mt = toks.slice(iArrow + 1);
    if (mt.length) {
      if (mt[0].k !== 'id') throw new CalcError('After -> write a keyword such as simplify, expand, factor, float or solve, x');
      const groups = [[]]; let d = 0;
      for (const t of mt.slice(1)) { if (t.k === 'op' && (t.v === '(' || t.v === '[')) d++; if (t.k === 'op' && (t.v === ')' || t.v === ']')) d--; if (t.k === 'op' && t.v === ',' && d === 0) groups.push([]); else groups[groups.length - 1].push(t); }
      st.mod = { kw: mt[0].v, args: groups.filter(g => g.length).map(parseTokens) };
    }
  } else if (lastEq >= start && unitTail(toks.slice(lastEq + 1))) {
    st.show = 'num'; if (lastEq + 1 < toks.length) st.unit = parseTokens(toks.slice(lastEq + 1)); end = lastEq;
  }
  if (end <= start) throw new CalcError('Nothing to calculate yet');
  st.expr = parseTokens(toks.slice(start, end));
  if (!st.kind) st.kind = st.show ? 'eval' : 'expr';
  return st;
}

// ---------- raw tree -> canonical value ----------
const bind = (env, names) => ({ ...env, bound: new Set([...env.bound, ...names]) });
/* Names that had no value when a line was written pick up values defined later (derive first, plug numbers in after). */
function late(v, env, self) {
  if (isNum(v)) return v;
  let map = null;
  for (const n of symbolsOf(v)) { if (n === self || env.bound.has(n)) continue; const sv = env.scope.get(n); if (sv && !sv.fn) (map = map || new Map()).set(n, sv.v); }
  return map ? subst(v, map) : v;
}
function evSym(name, env) {
  if (env.bound.has(name)) return S(name);
  const sv = env.scope.get(name);
  if (sv) { if (sv.fn) throw new CalcError(`${name} is a function. Write it with brackets, like ${name}(${sv.params.join(', ')})`); return late(sv.v, env, name); }
  if (CONSTS[name]) return CONSTS[name];
  if (UNITS[name]) return S('$' + name);       // a unit, unless the name was given a value above
  return S(name);
}
function index(base, ix) {
  if (base.t !== 'm') throw new CalcError('Only a matrix or vector has entries like v[1]');
  if (ix.some(i => !isInt(i))) throw new CalcError('Entry numbers must be whole numbers');
  const R = base.r.length, Cn = base.r[0].length, chk = (i, n) => { if (i < 1 || i > n) throw new CalcError(`Entry ${i} is outside the matrix (size ${R}×${Cn}). Counting starts at 1.`); return i - 1; };
  if (ix.length === 2) return base.r[chk(ix[0].n, R)][chk(ix[1].n, Cn)];
  if (ix.length === 1) { if (Cn === 1) return base.r[chk(ix[0].n, R)][0]; if (R === 1) return base.r[0][chk(ix[0].n, Cn)]; return M([base.r[chk(ix[0].n, R)]]); }
  throw new CalcError('Use one or two entry numbers, like v[2] or A[1,2]');
}
function ev(x, env) {
  switch (x.t) {
    case 'num': return /^[0-9]+$/.test(x.v) && x.v.length < 16 ? N(parseInt(x.v, 10)) : F(parseFloat(x.v));
    case 'sym': return evSym(x.name, env);
    case 'neg': return neg(ev(x.x, env));
    case 'bin': {
      const l = ev(x.l, env);
      if (x.op === '^') { if (l.t === 'm' && x.r.t === 'sym' && x.r.name === 'T' && !env.scope.has('T')) return transpose(l); return pow(l, ev(x.r, env)); }
      const r = ev(x.r, env);
      return x.op === '+' ? addA([l, r]) : x.op === '-' ? sub(l, r) : x.op === '*' ? mulA([l, r]) : div(l, r);
    }
    case 'rel': return rel(x.op, ev(x.l, env), ev(x.r, env));
    case 'mat': return M(x.rows.map(r => r.map(c => { const v = ev(c, env); if (v.t === 'm') throw new CalcError('A matrix entry cannot itself be a matrix'); return v; })));
    case 'idx': { const b = ev(x.base, env), ix = x.args.map(a => ev(a, env)); return b.t === 'm' || b.t !== 'fn' ? index(b, ix) : fn('index', [b, ...ix]); }
    case 'call': return evCall(x, env);
    case 'str': return S(x.v);
  }
  throw new CalcError('This cannot be calculated');
}
function evCall(x, env) {
  const name = x.name, args = x.args;
  if (env.ufn && env.ufn.has(name)) return { t: 'fn', name: '@' + name, a: args.map(a => ev(a, env)) };
  const sv = env.bound.has(name) ? null : env.scope.get(name);
  if (sv && sv.fn) {
    if (args.length !== sv.params.length) throw new CalcError(`${name} takes ${sv.params.length} value${sv.params.length > 1 ? 's' : ''}: ${name}(${sv.params.join(', ')})`);
    const vals = args.map(a => ev(a, env));
    return late(subst(sv.body, new Map(sv.params.map((q, i) => [q, vals[i]]))), env, name);
  }
  if (name === 'if') {
    if (args.length !== 3) throw new CalcError('Write it as if(condition, value when true, value when false)');
    const c = ev(args[0], env);
    if (c.t === 'b') return ev(args[c.v ? 1 : 2], env);
    return fn('if', [c, ev(args[1], env), ev(args[2], env)]);
  }
  if (BIND[name]) return evBinder(x, env);
  if (name === 'subs') {
    const names = []; for (let i = 1; i < args.length;) { const a = args[i]; if (a.t === 'rel' && a.l.t === 'sym') { names.push(a.l.name); i++; } else if (a.t === 'sym') { names.push(a.name); i += 2; } else throw new CalcError('Write it as subs(expression, x, value)'); }
    const e2 = bind(env, names); let k = 0;
    return fn('subs', args.map((a, i) => { if (i === 0) return ev(a, e2); if (a.t === 'rel' && a.l.t === 'sym') return { t: 'rel', op: '=', a: [S(a.l.name), ev(a.r, env)] }; return (k++ % 2 === 0) ? S(a.name) : ev(a, env); }));
  }
  if (FN[name] || NF[name]) {
    if (!args.length) throw new CalcError(`${name}() needs something inside the brackets`);
    return fn(name, args.map(a => ev(a, env)));
  }
  if (args.length === 1 && (sv || env.bound.has(name) || UNITS[name] || CONSTS[name] || /^.$/u.test(name))) return mulA([evSym(name, env), ev(args[0], env)]);
  throw new CalcError(`${name}() is not a known function. To multiply, write ${name}*(…)`);
}
function evBinder(x, env) {
  const name = x.name, [a0, a1, ...rest] = x.args;
  if (!a0) throw new CalcError(`${name}() needs something inside the brackets`);
  if (name === 'solve' || name === 'nsolve') {
    const vn = !a1 ? [] : a1.t === 'sym' ? [a1.name] : a1.t === 'mat' ? a1.rows.flat().map(s => s.t === 'sym' ? s.name : null) : [null];
    if (vn.some(n => !n)) throw new CalcError('Solve for a plain name, for example solve(x^2 = 4, x)');
    const e2 = bind(env, vn), A = [ev(a0, e2)];
    if (a1) A.push(a1.t === 'sym' ? S(a1.name) : M(a1.rows.map(r => r.map(s => S(s.name)))));
    rest.forEach(r => A.push(ev(r, env)));
    return fn(name, A);
  }
  if (name === 'dsolve') {
    if (!a1 || a1.t !== 'call' || a1.args.length !== 1 || a1.args[0].t !== 'sym') throw new CalcError('Write it as dsolve(equation, y(x)), with diff(y(x), x) for derivatives');
    const xv = a1.args[0].name, e2 = { ...bind(env, [xv]), ufn: new Set([...(env.ufn || []), a1.name]) };
    return fn('dsolve', [ev(a0, e2), { t: 'fn', name: '@' + a1.name, a: [S(xv)] }]);
  }
  if (!a1 || a1.t !== 'sym') throw new CalcError(`In ${name}(…) the second entry is the variable, for example ${name}(x^2, x${name === 'limit' ? ', 0' : name === 'sum' || name === 'prod' ? ', 1, 10' : ''})`);
  const e2 = bind(env, [a1.name]);
  let r = fn(name, [ev(a0, e2), S(a1.name), ...rest.map(q => ev(q, env))]);
  if ((name === 'diff' || (name === 'int' && !rest.length)) && !env.bound.has(a1.name)) { const sv = env.scope.get(a1.name); if (sv && !sv.fn) r = subst1(r, a1.name, sv.v); }
  return r;
}

// ---------- numbers out: units -> SI base, constants -> floats ----------
const unitCache = new Map();
function unitValue(name) {
  let v = unitCache.get(name);
  if (!v) { const u = UNITS[name]; v = mulA([F(u.f), ...BASE.map((b, i) => u.d[i] ? pow(S(b), N(u.d[i])) : ONE)]); unitCache.set(name, v); }
  return v;
}
function num0(x, keepUnits) {
  switch (x.t) {
    case 'n': return F(x.n / x.d);
    case 'f': case 'b': return x;
    case 's': if (x.name === '%pi') return F(Math.PI); if (x.name === '%e') return F(Math.E); return !keepUnits && x.name[0] === '$' ? unitValue(x.name.slice(1)) : x;
    case '+': return addA(x.a.map(c => num0(c, keepUnits)));
    case '*': return mulA(x.a.map(c => num0(c, keepUnits)));
    case '^': return pow(num0(x.a[0], keepUnits), x.a[1].t === 'n' ? x.a[1] : num0(x.a[1], keepUnits));
    case 'm': return M(x.r.map(r => r.map(c => num0(c, keepUnits))));
    case 'rel': return rel(x.op, num0(x.a[0], keepUnits), num0(x.a[1], keepUnits));
    default: return fn(x.name, x.a.map((c, i) => BIND[x.name] && i === 1 ? c : num0(c, keepUnits)));
  }
}
function numericC(x, keepUnits) { const old = C.noAdv; C.noAdv = true; try { return num0(x, keepUnits); } finally { C.noAdv = old; } }

/* Compile to a fast plain-number function (values in SI base units). */
function compile(x, vars) {
  const ix = new Map(vars.map((v, i) => [v, i]));
  const go = y => {
    switch (y.t) {
      case 'n': { const v = y.n / y.d; return () => v; }
      case 'f': { const v = y.v; return () => v; }
      case 'b': { const v = +y.v; return () => v; }
      case 's': {
        if (ix.has(y.name)) { const i = ix.get(y.name); return a => a[i]; }
        if (BASEU.has(y.name)) return () => 1;
        if (y.name === '%pi') return () => Math.PI; if (y.name === '%e') return () => Math.E;
        if (y.name[0] === '$') { const f = UNITS[y.name.slice(1)].f; return () => f; }
        return () => NaN;
      }
      case '+': { const fs = y.a.map(go), n = fs.length; return a => { let s = 0; for (let i = 0; i < n; i++) s += fs[i](a); return s; }; }
      case '*': { const fs = y.a.map(go), n = fs.length; return a => { let s = 1; for (let i = 0; i < n; i++) s *= fs[i](a); return s; }; }
      case '^': {
        const b = go(y.a[0]), e = go(y.a[1]), en = y.a[1];
        if (en.t === 'n' && en.d === 1) { const k = en.n; if (k === 2) return a => { const v = b(a); return v * v; }; if (k === -1) return a => 1 / b(a); return a => Math.pow(b(a), k); }
        if (en.t === 'n' && en.d % 2 === 1) { const ev2 = en.n / en.d, sg = Math.abs(en.n) % 2 ? -1 : 1; return a => { const v = b(a); return v < 0 ? sg * Math.pow(-v, ev2) : Math.pow(v, ev2); }; }
        return a => Math.pow(b(a), e(a));
      }
      case 'rel': { const l = go(y.a[0]), r = go(y.a[1]), f = RELF[y.op]; return a => +f(l(a), r(a)); }
      case 'fn': {
        const as = y.a.map(go), nm = y.name;
        if (nm === 'if') return a => as[0](a) ? as[1](a) : as[2](a);
        if (nm === 'max') return a => { let m = -Infinity; for (const f of as) m = Math.max(m, f(a)); return m; };
        if (nm === 'min') return a => { let m = Infinity; for (const f of as) m = Math.min(m, f(a)); return m; };
        if (nm === 'and') return a => +as.every(f => f(a)); if (nm === 'or') return a => +as.some(f => f(a)); if (nm === 'not') return a => +!as[0](a);
        if (nm === 'atan2') return a => Math.atan2(as[0](a), as[1](a));
        if (nm === 'mod') return a => { const p = as[0](a), q = as[1](a); return p - q * Math.floor(p / q); };
        if (nm === 'round') return a => Math.round(as[0](a));
        const f = NF[nm]; if (f && as.length === 1) return a => f(as[0](a));
        return () => NaN;
      }
    }
    return () => NaN;
  };
  return go(x);
}

// ---------- canonical -> raw display tree ----------
const LABEL = { '%pi': 'π', '%e': 'e', '%i': 'i', '%inf': '∞', '%m': 'm', '%kg': 'kg', '%s': 's', '%A': 'A', '%K': 'K', '%mol': 'mol', '%cd': 'cd' };
const trimZ = s => s.includes('.') && !/e/i.test(s) ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
function fmtNum(v, sig = C.sig) {
  if (!Number.isFinite(v)) return { m: Number.isNaN(v) ? '?' : v > 0 ? '∞' : '-∞' };
  if (v === 0) return { m: '0' };
  const av = Math.abs(v);
  if (av >= 1e7 || av < 1e-4) {
    let e = Math.floor(Math.log10(av)), m = v / Math.pow(10, e), ms = trimZ(m.toPrecision(sig));
    if (Math.abs(parseFloat(ms)) >= 10) { e++; ms = trimZ((m / 10).toPrecision(sig)); }
    return { m: ms, e };
  }
  if (av >= Math.pow(10, sig)) return { m: String(Math.round(v)) };
  return { m: trimZ(v.toPrecision(sig)) };
}
function dispFloat(v) {
  const f = fmtNum(Math.abs(v)), node = f.e === undefined ? { t: 'num', v: f.m } : { t: 'num', v: f.m, e: f.e };
  return v < 0 ? { t: 'neg', x: node } : node;
}
function splitSign(t) {
  if (isNum(t)) return val(t) < 0 ? [true, nneg(t)] : [false, t];
  if (t.t === '*' && isNum(t.a[0]) && val(t.a[0]) < 0) { const c = nneg(t.a[0]), rest = t.a.slice(1); return [true, val(c) === 1 ? (rest.length === 1 ? rest[0] : { t: '*', a: rest }) : { t: '*', a: [c, ...rest] }]; }
  return [false, t];
}
const rprod = xs => xs.reduce((a, b) => ({ t: 'bin', op: '*', l: a, r: b }));
function dispPow(x) {
  const [b, e] = x.a;
  if (e.t === 'n') {
    if (e.n < 0) return { t: 'bin', op: '/', l: { t: 'num', v: '1' }, r: disp(pow(b, nneg(e))) };
    if (e.d === 2 && e.n === 1) return { t: 'call', name: 'sqrt', args: [disp(b)] };
    if (e.n === 1) return { t: 'call', name: 'root', args: [disp(b), { t: 'num', v: String(e.d) }] };
  }
  return { t: 'bin', op: '^', l: disp(b), r: disp(e) };
}
function disp(x) {
  switch (x.t) {
    case 'n': { const a = Math.abs(x.n), d = x.d === 1 ? { t: 'num', v: String(a) } : { t: 'bin', op: '/', l: { t: 'num', v: String(a) }, r: { t: 'num', v: String(x.d) } }; return x.n < 0 ? { t: 'neg', x: d } : d; }
    case 'f': return dispFloat(x.v);
    case 's': return x.name[0] === '$' ? { t: 'sym', name: x.name.slice(1), unit: true } : { t: 'sym', name: LABEL[x.name] || x.name.replace(/^%/, ''), unit: BASEU.has(x.name) ? true : false };
    case 'b': return { t: 'str', v: x.v ? 'true' : 'false' };
    case 'm': return { t: 'mat', rows: x.r.map(r => r.map(disp)) };
    case 'rel': return { t: 'rel', op: x.op, l: disp(x.a[0]), r: disp(x.a[1]) };
    case '+': {
      let acc = null, ts = x.a;
      if (ts.some(t => has(t, '%i'))) ts = [...ts.filter(t => !has(t, '%i')), ...ts.filter(t => has(t, '%i'))];   // real part first
      else {
        const mi = ts.map(monoInfo), fp = ts.findIndex((t, i) => !splitSign(t)[0] && mi[i].deg > 0);
        if (fp > 0 && (ts.length === 2 || mi.every(m => m.deg === mi[0].deg))) ts = [ts[fp], ...ts.slice(0, fp), ...ts.slice(fp + 1)];
      }   // lead with a positive term
      for (const t of ts) { const [ng, pos] = splitSign(t), d = disp(pos); acc = acc === null ? (ng ? { t: 'neg', x: d } : d) : { t: 'bin', op: ng ? '-' : '+', l: acc, r: d }; }
      return acc;
    }
    case '*': {
      const [ng, pos] = splitSign(x);
      if (ng) return { t: 'neg', x: disp(pos) };
      const num = [], den = [];
      for (const f of x.a) {
        if (f.t === 'n') { if (f.n !== 1) num.push({ t: 'num', v: String(f.n) }); if (f.d !== 1) den.push({ t: 'num', v: String(f.d) }); }
        else if (f.t === '^' && ((isNum(f.a[1]) && val(f.a[1]) < 0) || (f.a[1].t === '*' && isNum(f.a[1].a[0]) && val(f.a[1].a[0]) < 0))) den.push(disp(pow(f.a[0], neg(f.a[1]))));
        else num.push(disp(f));
      }
      const top = num.length ? rprod(num) : { t: 'num', v: '1' };
      return den.length ? { t: 'bin', op: '/', l: top, r: rprod(den) } : top;
    }
    case '^': return dispPow(x);
    default: return { t: 'call', name: x.name.replace(/^@/, ''), args: x.a.map(disp) };
  }
}

// ---------- raw tree -> LaTeX ----------
const GREEKS = new Set('alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi rho sigma tau upsilon phi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega'.split(' '));
const TEXFN = new Set('sin cos tan ln log sinh cosh tanh min max det exp sec csc cot'.split(' '));
const RELTEX = { '=': '=', '<': '<', '>': '>', '<=': '\\le ', '>=': '\\ge ', '!=': '\\ne ' };
const PR = { REL: 1, ADD: 2, NEG: 3, MUL: 4, POW: 6, ATOM: 9 };
function prec(x) {
  switch (x.t) {
    case 'rel': return PR.REL;
    case 'neg': return PR.NEG;
    case 'bin': return x.op === '+' || x.op === '-' ? PR.ADD : x.op === '*' ? PR.MUL : x.op === '/' ? 8 : PR.POW;
    case 'num': return x.e !== undefined ? PR.MUL : PR.ATOM;
    default: return PR.ATOM;
  }
}
const par = s => `\\left(${s}\\right)`;
function symTex(name, unit) {
  if (name === 'π' || name === 'pi') return '\\pi '; if (name === '∞' || name === 'inf') return '\\infty ';
  if (unit === undefined) unit = isUnitName(name) || (name === 'deg' && !(C.userNames && C.userNames.has('deg')));
  if (unit) return name === 'deg' ? '^{\\circ}' : `\\mathrm{${name}}`;
  let base = name, sb = '';
  const us = name.indexOf('_'); if (us > 0) { base = name.slice(0, us); sb = name.slice(us + 1).replace(/_/g, ','); }
  let prime = ''; const pm = /^([^']+)('+)(.*)$/.exec(base);
  if (pm) { base = pm[1]; prime = pm[2]; if (pm[3]) sb = sb ? pm[3] + ',' + sb : pm[3]; }
  if (!sb) { const dm = /^(.*?[A-Za-zͰ-Ͽ])(\d+)$/.exec(base); if (dm) { base = dm[1]; sb = dm[2]; } }
  const piece = (s, isSub) => GREEKS.has(s) ? '\\' + s + ' ' : [...s].length === 1 || /^\d+$/.test(s) ? s : isSub ? `\\mathrm{${s}}` : `\\mathit{${s}}`;
  return piece(base, false) + prime + (sb ? `_{${piece(sb, true)}}` : '');
}
let SUP = 0;                                  // > 0 while typesetting an exponent
const texAtom = x => x.t === 'bin' || x.t === 'neg' || x.t === 'rel' ? par(tex(x)) : tex(x);
function callTex(x) {
  const n = x.name, a = x.args, A = a.map(tex);
  const pa = i => (prec(a[i]) <= PR.ADD || a[i].t === 'neg') ? par(A[i]) : A[i];
  switch (n) {
    case 'sqrt': if (a.length === 1) return `\\sqrt{${A[0]}}`; break;
    case 'root': if (a.length === 2) return `\\sqrt[${A[1]}]{${A[0]}}`; break;
    case 'cbrt': if (a.length === 1) return `\\sqrt[3]{${A[0]}}`; break;
    case 'abs': if (a.length === 1) return `\\left|${A[0]}\\right|`; break;
    case 'exp': if (a.length === 1) return `e^{${A[0]}}`; break;
    case 'factorial': return texAtom(a[0]) + '!';
    case 'diff': if (a.length >= 2) { const o = a[2] ? A[2] : null, op = o ? `\\frac{d^{${o}}}{d${A[1]}^{${o}}}` : `\\frac{d}{d${A[1]}}`; return op + (a[0].t === 'sym' || a[0].t === 'call' ? '\\,' + A[0] : par(A[0])); } break;
    case 'int': if (a.length === 2) return `\\int ${pa(0)}\\,d${A[1]}`; if (a.length === 4) return `\\int_{${A[2]}}^{${A[3]}} ${pa(0)}\\,d${A[1]}`; break;
    case 'sum': case 'prod': if (a.length === 4) return `\\${n}_{${A[1]}=${A[2]}}^{${A[3]}} ${pa(0)}`; break;
    case 'limit': if (a.length >= 3) return `\\lim_{${A[1]}\\to ${A[2]}} ${pa(0)}`; break;
    case 'transpose': if (a.length === 1) return texAtom(a[0]) + '^{\\mathrm{T}}'; break;
    case 'if': if (a.length === 3) return `\\begin{cases}${A[1]} & \\text{if } ${A[0]} \\\\ ${A[2]} & \\text{otherwise}\\end{cases}`; break;
    case 'factored': return a.slice(1).map(tex).join('\\cdot ');
  }
  const head = TEXFN.has(n) ? '\\' + n : (FN[n] || NF[n]) ? `\\operatorname{${n}}` : symTex(n, false);
  return head + par(A.join(',\\,'));
}
const startsNum = x => x.t === 'num' || (x.t === 'bin' && (x.op === '*' || x.op === '/' || x.op === '^') && startsNum(x.l));
const endsNum = x => (x.t === 'num' && x.e === undefined) || (x.t === 'bin' && x.op === '*' && endsNum(x.r));
const isUnitSym = x => x.t === 'sym' && (x.unit !== undefined ? x.unit : isUnitName(x.name) || x.name === 'deg');
const isMatLike = x => x.t === 'mat' || (x.t === 'bin' && x.op === '*' && isMatLike(x.r));
const startsUnit = x => isUnitSym(x) || (x.t === 'bin' && (x.op === '*' || x.op === '^' || x.op === '/') && startsUnit(x.l));
function tex(x) {
  switch (x.t) {
    case 'num': return x.e !== undefined ? `${x.v}\\times 10^{${x.e}}` : x.v;
    case 'sym': return symTex(x.name, x.unit);
    case 'str': return `\\text{${x.v}}`;
    case 'neg': return '-' + (prec(x.x) <= PR.ADD || x.x.t === 'neg' ? par(tex(x.x)) : tex(x.x));
    case 'rel': return tex(x.l) + RELTEX[x.op] + tex(x.r);
    case 'mat': return '\\begin{bmatrix}' + x.rows.map(r => r.map(tex).join(' & ')).join(' \\\\ ') + '\\end{bmatrix}';
    case 'idx': return texAtom(x.base) + '_{' + x.args.map(tex).join(',') + '}';
    case 'call': return callTex(x);
    case 'bin': {
      const { op, l, r } = x;
      if (op === '+') return tex(l) + '+' + (prec(r) < PR.ADD || r.t === 'neg' ? par(tex(r)) : tex(r));
      if (op === '-') return tex(l) + '-' + (prec(r) <= PR.ADD || r.t === 'neg' ? par(tex(r)) : tex(r));
      if (op === '/') {
        if (isUnitExpr(r) && endsUnit(l)) return tex(l) + '/' + (r.t === 'bin' && r.op !== '^' ? `(${unitTex(r)})` : unitTex(r));   // 12 kN/m stays on one line
        if (SUP > 0) {                         // inside an exponent a slash reads better than a tiny stacked fraction
          const L = prec(l) <= PR.ADD ? par(tex(l)) : tex(l), R = r.t === 'bin' || r.t === 'neg' ? par(tex(r)) : tex(r);
          return L + '/' + R;
        }
        return `\\frac{${tex(l)}}{${tex(r)}}`;
      }
      if (op === '^') {
        const wrap = l.t === 'bin' || l.t === 'neg' || l.t === 'rel' || (l.t === 'num' && l.e !== undefined) || (l.t === 'call' && ['sqrt', 'root', 'cbrt', 'diff', 'int', 'sum', 'prod', 'limit', 'exp', 'factorial', 'if', 'transpose'].includes(l.name));
        SUP++; let rt; try { rt = tex(r); } finally { SUP--; }
        return (wrap ? par(tex(l)) : tex(l)) + `^{${rt}}`;
      }
      const lp = prec(l) <= PR.ADD, rp = prec(r) <= PR.ADD || r.t === 'neg';
      const L = lp ? par(tex(l)) : tex(l), R = rp ? par(tex(r)) : tex(r);
      let sep = '\\cdot ';
      // Keep the multiplication dot when substitution makes both factors numeric.
      if (endsNum(l) && startsNum(r)) sep = '\\cdot ';
      else if (!rp && startsUnit(r) && isMatLike(l)) sep = '\\;';
      else if (!rp && startsUnit(r) && !(r.t === 'sym' && r.name === 'deg')) sep = isUnitSym(l) || (l.t === 'bin' && startsUnit(l) && !endsNum(l)) || (l.t === 'bin' && l.op !== '*' ? false : endsUnit(l)) ? '{\\cdot}' : '\\,';
      else if (r.t === 'sym' && r.name === 'deg' && isUnitSym(r)) sep = '';
      else if (rp || lp) sep = startsNum(r) && !rp && endsNum(l) ? '\\cdot ' : '';
      else if (endsNum(l) && !startsNum(r)) sep = '';
      return L + sep + R;
    }
  }
  return '';
}
const isUnitExpr = x => isUnitSym(x) || (x.t === 'bin' && (x.op === '^' ? isUnitExpr(x.l) && (x.r.t === 'num' || x.r.t === 'neg') : (x.op === '*' || x.op === '/') && isUnitExpr(x.l) && isUnitExpr(x.r)));
const endsUnit = x => isUnitSym(x) || (x.t === 'bin' && (x.op === '*' ? endsUnit(x.r) : x.op === '^' || x.op === '/' ? startsUnit(x.l) : false));
function unitTex(x) {
  switch (x.t) {
    case 'sym': return x.name === 'deg' ? '^{\\circ}' : `\\mathrm{${x.name}}`;
    case 'num': return x.v;
    case 'neg': return '-' + unitTex(x.x);
    case 'bin':
      if (x.op === '*') return unitTex(x.l) + '{\\cdot}' + unitTex(x.r);
      if (x.op === '/') { const r = unitTex(x.r); return unitTex(x.l) + '/' + (x.r.t === 'bin' && x.r.op !== '^' ? `(${r})` : r); }
      if (x.op === '^') return unitTex(x.l) + `^{${unitTex(x.r)}}`;
  }
  return tex(x);
}

// ---------- raw tree -> plain text (the same syntax people type) ----------
function txt(x) {
  const w = (y, need) => need ? '(' + txt(y) + ')' : txt(y);
  switch (x.t) {
    case 'num': return x.e !== undefined ? x.v + 'e' + x.e : x.v;
    case 'sym': return x.name;
    case 'str': return x.v;
    case 'neg': return '-' + w(x.x, prec(x.x) <= PR.ADD || x.x.t === 'neg');
    case 'rel': return txt(x.l) + ' ' + x.op + ' ' + txt(x.r);
    case 'mat': return '[' + x.rows.map(r => r.map(txt).join(', ')).join('; ') + ']';
    case 'idx': return w(x.base, x.base.t === 'bin' || x.base.t === 'neg') + '[' + x.args.map(txt).join(', ') + ']';
    case 'call': return x.name + '(' + x.args.map(txt).join(', ') + ')';
    case 'bin': {
      const { op, l, r } = x, isMD = y => y.t === 'bin' && (y.op === '*' || y.op === '/');
      if (op === '+') return txt(l) + ' + ' + w(r, r.t === 'rel' || r.t === 'neg');
      if (op === '-') return txt(l) + ' - ' + w(r, prec(r) <= PR.ADD || r.t === 'neg');
      if (op === '*') return w(l, prec(l) <= PR.ADD) + '*' + w(r, prec(r) <= PR.ADD || r.t === 'neg');
      if (op === '/') return w(l, prec(l) <= PR.ADD) + '/' + w(r, prec(r) <= PR.ADD || r.t === 'neg' || isMD(r));
      return w(l, l.t === 'bin' || l.t === 'neg' || l.t === 'rel') + '^' + w(r, r.t === 'bin' || r.t === 'neg' || r.t === 'rel');
    }
  }
  return '';
}
const toTex = c => tex(disp(c));
const toText = c => txt(disp(c));

// ---------- showing numbers with units ----------
const US_UNITS = new Set('in ft yd mi lb lbm slug lbf kip psi ksi psf ksf plf klf pcf kcf hp gal acre oz ton BTU'.split(' '));
const NEUTRAL_UNITS = new Set('s sec ms min hr day yr rad Hz rpm K mol cd amp mA V mV kV ohm g'.split(' '));
/* With no hint from the worksheet, these kinds of answers pick the prefix that reads best (1500 N -> 1.5 kN). */
const FAMILY = { '1,1,-2': [['N', 'kN', 'MN'], ['lbf', 'kip']], '-1,1,-2': [['Pa', 'kPa', 'MPa', 'GPa'], ['psi', 'ksi']], '2,1,-2': [['J', 'kJ', 'MJ'], ['ft*lbf']], '2,1,-3': [['W', 'kW', 'MW'], ['hp']] };
const FORCE_DIMS = [1, 1, -2, 0, 0, 0, 0];
const AUTO = new Map([
  ['1,0,0', ['m', 'ft']], ['2,0,0', ['m^2', 'ft^2']], ['3,0,0', ['m^3', 'ft^3']], ['4,0,0', ['mm^4', 'in^4']],
  ['1,1,-2', ['kN', 'kip']], ['2,1,-2', ['kN*m', 'kip*ft']], ['0,1,-2', ['kN/m', 'kip/ft']], ['-1,1,-2', ['MPa', 'ksi']],
  ['-2,1,-2', ['kN/m^3', 'pcf']], ['3,1,-2', ['kN*m^2', 'kip*ft^2']], ['0,1,0', ['kg', 'lb']], ['0,0,1', ['s', 's']],
  ['0,0,-1', ['1/s', '1/s']], ['1,0,-1', ['m/s', 'ft/s']], ['1,0,-2', ['m/s^2', 'ft/s^2']], ['-3,1,0', ['kg/m^3', 'lb/ft^3']],
  ['2,1,-3', ['kW', 'hp']], ['-1,0,0', ['1/m', '1/ft']], ['0,1,-1', ['kN*s/m', 'kip*s/ft']],
].map(([k, v]) => [k + ',0,0,0,0', v]));
function dimsOf(u) {
  const d = [0, 0, 0, 0, 0, 0, 0]; if (!u) return d;
  for (const f of u.t === '*' ? u.a : [u]) { const b = f.t === '^' ? f.a[0] : f, e = f.t === '^' ? val(f.a[1]) : 1; d[BASE.indexOf(b.name)] += e; }
  return d;
}
const LEN_DIMS = [1, 0, 0, 0, 0, 0, 0];
const EMPTY_ENV = { scope: new Map(), bound: new Set() };
const unitInfoCache = new Map();
function unitInfo(src) {
  let r = unitInfoCache.get(src);
  if (!r) { const raw = parseExpr(src), q = quant(numericC(ev(raw, EMPTY_ENV))); if (!q) throw new CalcError('That is not a unit'); r = { raw, f: q.v, d: dimsOf(q.u), tex: unitTex(raw), text: src }; unitInfoCache.set(src, r); }
  return r;
}
const sameDims = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
function pickUnit(u, unitRaw, v) {          // -> {f, tex, text} display unit for a base-unit monomial
  const d = dimsOf(u);
  if (unitRaw) {
    const q = quant(numericC(ev(unitRaw, EMPTY_ENV))); if (!q) throw new CalcError('What comes after = is not a unit');
    if (!sameDims(d, dimsOf(q.u))) throw new CalcError(`These units do not fit this value, which is ${u ? 'measured in ' + txt(disp(u)).replace(/\*/g, '·') : 'a plain number'}`);
    return { f: q.v, tex: unitTex(unitRaw), text: txt(unitRaw) };
  }
  if (!u) return { f: 1, tex: '', text: '' };
  // prefer a unit already used on this line, then one used elsewhere in the worksheet
  // a unit used on this line or by the values it uses, if it gives a readable number (45.5 m, not 0.0455 km)
  const readable = n => typeof v !== 'number' || !Number.isFinite(v) || v === 0 || (Math.abs(v) / UNITS[n].f >= 0.1 && Math.abs(v) / UNITS[n].f < 1e5);
  const own = C.stmtUnits.find(n => sameDims(UNITS[n].d, d) && readable(n));
  if (own) return unitInfo(own);
  if (d[0] >= 2 && d[0] <= 4 && d.slice(1).every(v => !v)) {     // areas, section moduli, inertias follow the worksheet's length unit
    const len = C.stmtUnits.find(n => sameDims(UNITS[n].d, LEN_DIMS));
    if (len && !(d[0] === 4 && (len === 'm' || len === 'ft'))) return unitInfo(`${len}^${d[0]}`);
  }
  const us = C.sysNow === 'US' ? 1 : 0, rest = d.slice(3).every(x => !x);
  if (rest && d[1] === 1 && d[2] === -2 && d[0] !== 1) {           // force × length^k follows the force and length units in use
    const fu = C.stmtUnits.find(n => sameDims(UNITS[n].d, FORCE_DIMS)), lu = C.stmtUnits.find(n => sameDims(UNITS[n].d, LEN_DIMS)) || (us ? 'ft' : 'm'), k = d[0] - 1;
    if (fu && k >= -3 && k <= 3 && k !== 0 && k !== -2) return unitInfo(k > 0 ? `${fu}*${lu}${k > 1 ? '^' + k : ''}` : `${fu}/${lu}${k < -1 ? '^' + -k : ''}`);
  }
  const fam = rest && FAMILY[d.slice(0, 3).join(',')];
  if (fam && typeof v === 'number' && Number.isFinite(v)) {
    let best = unitInfo(fam[us][0]);
    for (const n of fam[us]) { const ui = unitInfo(n); if (Math.abs(v) / ui.f >= 1) best = ui; }
    return best;
  }
  const a = AUTO.get(d.join(','));
  if (a) return unitInfo(a[us]);
  const raw = disp(u); return { f: 1, tex: unitTex(raw), text: txt(raw) };
}
const numTex = v => { const f = fmtNum(v); return f.e !== undefined ? `${f.m}\\times 10^{${f.e}}` : f.m; };
const numText = v => { const f = fmtNum(v); return f.e !== undefined ? `${f.m}e${f.e}` : f.m; };
function unevaluated(c) {
  let found = null;
  const walk = y => { if (found) return; if (y.t === 'fn') { if (['int', 'solve', 'limit', 'dsolve', 'apart', 'laplace', 'ilaplace', 'sum'].includes(y.name)) { found = y.name; return; } y.a.forEach(walk); } else if (y.t === 'm') y.r.forEach(r => r.forEach(walk)); else if (y.a) y.a.forEach(walk); };
  walk(c); return found;
}
function showNumeric(c, unitRaw) {          // canonical value -> {tex, text, check?}
  const n = numericC(c);
  if (n.t === 'b') return { tex: `\\text{${n.v}}`, text: String(n.v), check: n.v };
  const q = quant(n);
  if (q) { const u = pickUnit(q.u, unitRaw, q.v), v = q.v / u.f; return { tex: numTex(v) + (u.tex ? (u.tex[0] === '^' ? '' : '\\,') + u.tex : ''), text: numText(v) + (u.text ? ' ' + u.text : ''), displayedValue: v, displayUnit: { f: u.f, tex: u.tex, text: u.text } }; }
  if (n.t === 'm') {
    const qs = n.r.map(r => r.map(quant));
    if (qs.every(r => r.every(Boolean))) {
      const flat = qs.flat(), ref = flat.find(e => e.u && e.v !== 0) || flat.find(e => e.u), common = flat.every(e => e.v === 0 || ukey(e) === (ref ? ukey(ref) : ''));
      if (common) {
        const u = pickUnit(ref ? ref.u : null, unitRaw, Math.max(...flat.map(e => Math.abs(e.v))));
        return { tex: '\\begin{bmatrix}' + qs.map(r => r.map(e => numTex(e.v / u.f)).join(' & ')).join(' \\\\ ') + '\\end{bmatrix}' + (u.tex ? '\\;' + u.tex : ''), text: '[' + qs.map(r => r.map(e => numText(e.v / u.f)).join(', ')).join('; ') + ']' + (u.text ? ' ' + u.text : '') };
      }
      const cell = e => { const u = pickUnit(e.u, null, e.v); return { tex: numTex(e.v / u.f) + (u.tex ? '\\,' + u.tex : ''), text: numText(e.v / u.f) + (u.text ? ' ' + u.text : '') }; };
      const cs = qs.map(r => r.map(cell));
      return { tex: '\\begin{bmatrix}' + cs.map(r => r.map(e => e.tex).join(' & ')).join(' \\\\ ') + '\\end{bmatrix}', text: '[' + cs.map(r => r.map(e => e.text).join(', ')).join('; ') + ']' };
    }
  }
  const free = [...symbolsOf(n)].filter(s => !BASEU.has(s));
  if (free.includes('%i')) { const d = disp(n); return { tex: tex(d), text: txt(d) }; }
  if (free.includes('%inf')) { const d = disp(n); return { tex: tex(d), text: txt(d) }; }
  const names = free.filter(s => s[0] !== '%');
  if (names.length) throw new CalcError(`No value yet for ${names.slice(0, 4).join(', ')}. Define ${names.length > 1 ? 'them' : 'it'} above this line, or end the line with -> for a symbolic answer.`);
  const un = unevaluated(n);
  if (un) throw new CalcError('This could not be worked out to a number');
  if (n.t === '+') throw new CalcError('These units cannot be added together, for example a length plus a force');
  if (n.t === 'rel') throw new CalcError('Both sides need values to compare');
  throw new CalcError('This could not be worked out to a number');
}

// Expand previously defined variables for a readable, unit-preserving substitution line.
function expandDisplayExpr(x, scope, seen = new Set()) {
  if (!x || typeof x !== 'object') return x;
  if (x.t === 'sym') {
    const entry = scope.get(x.name);
    // Prefer the expression snapshot captured when this value was defined.
    // Unresolved names remain symbols and can still use the worksheet's late binding.
    const source = entry && (entry.displayExpr || entry.expr);
    if (entry && !entry.fn && source && !seen.has(x.name)) {
      const next = new Set(seen); next.add(x.name);
      return expandDisplayExpr(source, scope, next);
    }
    return { ...x };
  }
  if (Array.isArray(x)) return x.map(v => expandDisplayExpr(v, scope, seen));
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = expandDisplayExpr(v, scope, seen);
  return out;
}

// Expand defined variables even when the line is a unit conversion.
// The substitution keeps the source units; showNumeric formats the final value
// in the requested target unit.
function substitutedDisplayTex(expr, scope) {
  const expanded = expandDisplayExpr(expr, scope);
  return tex(expanded) !== tex(expr) ? '= ' + tex(expanded) : '';
}

// A conversion of a previously calculated scalar quantity is a conversion
// of its stored display value, not another expansion of its defining formula.
function conversionDisplayTex(expr, scope, targetUnit) {
  if (!targetUnit || expr.t !== 'sym') return '';
  const entry = scope.get(expr.name), shown = entry && entry.displayNumeric;
  if (!shown || !shown.displayUnit || !shown.displayUnit.tex) return '';
  const targetQ = quant(numericC(ev(targetUnit, EMPTY_ENV))), source = shown.displayUnit;
  if (!targetQ) return '';
  const q = quant(numericC(entry.v));
  if (!q || !sameDims(dimsOf(q.u), dimsOf(targetQ.u))) return '';
  const factor = source.f / targetQ.v, factorTex = Number(factor.toPrecision(6)).toString(), targetTex = unitTex(targetUnit);
  return '= ' + numTex(shown.displayedValue) + '\\,' + source.tex +
    '\\times ' + factorTex + '\\,\\frac{' + targetTex + '}{' + source.tex + '}';
}

// ---------- running a worksheet ----------
const SHAPERS = new Set(['factor', 'expand', 'apart', 'collect', 'ratsimp', 'simplify', 'taylor', 'float', 'coeffs']);
const ARROW = kw => kw ? `\\xrightarrow{\\text{${kw}}}` : '\\rightarrow ';
const KW = { series: 'taylor', derivative: 'diff', integrate: 'int', integral: 'int', numeric: 'float', evalf: 'float', partfrac: 'apart' };
function runStatement(st, scope) {
  const env = { scope, bound: new Set() };
  let { kind, expr, name, params, lhs } = st;
  if (kind === 'empty') return { kind: 'empty', tex: '' };
  if (kind === 'expr' && expr.t === 'rel' && expr.op === '=') {            // "x = 5" on a new name is a definition
    const l = expr.l;
    if (l.t === 'sym' && !scope.has(l.name) && !CONSTS[l.name]) { kind = 'def'; name = l.name; lhs = l; expr = expr.r; }
    else if (l.t === 'call' && l.args.length && l.args.every(a => a.t === 'sym') && !scope.has(l.name) && !FN[l.name] && !NF[l.name] && !BIND[l.name] && l.name !== 'if' && l.name.length > 0 && !UNITS[l.name] && !(l.args.length === 1 && l.name.length === 1 && scope.has(l.args[0].name))) { kind = 'def'; name = l.name; params = l.args.map(a => a.name); lhs = l; expr = expr.r; }
  }
  const inTex = withNames([...(params || []), ...(kind === 'def' ? [name] : [])], () => tex(expr));
  const symbolic = (c) => {
    let kw = '', r;
    if (st.mod) {
      kw = st.mod.kw; const f = KW[kw] || kw;
      if (!FN[f] && !BIND[f]) throw new CalcError(`"${kw}" is not a keyword. Try simplify, expand, factor, float, or solve, x`);
      r = BIND[f] || f === 'subs' ? evCall({ t: 'call', name: f, args: [expr, ...st.mod.args] }, env) : fn(f, [c, ...st.mod.args.map(a => ev(a, bind(env, a.t === 'sym' ? [a.name] : [])))]);
    } else r = expr.t === 'call' && SHAPERS.has(expr.name) ? c : simplify(c);   // keep the form the person asked for
    return { r, kw };
  };
  if (kind === 'def') {
    const lt = withNames([name, ...(params || [])], () => tex(lhs));
    if (params) {
      if (FN[name] || NF[name] || BIND[name]) throw new CalcError(`${name} is a built-in function. Pick another name.`);
      let body = ev(expr, bind(env, params)), extra = '', text = '';
      if (st.show === 'sym') { const s = symbolic(body); if (!st.mod || !BIND[KW[s.kw] || s.kw]) { body = s.r; } extra = ARROW(s.kw) + toTex(s.r); text = toText(s.r); }
      scope.set(name, { fn: true, params, body });
      return { kind: 'def', name, params, tex: lt + '\\mathrel{:=}' + inTex, res: extra, text, hint: unevaluated(body) };
    }
    let v = ev(expr, env), extra = '', text = '', check, subTex = '', displayNumeric;
    if (st.show === 'sym') { const s = symbolic(v); v = s.r; extra = ARROW(s.kw) + toTex(v); text = toText(v); }
    else if (st.show === 'num') {
      subTex = substitutedDisplayTex(expr, scope);
      const s = showNumeric(v, st.unit); displayNumeric = s; extra = '=' + s.tex; text = s.text; check = s.check;
    }
    // Keep the display expansion and the formatted numeric value as snapshots.
    const displayExpr = expandDisplayExpr(expr, scope);
    scope.set(name, { v, expr, displayExpr, displayNumeric });
    return { kind: 'def', name, value: v, tex: lt + '\\mathrel{:=}' + inTex, subTex, res: extra, text, check, hint: unevaluated(v) };
  }
  if (kind === 'eval') {
    if (st.show === 'sym') { const s = symbolic(st.mod && (BIND[KW[st.mod.kw] || st.mod.kw]) ? ZERO : ev(expr, env)); return { kind: 'sym', value: s.r, tex: inTex, res: ARROW(s.kw) + toTex(s.r), text: toText(s.r), hint: unevaluated(s.r) }; }
    const v = ev(expr, env), s = showNumeric(v, st.unit);
    const subTex = conversionDisplayTex(expr, scope, st.unit) || substitutedDisplayTex(expr, scope);
    return { kind: 'eval', value: v, tex: inTex, subTex, res: '=' + s.tex, text: s.text, check: s.check };
  }
  // a bare expression: show a value when there is one
  const v = ev(expr, env);
  try {
    const s = showNumeric(v, null);
    if (s.check !== undefined && expr.t === 'rel') return { kind: 'check', value: v, tex: inTex, res: '', text: s.text, check: s.check };
    return { kind: 'eval', value: v, tex: inTex, res: '=' + s.tex, text: s.text, check: s.check };
  } catch (e) { if (!(e instanceof CalcError)) throw e; }
  return { kind: 'expr', value: v, tex: inTex, res: '', text: '' };
}

function withNames(extra, f) {               // typeset with some extra names treated as variables
  const set = C.userNames, added = [];
  if (set) for (const n of extra || []) if (!set.has(n)) { set.add(n); added.push(n); }
  try { return f(); } finally { for (const n of added) set.delete(n); }
}
function definedNames(st) {
  if (st.kind === 'def') return [st.name];
  if (st.kind === 'expr' && st.expr.t === 'rel' && st.expr.op === '=') { const l = st.expr.l; if (l.t === 'sym') return [l.name]; if (l.t === 'call') return [l.name]; }
  return [];
}
const parseCache = new Map();
function parseCached(src) {
  let r = parseCache.get(src);
  if (!r) { try { r = { st: parseStatement(src) }; } catch (e) { if (!(e instanceof CalcError)) throw e; r = { err: e.message }; } if (parseCache.size > 4000) parseCache.clear(); parseCache.set(src, r); }
  return r;
}
/* regions: [{id,type:'math'|'text'|'plot',src,...}] -> {results: Map(id -> result), vars: [{name,text,id}]} */
function evalDoc(regions) {
  const parsed = new Map(), names = new Set();
  for (const rg of regions) if (rg.type === 'math') { const p = parseCached(rg.src || ''); parsed.set(rg.id, p); if (p.st) definedNames(p.st).forEach(n => names.add(n)); }
  C.userNames = names;
  const live = new Set();
  // which units does this worksheet use? (decides how results are shown)
  let us = 0, si = 0; const hints = new Map(), idsIn = src => String(src).match(/[A-Za-z_\u0370-\u03FF][A-Za-z0-9_']*/g) || [];
  const srcOf = rg => rg.type === 'math' ? rg.src || '' : rg.type === 'plot' ? [rg.exprs, rg.x0, rg.x1, rg.p0, rg.p1].join(' ') : '';
  for (const rg of regions) for (const n of idsIn(srcOf(rg))) if (UNITS[n] && !names.has(n)) { if (US_UNITS.has(n)) us++; else if (!NEUTRAL_UNITS.has(n)) si++; }
  C.sysNow = C.system === 'US' || C.system === 'SI' ? C.system : us > si ? 'US' : 'SI';
  const scope = new Map(), results = new Map(), vars = [];
  C.userNames = live;                        // from here on a name counts as a variable only once it has been defined
  for (const rg of regions) {
    // units to prefer when showing this line: its own, then those of the values it uses
    const ids = idsIn(srcOf(rg)), pref = ids.filter(n => UNITS[n] && n !== 'g' && !live.has(n));
    for (const n of ids) if (live.has(n) && hints.has(n)) pref.push(...hints.get(n).filter(u => u !== 'GPa'));
    C.stmtUnits = [...new Set(pref)];
    if (rg.type === 'math') {
      const p = parsed.get(rg.id);
      if (p.err) { results.set(rg.id, { err: p.err }); continue; }
      let inTex = '';
      try {
        const r = runStatement(p.st, scope); results.set(rg.id, r);
        if (r.kind === 'def' && !r.params && !r.text && r.value) {      // a short value for the outline
          try { r.vtext = showNumeric(r.value, null).text; } catch (e2) { if (!(e2 instanceof CalcError)) throw e2; const s = toText(r.value); r.vtext = s.length > 40 ? s.slice(0, 38) + '…' : s; }
        }
        if (r.kind === 'def') { live.add(r.name); hints.set(r.name, C.stmtUnits.slice(0, 16)); vars.push({ name: r.name, id: rg.id, tex: symTex(r.name, false), text: r.text || r.vtext || '', fn: !!r.params }); }
      } catch (e) {
        try { inTex = withNames(p.st.params, () => (p.st.lhs ? tex(p.st.lhs) + '\\mathrel{:=}' : '') + tex(p.st.expr)); } catch (e2) { /* keep empty */ }
        if (e instanceof Pending) results.set(rg.id, { pending: true, tex: inTex });
        else if (e instanceof CalcError) results.set(rg.id, { err: e.message, tex: inTex });
        else if (e instanceof RangeError) results.set(rg.id, { err: 'This is too deeply nested to work out', tex: inTex });
        else throw e;
      }
    } else if (rg.type === 'plot') {
      try { results.set(rg.id, prepPlot(rg, scope)); }
      catch (e) { if (e instanceof Pending) results.set(rg.id, { pending: true }); else if (e instanceof CalcError) results.set(rg.id, { err: e.message }); else throw e; }
    }
  }
  return { results, vars };
}

/* Plot region -> compiled curves. Everything is computed in SI and scaled for display. */
function prepPlot(rg, scope) {
  const env = { scope, bound: new Set() };
  const xv = (rg.xvar || 'x').trim(), anim = rg.anim === 'param', pv = anim ? (rg.pvar || 't').trim() : '%none';
  if (!/^[A-Za-z_\u0370-\u03FF][A-Za-z0-9_']*$/.test(xv) || (anim && !/^[A-Za-z_\u0370-\u03FF][A-Za-z0-9_']*$/.test(pv))) throw new CalcError('The plot variable needs to be a plain name such as x or t');
  if (anim && pv === xv) throw new CalcError(`The swept value needs a different name from the plot variable ${xv}`);
  const numQ = (src, what) => { if (!String(src).trim()) throw new CalcError(`Fill in ${what}`); const q = quant(numericC(ev(parseExpr(String(src)), env))); if (!q) throw new CalcError(`${what} needs to be a number, but "${src}" is not`); return q; };
  const qa = numQ(rg.x0, 'the start of the range'), qb = numQ(rg.x1, 'the end of the range');
  if (qa.v === qb.v) throw new CalcError('The range starts and ends at the same value');
  const ux = qa.u || qb.u;
  let qp0 = null, qp1 = null, up = null;
  if (anim) { qp0 = numQ(rg.p0, 'the animation start'); qp1 = numQ(rg.p1, 'the animation end'); up = qp0.u || qp1.u; }
  const e2 = bind(env, anim ? [xv, pv] : [xv]);
  const srcs = String(rg.exprs || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean);
  if (!srcs.length) throw new CalcError('Type something to plot, for example sin(x)');
  let yu = null, ymag; const curves = [];
  for (const s of srcs) {
    const raw = parseExpr(s), cN = numericC(ev(raw, e2));
    const free = [...symbolsOf(cN)].filter(n => n !== xv && !(anim && n === pv) && !BASEU.has(n) && n[0] !== '%');
    if (free.length) throw new CalcError(`No value yet for ${free.join(', ')} in "${s}"`);
    let u = null;
    try { const q = quant(subst(cN, new Map([[xv, mkq(qa.v + (qb.v - qa.v) * 0.37, ux)], [pv, anim ? mkq(qp0.v + (qp1.v - qp0.v) * 0.41, up) : S(pv)]]))); if (q) { u = q.u; if (curves.length === 0) ymag = q.v; } } catch (e) { if (!(e instanceof CalcError)) throw e; }
    if (curves.length === 0) yu = u;
    curves.push({ f: compile(cN, [xv, pv]), tex: withNames([xv, pv], () => tex(raw)), text: s, mismatch: curves.length > 0 && key(u || ZERO) !== key(yu || ZERO) });
  }
  const U = (u, mag) => { const p = pickUnit(u, null, mag); return { f: p.f, tex: p.tex, text: p.text.replace(/\*/g, '·') }; };
  return { plot: true, curves, a: qa.v, b: qb.v, xu: U(ux), yu: U(yu, ymag), p0: anim ? qp0.v : 0, p1: anim ? qp1.v : 0, pu: U(up), xv, pv, xtex: symTex(xv, false), ptex: symTex(pv, false) };
}

// ---------- LaTeX input -> plain syntax ----------
const LFUNCS = { sin: 'sin', cos: 'cos', tan: 'tan', sec: 'sec', csc: 'csc', cot: 'cot', arcsin: 'asin', arccos: 'acos', arctan: 'atan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', ln: 'ln', log: 'log', exp: 'exp', det: 'det', min: 'min', max: 'max' };
const LWORDS = { cdot: '*', times: '*', ast: '*', div: '/', pm: '+', le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=', to: '->', rightarrow: '->', Rightarrow: '->', implies: '->', approx: '=', coloneqq: ':=', infty: ' inf ', circ: ' deg ', degree: ' deg ', lbrace: '(', rbrace: ')', lbrack: '[', rbrack: ']' };
function latexToSrc(src) {
  const pre = src.replace(/\\\\/g, '\u0001').replace(/\\left\s*\|/g, '\\abs(').replace(/\\right\s*\|/g, ')').replace(/\\[,;:!]/g, ' ').replace(/\\ /g, ' ').replace(/~/g, ' ')
    .replace(/\\(left|right|displaystyle|limits|quad|qquad|big|Big|bigg)(?![A-Za-z])/g, ' ').replace(/\$/g, '');
  const conv = s => {
    let i = 0, out = '', plain = false;
    const skip = () => { while (s[i] === ' ') i++; };
    const grp = () => {
      skip();
      if (s[i] === '{') { let d = 1, j = i + 1; while (j < s.length && d) { if (s[j] === '{') d++; else if (s[j] === '}') d--; j++; } const inner = s.slice(i + 1, j - 1); i = j; return inner; }
      if (s[i] === '\\') { const m = /^\\[A-Za-z]+/.exec(s.slice(i)); if (m) { i += m[0].length; return m[0]; } }
      return s[i++] || '';
    };
    const operand = () => {                // what an operator like d/dx or Σ applies to
      skip();
      let d = 0, j = i;
      if (s[j] === '(') { for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')' && --d === 0) { j++; break; } } }
      else for (; j < s.length; j++) { const c = s[j]; if (c === '{' || c === '(') d++; else if (c === '}' || c === ')') { if (d === 0) break; d--; } else if (d === 0 && j > i && '+-='.includes(c)) break; }
      const r = s.slice(i, j); i = j; return r;
    };
    const limits = () => { let lo = null, hi = null; for (let k = 0; k < 2; k++) { skip(); if (s[i] === '_') { i++; lo = grp(); } else if (s[i] === '^') { i++; hi = grp(); } } return [lo, hi]; };
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') {
        const m = /^\\([A-Za-z]+)/.exec(s.slice(i));
        if (!m) { const d = s[i + 1]; i += 2; out += d === '{' ? '(' : d === '}' ? ')' : d === '\\' ? ';' : ''; plain = false; continue; }
        const cmd = m[1]; i += m[0].length; plain = false;
        if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
          const A = grp(), B = grp();
          const bm = /^\s*d\s*(\\[A-Za-z]+|[A-Za-z])\s*(?:\^\s*\{?(\d)\}?)?\s*$/.exec(B);
          if (bm && /^\s*d\s*(?:\^\s*\{?\d\}?)?\s*$/.test(A)) out += `diff(${conv(operand())}, ${conv(bm[1]).trim()}${bm[2] ? ', ' + bm[2] : ''})`;
          else { const dy = /^\s*d\s*(\S.*)$/.exec(A); if (bm && dy && !/[+\-*/]/.test(dy[1])) out += `diff(${conv(dy[1]).trim()}, ${conv(bm[1]).trim()})`; else out += `((${conv(A)})/(${conv(B)}))`; }
        } else if (cmd === 'sqrt') {
          skip(); let n = null; if (s[i] === '[') { const j = s.indexOf(']', i); if (j > i) { n = s.slice(i + 1, j); i = j + 1; } else i++; }
          const A = grp(); out += n ? `root(${conv(A)}, ${conv(n)})` : `sqrt(${conv(A)})`;
        } else if (cmd === 'abs') out += 'abs';
        else if (['text', 'mathrm', 'operatorname', 'mathit', 'mathbf', 'textit', 'mathsf', 'boldsymbol', 'textbf'].includes(cmd)) out += ' ' + grp().trim().replace(/\s+/g, '_') + ' ';
        else if (cmd === 'int') {
          const [lo, hi] = limits(), rest = s.slice(i), dm = /(^|[^A-Za-z\\])d\s*(\\[A-Za-z]+|[A-Za-z])(?![A-Za-z(])/.exec(rest);
          const body = dm ? rest.slice(0, dm.index + dm[1].length) : rest, v = dm ? conv(dm[2]).trim() : 'x', after = dm ? rest.slice(dm.index + dm[0].length) : '';
          out += `int(${conv(body)}, ${v}${lo !== null && hi !== null ? `, ${conv(lo)}, ${conv(hi)}` : ''})` + conv(after); i = s.length;
        } else if (cmd === 'sum' || cmd === 'prod') {
          const [lo, hi] = limits(), eq = (lo || 'k=1').split('=');
          out += `${cmd}(${conv(operand())}, ${conv(eq[0]).trim()}, ${conv(eq[1] || '1')}, ${conv(hi || 'n')})`;
        } else if (cmd === 'lim') {
          skip(); let sub = 'x \\to 0'; if (s[i] === '_') { i++; sub = grp(); }
          const pr = sub.split(/\\to|\\rightarrow|->/);
          out += `limit(${conv(operand())}, ${conv(pr[0]).trim()}, ${conv(pr[1] || '0')})`;
        } else if (cmd === 'begin') {
          const en = grp(), tag = '\\end{' + en + '}', j = s.indexOf(tag, i), body = s.slice(i, j < 0 ? s.length : j); i = j < 0 ? s.length : j + tag.length;
          out += '[' + body.split('\u0001').filter(r => r.trim()).map(r => r.split('&').map(conv).join(', ')).join('; ') + ']';
        } else if (cmd === 'end') grp();
        else if (LFUNCS[cmd]) {
          skip(); let pw = null; if (s[i] === '^') { i++; pw = grp(); skip(); }
          if (s[i] === '(') { const a = operand(); out += `${LFUNCS[cmd]}${conv(a)}` + (pw ? `^(${conv(pw)})` : ''); }
          else { let a; if (s[i] === '{') a = grp(); else { const am = /^(\\[A-Za-z]+|[0-9.]+|[A-Za-z])(_\{[^}]*\}|_[A-Za-z0-9])?/.exec(s.slice(i)); a = am ? am[0] : ''; i += a.length; } out += `${LFUNCS[cmd]}(${conv(a)})` + (pw ? `^(${conv(pw)})` : ''); }
        } else if (LWORDS[cmd] !== undefined) out += LWORDS[cmd];
        else out += ' ' + cmd;
        continue;
      }
      if (c === '{') { out += '(' + conv(grp()) + ')'; plain = false; continue; }
      if (c === '^') { i++; const t = conv(grp()).trim(); out += t === 'deg' ? ' deg ' : t === 'T' ? '^T' : `^(${t})`; plain = false; continue; }
      if (c === '_') {
        i++; const run = /^[A-Za-z0-9]+/.exec(s.slice(i));
        let sb; if (run) { sb = run[0]; i += sb.length; } else sb = conv(grp()).replace(/[^A-Za-z0-9]/g, '');
        out = out.replace(/\s+$/, '') + '_' + sb; continue;
      }
      if (c === '}') { i++; continue; }
      if (c === '\u0001') { i++; out += ';'; continue; }
      if (c === '&') { i++; out += ','; continue; }
      if (/[A-Za-z]/.test(c)) {               // LaTeX letters are separate variables, unless the word is a known name
        const w = /^[A-Za-z]+/.exec(s.slice(i))[0]; i += w.length;
        const whole = w.length === 1 || UNITS[w] || CONSTS[w] || FN[w] || NF[w] || BIND[w] || GREEKS.has(w) || (C.userNames && C.userNames.has(w));
        if (/[A-Za-z0-9_']$/.test(out)) out += ' ';
        out += whole ? w : w.split('').join(' '); continue;
      }
      out += c; i++;
    }
    return out;
  };
  return conv(pre).replace(/\s+/g, ' ').trim();
}
