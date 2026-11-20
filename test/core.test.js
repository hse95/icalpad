// Engine tests: node test/core.test.js
const Core = require('../dist/core.cjs');
let pass = 0, fail = 0;
function run(lines) {
  const regions = lines.map((src, i) => ({ id: 'r' + i, type: 'math', src }));
  const { results } = Core.evalDoc(regions);
  return regions.map(r => results.get(r.id));
}
function last(lines) { const r = run(Array.isArray(lines) ? lines : [lines]); return r[r.length - 1]; }
function t(lines, want, label) {
  let got;
  try { const r = last(lines); got = r.err ? 'ERR: ' + r.err : r.pending ? 'PENDING' : r.text; } catch (e) { got = 'THROW: ' + e.stack.split('\n').slice(0, 3).join(' | '); }
  const ok = want instanceof RegExp ? want.test(got) : got === want;
  if (ok) pass++; else { fail++; console.log(`FAIL ${label || JSON.stringify(lines)}\n   got:  ${got}\n   want: ${want}`); }
}

// arithmetic and numbers
t('2+3 =', '5');
t('1/3 + 1/6 ->', '1/2');
t('2^10 =', '1024');
t('sqrt(8) ->', '2*sqrt(2)');
t('sqrt(16) =', '4');
t('(1/2)^(1/2) ->', 'sqrt(2)/2');
t('sqrt(-4) ->', '2*i');
t('sin(pi/6) ->', '1/2');
t('cos(pi/4) ->', 'sqrt(2)/2');
t('sin(30 deg) =', '0.5');
t('tan(pi/4) ->', '1');
t('e^(ln(5)) ->', '5');
t('ln(e^3) ->', '3');
t('5! =', '120');
t('1.5e3 * 2 =', '3000');
t('abs(-3.2) =', '3.2');
t('max(3, 7, 5) =', '7');
t('if(2 > 1, 10, 20) =', '10');
t('2x + 3x ->', '5*x');
t('x*x^2 ->', 'x^3');
t('(x^2)^(1/2) ->', 'x');
t('x - x ->', '0');
t('3 > 2', 'true');
t('1/0 =', /Division by zero/);

// definitions, functions
t(['a := 3', 'b := 4', 'sqrt(a^2 + b^2) ='], '5');
t(['f(x) := x^2 + 1', 'f(3) ='], '10');
t(['f(x) := x^2 + 1', 'f(y) ->'], 'y^2 + 1');
t(['x = 5', 'x + 1 ='], '6', 'auto definition');
t(['f(x, y) := x*y', 'f(2, 3) ='], '6');
t(['w := 2', 'w(3 + 1) ='], '8', 'variable times bracket');
t('foo(3) =', /not a known function/);
t('y + 1 =', /No value yet for y/);

// units
t('10 kN * 2 m =', '20 kN·m'.replace('·', '*'));
t('5 m + 20 cm =', '5.2 m');
t('5 m + 2 s =', /cannot be added/);
t('1 ft = in', '12 in');
t('1 kip = kN', '4.448 kN');
t('100 MPa = ksi', '14.5 ksi');
t('sqrt(16 m^2) =', '4 m');
t(['w := 12 kN/m', 'L := 6 m', 'w*L^2/8 ='], '54 kN*m');
t(['w := 12 kN/m', 'L := 6 m', 'M := w*L^2/8 = kip*ft'], '39.83 kip*ft');
t(['P := 100 kN', 'A := 2000 mm^2', 'P/A ='], '50 MPa');
t(['P := 100 kN', 'A := 2000 mm^2', 'P/A <= 250 MPa'], 'true');
t('5 m = kN', /do not fit/);
t('max(3 m, 200 cm) =', '3 m');
t('sin(3 m) =', /without units/);
t(['E := 200 GPa', 'I := 8.5e-5 m^4', 'E*I ='], '17000 kN*m^2');
t('3 kN/m * 2 m ->', '6*kN');
t(['m := 5', 'm*2 ='], '10', 'user name shadows a unit');

