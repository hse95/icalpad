# iCalPad
## edited to include calculation with substitute 
**A free and open-source symbolic calculator that runs in your browser.** Type equations anywhere on the page, use real units, get exact symbolic answers, plot and animate functions, and mark up pictures. No install, no account, no license fee.

### [▶ Open iCalPad](https://bhatthiman.github.io/icalpad/)

The whole app is **one HTML file of about 270 KB** (about 84 KB over the network). It opens in a second, works on a phone, and keeps your worksheet in your own browser.

> [!IMPORTANT]
> **Always check your answers.** iCalPad is a new tool and may contain errors. Verify any result before you rely on it, especially in design or other work where a mistake matters.

![iCalPad worksheet with symbolic answers, a plot and an annotated sketch](docs/media/hero.png)

## Why iCalPad

It's useful, no install, browser app. this fork is to provide some more features. For more details of Why this app, refer original owner's readme file.

- **Free-form page.** Click anywhere and type. Drag equations, notes, plots and pictures wherever you want them, like a calculation pad.
- **Real units.** `90 km/hr`, `200 GPa`, `5 kip*ft`. Units convert on their own, and adding a length to a force is caught as an error.
- **Exact symbolic answers.** End a line with `->` to simplify, expand, factor, differentiate, integrate, solve, take limits and series.
- **LaTeX in and out.** Paste LaTeX and it becomes live math. Copy any line, or the whole page, as LaTeX for a paper or report.
- **Plots you can animate.** Sweep a value over time or trace a curve as it is drawn.
- **Pictures with markup.** Drop or paste a photo of a problem, then draw arrows, scribbles and labels on it, and erase marks you don't want. Apple Pencil and other styluses draw directly on a selected picture.
- **Its own right-click menu.** Right-click anywhere to add math, notes, plots or pictures at that spot, paste, or copy LaTeX. Shift + right-click still opens the browser's menu.

## See it in action

### Type math anywhere, with units

Click a spot, type, and press Enter. Change an input and every result below it updates. Click any answer to show it in other units.

![Typing equations with units and changing an input](docs/media/units.gif)

### Exact answers with `->`

Integrals, equation solving, derivatives and limits in exact form. LaTeX pasted onto the page becomes a math line, and any line can be copied back out as LaTeX.

![Symbolic integration, solving and LaTeX paste](docs/media/symbolic.gif)

### Live and animated plots

Plots follow the worksheet, so changing an input redraws them. Press play to sweep a value, and hover to read values off a curve.

![A projectile example with a live plot and an animated sweep of launch angles](docs/media/plots.gif)

### Drop a picture, mark it up, solve next to it

Add a photo or screenshot of a problem, draw on it with the pen, arrow and label tools, and work the solution right beside it.

![Marking up a picture of a problem and solving it on the same page](docs/media/picture.gif)

## What you can type

| Type this | You get |
| --- | --- |
| `L := 6 m` | Define a value (typing `:` gives `:=`) |
| `w*L^2/8 =` | A number, with units |
| `v = mi/hr` | The same value in other units |
| `f(x) := x^2 + 1` | Your own function |
| `T <= 80` | A true/false check, shown as an OK or NG stamp |
| `int(x*sin(x), x) ->` | An exact answer |
| `(x+1)^3 -> expand` | Steer the answer with simplify, expand, factor or float |
| `solve(x^2 = 4, x) ->` | Solve an equation, or a list of equations |
| `diff(f, x)`, `int(f, x, a, b)`, `limit(f, x, 0)`, `taylor(f, x, 0, 4)` | Calculus |
| `A := [1, 2; 3, 4]`, `inv(A)`, `det(A)`, `lsolve(K, F)`, `eigenvals(A)` | Matrices, also with units |
| `\frac{w L^2}{8} =` | LaTeX works as input too |

Names can have subscripts and Greek letters (`sigma_max`, `theta`, `f'c`). The **?** button in the app lists everything.

## Two solvers

- **Built-in solver.** Always on, instant, and works offline. It handles everyday algebra, calculus, units and matrices.
- **Advanced solver (optional).** For harder integrals, nonlinear systems, differential equations and Laplace transforms, turn on the advanced solver from the top bar. It downloads [SymPy](https://www.sympy.org) running in [Pyodide](https://pyodide.org), about 20 MB once, and your browser keeps it for next time. Nothing is downloaded unless you ask for it.

## Examples included

Open **Examples** in the app for ready-made worksheets: a quick tour, a symbolic math tour, projectile motion with an animated angle sweep, deriving a formula symbolically and then plugging in numbers, a design check with OK/NG stamps, a two-mass spring system with matrices and eigenvalues, and a page of animated plots.

<p align="center"><img src="docs/media/dark.png" alt="Symbolic math tour in dark mode" width="64%">&nbsp;&nbsp;<img src="docs/media/phone.png" alt="iCalPad on a phone" width="33%"></p>

## What iCalPad is not

iCalPad is a young, single-file web app, and it does not try to match every feature of commercial packages. It does not open `.mcdx` or notebook files, it has no programming blocks, and its built-in solver covers common problems rather than every possible one.

**Check your answers.** iCalPad is provided as is, without any warranty. Check results by hand, with another tool, or against known cases before you use them, and it is the responsibility of the user to verify any result used in design. If you find a wrong answer, please report it so it can be fixed.

## Your data

Everything runs in your browser. Worksheets are saved in your browser's storage and can be saved to a `.json` file from the **File** menu. Nothing is sent to a server. The only outside requests are the web fonts and, if you turn it on, the advanced solver download.

## Run it offline or host it yourself

Download [`index.html`](index.html) and open it in any browser. That file is the whole app. To host your own copy, put it on any static web host.

## Build and test

The app is written as plain JavaScript in `src/` with no dependencies. The build joins those files into `index.html`.

```bash
npm run build        # writes index.html
npm test             # engine tests, every example worksheet, and a fuzz test
npm run test:solver  # advanced solver tests (needs python3 and sympy)
```

| Folder | Contents |
| --- | --- |
| `src/10-kernel.js` to `src/40-tex.js` | The math engine: expressions, algebra, calculus, units, parser, LaTeX typesetting |
| `src/45-bridge.js`, `src/bridge.py` | The link to the optional SymPy solver |
| `src/50-data.js` | Example worksheets and help text |
| `src/60-app.js`, `src/style.css`, `src/shell.html` | The interface |
| `test/` | Tests |

It has been tested in Chrome on desktop and on a phone-sized screen. If something does not work in your browser, please open an issue.

## Credits and feedback

iCalPad was created by **Sam Smith** (Kansas State University) and **Claude** (Claude Fable 5.2, by Anthropic). I built it to use it myself, and anyone else is free to use it as well.

Feedback is very welcome, especially from engineers. Please send suggestions and bug reports as [GitHub issues](https://github.com/hse95/icalpad/issues) or by email to **samsmith@ksu.edu**.

## License

iCalPad is free and open source under the [MIT License](LICENSE). You may use, copy, modify and share it, including for commercial work, as long as the license notice is kept. The software comes with no warranty.

Mathcad is a trademark of PTC Inc. Mathematica is a trademark of Wolfram Research, Inc. iCalPad is an independent project and is not affiliated with either company.
