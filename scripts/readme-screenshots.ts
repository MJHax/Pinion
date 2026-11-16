// Retakes the README screenshots (docs/screenshots/chat.png and compare.png) in dark mode: `npm run screenshots`.
//
// Runs Pinion on a throwaway database with a fake Ollama serving fixed replies, sets the scenes up through the API,
// then captures each chat with headless Chrome at 1280 px wide and 2x scale. Your own data is never touched.
// Needs Google Chrome or Microsoft Edge (or CHROME_PATH), and port 11434 free: stop Ollama first if it is running.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFakeLocalServer } from '../test/fakeLocalServer';

const PORT = 3399;
const API = `http://127.0.0.1:${PORT}/api`;
const OUT = 'docs/screenshots';

const CHAT = `Here's a quick way to reverse words in a sentence with Python:

\`\`\`python
def reverse_words(sentence: str) -> str:
    return " ".join(reversed(sentence.split()))

print(reverse_words("hello local models"))
# -> "models local hello"
\`\`\`

**How it works**

1. \`split()\` breaks the sentence into words.
2. \`reversed()\` walks them back to front.
3. \`" ".join()\` glues them together again.

It runs entirely on your machine, so nothing leaves your network.`;

const QWEN = `Recursion is when a function solves a big problem by calling itself on a smaller piece of the same problem, again and again, until the piece is so small the answer is obvious.

It's like finding your seat in a dark cinema: you ask the person in front what row they're in, they ask the person in front of them, and so on until someone at the front says "row 1". Then the answers pass back: 2, 3, 4… until it reaches you.`;

const GEMMA = `Think of Russian nesting dolls. To find the tiny doll in the middle, you open a doll, and inside is… a smaller doll, so you do the same thing again. You keep going until you reach the one that doesn't open. That's recursion: **do the same step on a smaller version, and stop when there's nothing left to open.**`;

const LLAMA = `Recursion means a function calls itself.

Example: to count down from 5, say "5", then count down from 4. Keep going until you hit 0, then stop. The "stop at 0" part is called the **base case**, and without it the function would go on forever.`;

/** Words with their trailing space, so the reply streams like a real one. */
const words = (s: string) => s.match(/\S+\s*|\s+/g) ?? [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });
}

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome or Edge not found. Set CHROME_PATH to its executable.');
  return found;
}

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Sends a message and reads its reply stream to the end. */
async function send(chatId: string, body: object): Promise<void> {
  const res = await fetch(`${API}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok || text.includes('event: error')) throw new Error(`Sending to ${chatId} failed: ${text.slice(0, 500)}`);
}

async function waitFor<T>(what: string, check: () => Promise<T | null | undefined | false>, ms = 15_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = await check().catch(() => null);
    if (value) return value;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}.`);
    await sleep(250);
  }
}

async function newChat(): Promise<string> {
  return (await api<{ id: string }>('POST', '/chats')).id;
}

async function main() {
  if (await portInUse(11434)) throw new Error('Port 11434 is in use. Stop Ollama (or whatever is on it) and run this again.');
  if (await portInUse(PORT)) throw new Error(`Port ${PORT} is in use.`);
  const chrome = findChrome();

  const fake = await startFakeLocalServer({
    flavor: 'ollama',
    port: 11434,
    models: [
      { name: 'qwen3:8b', contextLength: 40960, tools: true, loaded: true, sizeBytes: 5_200_000_000 },
      { name: 'gemma3:12b', contextLength: 131072, vision: true, loadMs: 2100, sizeBytes: 8_100_000_000 },
      { name: 'llama3.2:3b', contextLength: 131072, tools: true, loaded: true, sizeBytes: 2_000_000_000 },
    ],
  });
  // Each model's replies in order; a chat's title comes from the model that answered first.
  fake.reply({ text: words(CHAT), completionTokens: 170, evalMs: 2125, promptTokens: 40 }, { model: 'qwen3:8b' });
  fake.reply({ text: ['Reverse words in Python'] }, { model: 'qwen3:8b' });
  fake.reply({ text: words(QWEN), completionTokens: 292, evalMs: 3650, promptTokens: 30 }, { model: 'qwen3:8b' });
  fake.reply({ text: ['Explaining recursion'] }, { model: 'qwen3:8b' });
  fake.reply({ text: words(GEMMA), completionTokens: 261, evalMs: 6070, promptTokens: 30 }, { model: 'gemma3:12b' });
  fake.reply({ text: words(LLAMA), completionTokens: 246, evalMs: 1783, promptTokens: 30 }, { model: 'llama3.2:3b' });

  const tmp = mkdtempSync(join(tmpdir(), 'pinion-screens-'));
  let server: ChildProcess | undefined;
  try {
    spawnSync(process.execPath, ['scripts/build-if-stale.mjs'], { stdio: 'inherit' });
    server = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
      env: { ...process.env, PINION_PORT: String(PORT), PINION_HOST: '127.0.0.1', PINION_DB: join(tmp, 'pinion.db'), OPENROUTER_API_KEY: '' },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    await waitFor('the Pinion server', () => api('GET', '/settings'));
    await api('PUT', '/settings', { theme: 'dark' });

    const models = await waitFor('the fake Ollama models', async () => {
      const { models: list } = await api<{ models: { id: string; name: string }[] }>('GET', '/local-servers/models');
      return list.length === 3 ? list : null;
    });
    const id = (name: string) => models.find((m) => m.name === name)!.id;
    for (const name of ['qwen3:8b', 'gemma3:12b', 'llama3.2:3b']) await api('POST', '/models', { id: id(name) });
    await api('PATCH', '/models', { id: id('qwen3:8b'), isDefault: true });

    const titled = (chatId: string, title: string) =>
      waitFor(`the title "${title}"`, async () => (await api<{ chat: { title: string } }>('GET', `/chats/${chatId}`)).chat.title === title);

    console.log('Setting up the chat…');
    const chatId = await newChat();
    await send(chatId, { content: 'How do I reverse the words in a sentence in Python?', modelId: id('qwen3:8b') });
    await titled(chatId, 'Reverse words in Python');

    console.log('Setting up the comparison…');
    const compareId = await newChat();
    await send(compareId, {
      content: 'Explain recursion so a 10-year-old would get it.',
      modelIds: [id('qwen3:8b'), id('gemma3:12b'), id('llama3.2:3b')],
    });
    await titled(compareId, 'Explaining recursion');

    const shot = (file: string, height: number, chat: string) => {
      const out = join(OUT, file);
      const r = spawnSync(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${join(tmp, 'chrome')}`,
        '--force-device-scale-factor=2', `--window-size=1280,${height}`, '--virtual-time-budget=10000',
        `--screenshot=${out}`, `http://127.0.0.1:${PORT}/#/chat/${chat}`,
      ], { stdio: 'ignore', timeout: 60_000 });
      if (r.status !== 0 || !existsSync(out)) throw new Error(`Chrome could not capture ${out}.`);
      console.log(`Saved ${out}`);
    };
    shot('chat.png', 800, chatId);
    shot('compare.png', 900, compareId);
  } finally {
    server?.kill();
    await fake.close();
    await sleep(500); // let the server let go of the database before it is removed
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