// symbolic algebra
t('expand((x+1)^3) ->', 'x^3 + 3*x^2 + 3*x + 1');
t('(x+1)^3 -> expand', 'x^3 + 3*x^2 + 3*x + 1');
t('(x^2 - 1)/(x - 1) ->', 'x + 1');
t('(x^2 - 1)/(x - 1) -> simplify', 'x + 1');
t('(a^2 - b^2)/(a - b) -> simplify', 'a + b');
t('factor(x^2 - 5x + 6) ->', '(x - 2)*(x - 3)');
t('x^3 - 6x^2 + 11x - 6 -> factor', '(x - 1)*(x - 2)*(x - 3)');
t('ratsimp(1/x + 1/y) ->', '(x + y)/(x*y)');
t('sin(x)^2 + cos(x)^2 -> simplify', '1');
t('a/b * b/a ->', '1');
t('(x+1)^2 - (x^2 + 2x + 1) -> simplify', '0');
t('0.5 x + 0.25 x ->', '0.75*x');
t('subs(x^2 + y, x, 3) ->', 'y + 9');
t('x^2 + y -> subs, x, 3', 'y + 9');

// calculus
t('diff(x^3, x) ->', '3*x^2');
t('diff(sin(2x), x) ->', '2*cos(2*x)');
t('diff(x*e^x, x) -> simplify', /e\^x/);
t('diff(ln(x), x) ->', '1/x');
t('diff(x^4, x, 2) ->', '12*x^2');
t('int(x^2, x) ->', 'x^3/3');
t('int(1/x, x) ->', 'ln(x)');
t('int(sin(x), x) ->', '-cos(x)');
t('int(cos(3x), x) ->', 'sin(3*x)/3');
t('int(e^(2x), x) ->', 'e^(2*x)/2');
t('int(x*e^x, x) ->', /e\^x/);
t('int(x*sin(x), x) ->', /sin\(x\)/);
t('int(x*cos(x^2), x) ->', 'sin(x^2)/2');
t('int(1/(x^2+1), x) ->', 'atan(x)');
t('int(sin(x)^2, x) ->', /sin\(2\*x\)/);
t('int(x^2, x, 0, 3) ->', '9');
t('int(sin(x), x, 0, pi) ->', '2');
t('int(w*x*(L - x)/2, x, 0, L) ->', 'L^3*w/12');
t('int(1/(x^2 - 1), x) ->', /ln/);
t('int(ln(x), x) ->', /x\*ln\(x\) - x|-x \+ x\*ln\(x\)/);
t('int(x/(x^2+1), x) ->', /ln\(x\^2 \+ 1\)\/2/);
t('int(e^(-x^2), x, 0, 1) =', '0.7468');
t('int(x*sqrt(x+1), x) -> simplify', /\(x \+ 1\)/);
t('limit(sin(x)/x, x, 0) ->', '1');
t('limit((x^2-1)/(x-1), x, 1) ->', '2');
t('limit((2x^2+1)/(x^2-3), x, inf) ->', '2');
t('taylor(e^x, x, 0, 3) ->', 'x^3/6 + x^2/2 + x + 1');
t('sum(k^2, k, 1, 10) ->', '385');
t(['M(x) := w*x*(L - x)/2', 'diff(M(x), x) ->'], /L\*w\/2 - w\*x|w\*\(L - 2\*x\)\/2/);
t(['w := 10 kN/m', 'L := 6 m', 'M(x) := w*x*(L - x)/2', 'M(3 m) ='], '45 kN*m');
t(['w := 10 kN/m', 'L := 6 m', 'int(w*x, x, 0, L) ='], '180 kN*m');

