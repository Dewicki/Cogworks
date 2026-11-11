# Cogworks

A browser puzzle game where you solve levels by **programming a network of small machines** in [Cog](https://github.com/Dewicki/Cog), a tiny language built for this game.

> Status: work in progress. The engine, 8 levels and a first playable browser UI are implemented. See [docs/DESIGN.md](docs/DESIGN.md).

## Idea

Each level gives you a grid of machines, input numbers on one side and an expected output on the other. You write a short Cog program for each machine, press Run and watch values flow between them. Fewer ticks, fewer lines and fewer machines mean a better score.

## Try the engine

Requires Node.js 22.18 or newer. Cog is the `cog-lang` dependency in `package.json`; for local development it points at a sibling checkout (`../Cog/Cog`), which must be built once (`npm run build` there) before `npm install` here.

```
node --test "test/*.test.ts"
```

## License

Code: MIT. Original art and levels: CC BY 4.0 (planned). Third-party assets are listed in CREDITS.md.