// solving
t('solve(2x + 6 = 0, x) ->', '-3');
t('solve(x^2 = 4, x) ->', '[2; -2]');
t('solve(x^2 - 5x + 6, x) ->', '[3; 2]');
t('solve(a*x^2 + b*x + c = 0, x) ->', /sqrt\(b\^2 - 4\*a\*c\)/);
t('solve(x^3 - 6x^2 + 11x - 6 = 0, x) ->', '[1; 2; 3]');
t('solve(e^(2x) = 5, x) ->', 'ln(5)/2');
t('solve([x + y = 10, x - y = 2], [x, y]) ->', '[6; 4]');
t('solve([R_A + R_B = w*L, R_B*L = w*L^2/2], [R_A, R_B]) ->', '[L*w/2; L*w/2]');
t('solve(w*L^2/8 = M, L) ->', /sqrt/);
t('x^2 = 9 -> solve, x', '[3; -3]');
t('solve(x^5 - x - 1 = 0, x) ->', /1\.167/);
t('nsolve(cos(x) = x, x, 1) =', '0.7391');
t(['Mcap := 120 kN*m', 'w := 15 kN/m', 'Lmax := solve(w*L^2/8 = Mcap, L)', 'Lmax[1] ='], '8 m');

// matrices
t('[1, 2; 3, 4] * [5; 6] ->', '[17; 39]');
t('det([1, 2; 3, 4]) ->', '-2');
t('inv([2, 0; 0, 4]) ->', '[1/2, 0; 0, 1/4]');
t('[1, 2; 3, 4]^T ->', '[1, 3; 2, 4]');
t('lsolve([2, 1; 1, 3], [3; 5]) ->', '[4/5; 7/5]');
t(['K := [400, -200; -200, 200] kN/m', 'F := [0; 10] kN', 'u := lsolve(K, F) = mm'], '[50; 100] mm');
t(['A := [1, 2; 3, 4]', 'A[2,1] ='], '3');
t('eigenvals([2, 0; 0, 3]) =', '[2; 3]');
t('eigenvals([2, -1; -1, 2]) =', '[1; 3]');
t('det([a, b; c, d]) ->', 'a*d - b*c');

// LaTeX input
t('\\frac{1}{2} + \\frac{1}{3} ->', '5/6');
t('\\sqrt{16} =', '4');
t('\\int_{0}^{1} x^2 \\, dx ->', '1/3');
t('\\frac{d}{dx} x^3 ->', '3*x^2');
t('\\sin\\left(\\frac{\\pi}{2}\\right) ->', '1');
t(['w := 8', 'L := 4', '\\frac{wL^2}{8} ='], '16');
t('\\sum_{k=1}^{4} k ->', '10');
t('\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix} ->', '[1, 2; 3, 4]');

// harder cases
t('int(x^2*e^x, x) ->', /e\^x/);
t('int(e^x*sin(x), x) ->', /e\^x/);
t('int(1/(x*(x+1)), x) ->', /ln/);
t('int((x^3+1)/(x+1), x) ->', 'x^3/3 - x^2/2 + x');
t('int(sin(x)*cos(x), x) ->', /cos\(2\*x\)|sin\(x\)\^2/);
t('int(tan(x), x) ->', '-ln(cos(x))');
t('int(1/sqrt(1 - x^2), x) ->', 'asin(x)');
t('int(sqrt(4 - x^2), x, 0, 2) ->', 'π');
t('int(x^2*ln(x), x) ->', /ln\(x\)/);
t('int(1/(x^2 + 4x + 13), x) ->', /atan/);
t('int(cos(x)^3, x) ->', /sin/);
t('int(x^3/(x^2+1), x) ->', /ln\(x\^2 \+ 1\)/);
t('diff(int(x^2*sin(x), x), x) -> simplify', 'x^2*sin(x)');
t('limit((1 - cos(x))/x^2, x, 0) ->', '1/2');
t('limit((e^x - 1)/x, x, 0) ->', '1');
t('limit(1/x, x, inf) ->', '0');
t('solve(sqrt(x + 1) = 3, x) ->', '8');
t('solve(x^4 - 5x^2 + 4 = 0, x) ->', '[1; -1; 2; -2]');
t('solve(1/x + 1/(x+1) = 1, x) ->', /sqrt\(5\)/);
t('solve(x^2 + 1 = 0, x) ->', '[i; -i]');
t('solve(x^2 + 2x + 5 = 0, x) ->', '[-1 + 2*i; -1 - 2*i]');
t(['E := 200 GPa', 'I := 8500 cm^4', 'L := 6 m', 'w := 12 kN/m', 'delta := 5*w*L^4/(384*E*I) = mm'], '11.91 mm');
t(['EI := 1', 'y(x) := int(int(w*x*(L-x)/2, x), x) + C1*x + C2', 'solve([y(0) = 0, y(L) = 0], [C1, C2]) ->'], '[-L^3*w/24; 0]');
t(['k := 2000 kN/m', 'm := 5000 kg', 'omega := sqrt(k/m) ='], '20 1/s');
t(['k := 2000 kN/m', 'm := 5000 kg', 'f := sqrt(k/m)/(2 pi) = Hz'], '3.183 Hz');
t(['sx := 80 MPa', 'sy := -40 MPa', 'txy := 25 MPa', 's1 := (sx+sy)/2 + sqrt(((sx-sy)/2)^2 + txy^2) ='], '85 MPa');
t(['fc := 4 ksi', 'fy := 60 ksi', 'As := 3 in^2', 'b := 12 in', 'd := 20 in', 'a := As*fy/(0.85*fc*b) = in'], '4.412 in');
t(['E := 29000 ksi', 'I := 100 in^4', 'L := 12 ft', 'Pcr := pi^2*E*I/L^2 = kip'], '1380 kip');
t('2 m * 3 m = ft^2', '64.58 ft^2');
t('100 kN/m^2 = psf', '2089 psf');
t('float(pi) ->', '3.142');
t('pi -> float', '3.142');
t('1/3 =', '0.3333');
t('123456.789 =', '123457');
t('0.000012345 =', '1.235e-5');
t('M_max := 5 =', '5');
t("f'c := 4 ksi =", '4 ksi');
t('2 + ', /missing/);
t('(2 + 3', /closing/);
t('[1,2;3] ->', /same number/);
t('collect(a*x^2 + b*x + 3*x + x^2, x) ->', /x\^2/);
t('taylor(sin(x), x, 0, 5) ->', 'x^5/120 - x^3/6 + x');
t('x^2 -> diff, x', '2*x');
t('sin(x) -> int, x', '-cos(x)');
t('expand((a+b)*(a-b)) ->', 'a^2 - b^2');
t('\\frac{w L^2}{8} ->', 'L^2*w/8');
t('M_{max} := \\frac{10 \\cdot 6^2}{8} =', '45');
t('\\lim_{x \\to 0} \\frac{\\sin x}{x} ->', '1');

t(['b := 12 in', 'h := 24 in', 'S := b*h^2/6 ='], '1152 in^3');
t(['P := 50 kip', 'A := 10 in^2', 'P/A ='], '5 ksi', 'US units inferred');
t(['w := 2 kip/ft', 'L := 20 ft', 'w*L^2/8 ='], '100 kip*ft');
t(['b := 300 mm', 'h := 500 mm', 'b*h^3/12 ='], '3.125e9 mm^4');
t(['L := 6 m', 'd := 250 mm', 'L + d ='], '6.25 m');
t(['y(x) := a*x^2', 'a := 3', 'y(2) ='], '12', 'late binding');
t(['M(x) := w*L*x/2 - w*x^2/2', 'th(x) := int(M(x), x)/EI + C_1', 'y(x) := int(th(x), x) + C_2', 'c := solve([y(0) = 0, y(L) = 0], [C_1, C_2]) ->', 'd(x) := subs(y(x), C_1, c[1], C_2, c[2]) -> simplify', 'd(L/2) ->'], '-5*L^4*w/(384*EI)');
t(['M(x) := w*L*x/2 - w*x^2/2', 'th(x) := int(M(x), x)/EI + C_1', 'y(x) := int(th(x), x) + C_2', 'c := solve([y(0) = 0, y(L) = 0], [C_1, C_2]) ->', 'd(x) := subs(y(x), C_1, c[1], C_2, c[2]) -> simplify', 'w := 12 kN/m', 'L := 6 m', 'EI := 200 GPa * 8500 cm^4', 'd(L/2) = mm'], '-11.91 mm');
t(['K := [600, -200; -200, 200] kN/m', 'Mm := [20, 0; 0, 10] tonne', 'lam := eigenvals(inv(Mm)*K)', 'sqrt(lam[1]) ='], /1\/s/);
// Projectile-motion example: explicit multiplication must retain its dot
// after v_0 is substituted with the numeric quantity 25 m/s.
{
  const r = last(['v_0 := 25 m/s', 'theta := 40 deg', 't_f := 2*v_0*sin(theta)/g = s']);
  const ok = !r.err && !!r.subTex && /2\\cdot\s*25/.test(r.subTex) && !/225/.test(r.subTex);
  if (ok) pass++; else { fail++; console.log('FAIL projectile-motion substitution separator\\n   got: ' + JSON.stringify({ err: r.err, subTex: r.subTex, text: r.text })); }
}

// substituted-value display (the numeric answer remains unchanged)
t(['P := 2 MPa', 'D := 1000 mm', 't := 12 mm', 'sigma_h := P*D/(2*t) ='], '83.33 MPa', 'substituted formula numeric result');
{
  const r = last(['P := 2 MPa', 'D := 1000 mm', 't := 12 mm', 'sigma_h := P*D/(2*t) =']);
  const ok = !!r.subTex && ['2', '1000', '12', 'MPa', 'mm'].every(x => r.subTex.includes(x)) && !/\b(P|D|t)\b/.test(r.subTex);
  if (ok) pass++; else { fail++; console.log('FAIL substituted formula expansion\n   got:  ' + r.subTex); }
}
{
  const r = last(['P := 2 MPa', 'Q := 3*P', 'D := 1000 mm', 't := 12 mm', 'Q*D/(2*t) =']);
  const ok = !!r.subTex && ['2', '3', '1000', '12', 'MPa', 'mm'].every(x => r.subTex.includes(x)) && !/\b(P|Q|D|t)\b/.test(r.subTex);
  if (ok) pass++; else { fail++; console.log('FAIL nested substituted formula expansion\n   got:  ' + r.subTex); }
}
{
  const r = last('2 + 3 =');
  if (!r.subTex) pass++; else { fail++; console.log('FAIL unexpected substitution line: ' + r.subTex); }
}

// Unit conversion uses the stored numeric result and displays an explicit
// conversion factor, even if the original inputs are later redefined.
{
  const r = last([
    'P := 2 MPa', 'D := 1000 mm', 't := 12 mm',
    'sigma_h := P*D/(2*t) =',
    'P := 10 MPa', 'D := 2000 mm', 't := 20 mm',
    'sigma_h = psi'
  ]);
  const ok = !r.err && !!r.subTex &&
    /83\.33/.test(r.subTex) && /MPa/.test(r.subTex) &&
    /145\.038/.test(r.subTex) && /psi/.test(r.subTex) &&
    !/\b(P|D|t|sigma_h)\b/.test(r.subTex) &&
    /12086/.test(r.text);
  if (ok) pass++; else { fail++; console.log('FAIL conversion should use stored result and factor\\n   got: ' + JSON.stringify({ err: r.err, subTex: r.subTex, text: r.text })); }
}
// A conversion line should start from the stored displayed result, not
// repeat the original equation that produced it.
{
  const r = last(['P := 2 MPa', 'sigma_h := P*2 =', 'sigma_h = psi']);
  const ok = !r.err && !!r.subTex &&
    /4/.test(r.subTex) && /MPa/.test(r.subTex) &&
    /145/.test(r.subTex) && /psi/.test(r.subTex) &&
    !/\bP\b/.test(r.subTex) && !/2\s*MPa/.test(r.subTex);
  if (ok) pass++; else { fail++; console.log('FAIL conversion should use stored value and explicit factor\\n   got: ' + JSON.stringify({ err: r.err, subTex: r.subTex, text: r.text })); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
