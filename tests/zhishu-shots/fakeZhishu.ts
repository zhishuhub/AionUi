/**
 * A stand-in for the Zhishu website used by the store screenshots: the connect endpoint, the app
 * version endpoint and an OpenAI-compatible relay whose replies follow a fixed script.
 *
 * Every request is appended to `requests.jsonl` so a run shows what the agent actually sent
 * (tool names, schemas, prompts).
 */
import fs from 'fs';
import http from 'http';
import path from 'path';

type ToolDef = { type?: string; function?: { name?: string; parameters?: JsonSchema } };
type JsonSchema = { properties?: Record<string, unknown>; required?: string[] };
type ChatMessage = { role: string; content?: unknown; tool_calls?: unknown[] };
type ToolCall = { name: string; args: Record<string, unknown> };
type Reply = { text: string; calls: ToolCall[] };

export type FakeZhishu = {
  port: number;
  baseUrl: string;
  setImage: (png: Buffer) => void;
  /** Resolves once the scripted final answer of a scenario ('files' or 'image') has been sent. */
  waitForFinal: (scenario: 'files' | 'image', timeoutMs: number) => Promise<boolean>;
  hasFinal: (scenario: 'files' | 'image') => boolean;
  close: () => Promise<void>;
};

export type FakeZhishuOptions = {
  port: number;
  outDir: string;
  workspace: string;
  summaryMarkdown: string;
  finalAnswer: string;
};

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64'
);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === 'object' && 'text' in part ? String((part as { text: unknown }).text) : ''
      )
      .join('');
  }
  return '';
}

function toolName(tool: ToolDef): string {
  return tool.function?.name ?? '';
}

function pickTool(tools: ToolDef[], patterns: RegExp[]): ToolDef | undefined {
  for (const pattern of patterns) {
    const hit = tools.find((tool) => pattern.test(toolName(tool)));
    if (hit) return hit;
  }
  return undefined;
}

/** Fills a tool's arguments by matching its parameter names against the values we have. */
function fillArgs(
  tool: ToolDef,
  values: { path?: string; dir?: string; content?: string; command?: string; prompt?: string }
) {
  const schema = tool.function?.parameters ?? {};
  const args: Record<string, unknown> = {};
  for (const key of Object.keys(schema.properties ?? {})) {
    const lower = key.toLowerCase();
    if (/command|cmd|script/.test(lower) && values.command) args[key] = values.command;
    else if (/prompt|description/.test(lower) && values.prompt) args[key] = values.prompt;
    else if (/content|text|data|body/.test(lower) && values.content !== undefined) args[key] = values.content;
    else if (/dir|folder/.test(lower) && (values.dir || values.path)) args[key] = values.dir ?? values.path;
    else if (/path|file|target/.test(lower) && (values.path || values.dir)) args[key] = values.path ?? values.dir;
    else if (/pattern|glob/.test(lower)) args[key] = '*';
  }
  for (const key of schema.required ?? []) {
    if (!(key in args)) args[key] = values.path ?? values.dir ?? '';
  }
  return args;
}

function lastUserText(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') return textOf(messages[index].content);
  }
  return '';
}

function firstUserText(messages: ChatMessage[]): string {
  return textOf(messages.find((message) => message.role === 'user')?.content);
}

export async function startFakeZhishu(options: FakeZhishuOptions): Promise<FakeZhishu> {
  fs.mkdirSync(options.outDir, { recursive: true });
  const logFile = path.join(options.outDir, 'requests.jsonl');
  let image: Buffer = TINY_PNG;
  const finals = new Set<string>();
  const baseUrl = `http://127.0.0.1:${options.port}/v1`;

  const log = (entry: Record<string, unknown>) => {
    fs.appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  };

  const inquiryFiles = () =>
    fs
      .readdirSync(options.workspace)
      .filter((name) => name.endsWith('.txt'))
      .map((name) => path.join(options.workspace, name));

  /** The scripted turn for a chat request, decided by the conversation so far. */
  const script = (body: { messages?: ChatMessage[]; tools?: ToolDef[] }): Reply => {
    const messages = body.messages ?? [];
    const tools = body.tools ?? [];
    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => textOf(message.content))
      .join('\n');
    const ask = firstUserText(messages);
    const done = messages.filter((message) => message.role === 'assistant' && message.tool_calls?.length).length;

    if (!tools.length && /title|标题/i.test(system + lastUserText(messages))) {
      return { text: /画|海报|图/.test(ask) ? '新品宣传海报' : '客户询价汇总', calls: [] };
    }

    if (/询价/.test(ask)) {
      const list = pickTool(tools, [/^list_?dir/i, /list_directory/i, /^ls$/i, /^glob$/i]);
      const read = pickTool(tools, [/^read_?file$/i, /^read$/i, /read_many/i, /view/i]);
      const write = pickTool(tools, [/^write_?file$/i, /^write$/i, /create_file/i]);
      const shell = pickTool(tools, [/^(bash|shell|run_shell_command|execute_command|exec|terminal)$/i]);
      const files = inquiryFiles();
      const plan: Reply[] = [];
      if (list)
        plan.push({
          text: '我先看一下这个文件夹里有哪些询价。',
          calls: [{ name: toolName(list), args: fillArgs(list, { dir: options.workspace }) }],
        });
      else if (shell)
        plan.push({
          text: '我先看一下这个文件夹里有哪些询价。',
          calls: [{ name: toolName(shell), args: fillArgs(shell, { command: `ls "${options.workspace}"` }) }],
        });
      if (read)
        plan.push({
          text: '有 4 份询价，逐份读一下。',
          calls: files.map((file) => ({ name: toolName(read), args: fillArgs(read, { path: file }) })),
        });
      if (write) {
        plan.push({
          text: '信息齐了，整理成汇总表存到文件夹里。',
          calls: [
            {
              name: toolName(write),
              args: fillArgs(write, {
                path: path.join(options.workspace, '询价汇总.md'),
                content: options.summaryMarkdown,
              }),
            },
          ],
        });
      }
      if (done < plan.length) return plan[done];
      finals.add('files');
      return { text: options.finalAnswer, calls: [] };
    }

    if (/画|海报/.test(ask)) {
      const called = new Set(
        messages.flatMap((message) =>
          (message.tool_calls ?? []).map((call) =>
            String((call as { function?: { name?: string } }).function?.name ?? '')
          )
        )
      );
      const draw = tools.find((tool) => /image/i.test(toolName(tool)) && !/^ViewImage$/i.test(toolName(tool)));
      const search = pickTool(tools, [/^ToolSearch$/]);
      if (draw && !called.has(toolName(draw))) {
        return {
          text: '好的，按你的描述生成一张。',
          calls: [{ name: toolName(draw), args: fillArgs(draw, { prompt: ask, path: options.workspace }) }],
        };
      }
      if (!draw && search && !called.has(toolName(search))) {
        return { text: '', calls: [{ name: toolName(search), args: { query: 'image generation' } }] };
      }
      // A deferred tool found by ToolSearch: take its name from the search result.
      const found = messages
        .filter((message) => message.role === 'tool')
        .map((message) => textOf(message.content))
        .join('\n')
        .match(/([\w.-]*image[\w.-]*gen[\w.-]*|[\w.-]*generate[\w.-]*image[\w.-]*)/i)?.[1];
      if (!draw && found && !called.has(found)) {
        return { text: '好的，按你的描述生成一张。', calls: [{ name: found, args: { prompt: ask } }] };
      }
      finals.add('image');
      return { text: '海报已经生成好了，原图保存在当前工作区。需要换配色或者改文案可以直接告诉我。', calls: [] };
    }

    return { text: '好的，已经处理完了。', calls: [] };
  };

  const sendJson = (res: http.ServerResponse, status: number, payload: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const streamReply = async (res: http.ServerResponse, reply: Reply, includeUsage: boolean) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const id = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const chunk = (delta: Record<string, unknown>, finish: string | null, extra: Record<string, unknown> = {}) =>
      res.write(
        `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: 'chat', choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`
      );
    chunk({ role: 'assistant', content: '' }, null);
    const pieces = reply.text.match(/[\s\S]{1,8}/g) ?? [];
    for (const piece of pieces) {
      chunk({ content: piece }, null);
      await sleep(12);
    }
    reply.calls.forEach((call, index) => {
      chunk(
        {
          tool_calls: [
            {
              index,
              id: `call_${Date.now()}_${index}`,
              type: 'function',
              function: { name: call.name, arguments: JSON.stringify(call.args) },
            },
          ],
        },
        null
      );
    });
    chunk({}, reply.calls.length ? 'tool_calls' : 'stop');
    if (includeUsage) {
      res.write(
        `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: 'chat', choices: [], usage: { prompt_tokens: 1200, completion_tokens: 180, total_tokens: 1380 } })}\n\n`
      );
    }
    res.write('data: [DONE]\n\n');
    res.end();
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (data: Buffer) => chunks.push(data));
    req.on('end', () => {
      void (async () => {
        const raw = Buffer.concat(chunks);
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${options.port}`);
        let body: Record<string, unknown> = {};
        try {
          body =
            raw.length && String(req.headers['content-type'] ?? '').includes('json')
              ? JSON.parse(raw.toString('utf8'))
              : {};
        } catch {
          body = {};
        }
        log({ method: req.method, path: url.pathname, body: raw.length > 200_000 ? `<${raw.length} bytes>` : body });

        if (req.method === 'POST' && url.pathname === '/api/apps/connect') {
          return sendJson(res, 200, {
            success: true,
            data: { base_url: baseUrl, api_key: 'sk-zhishu-demo', models: ['chat', 'image'], user_name: '陈**' },
          });
        }
        if (req.method === 'GET' && url.pathname.startsWith('/api/apps/')) {
          return sendJson(res, 200, { success: true, data: { version: '2.2.2-zs.1' } });
        }
        if (req.method === 'GET' && url.pathname === '/v1/models') {
          return sendJson(res, 200, {
            object: 'list',
            data: [
              { id: 'chat', object: 'model' },
              { id: 'image', object: 'model' },
            ],
          });
        }
        if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
          const reply = script(body as { messages?: ChatMessage[]; tools?: ToolDef[] });
          log({ reply });
          if (body.stream) {
            const usage = Boolean((body.stream_options as { include_usage?: boolean } | undefined)?.include_usage);
            return streamReply(res, reply, usage);
          }
          return sendJson(res, 200, {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'chat',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: reply.text,
                  tool_calls: reply.calls.length
                    ? reply.calls.map((call, index) => ({
                        id: `call_${index}`,
                        type: 'function',
                        function: { name: call.name, arguments: JSON.stringify(call.args) },
                      }))
                    : undefined,
                },
                finish_reason: reply.calls.length ? 'tool_calls' : 'stop',
              },
            ],
            usage: { prompt_tokens: 1200, completion_tokens: 180, total_tokens: 1380 },
          });
        }
        if (
          req.method === 'POST' &&
          (url.pathname === '/v1/images/generations' || url.pathname === '/v1/images/edits')
        ) {
          return sendJson(res, 200, {
            created: Math.floor(Date.now() / 1000),
            data: [{ b64_json: image.toString('base64') }],
          });
        }
        sendJson(res, 404, { error: { message: `not handled: ${req.method} ${url.pathname}` } });
      })();
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port, '127.0.0.1', resolve));
  return {
    port: options.port,
    baseUrl,
    setImage: (png) => {
      image = png;
    },
    hasFinal: (scenario) => finals.has(scenario),
    waitForFinal: async (scenario, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (finals.has(scenario)) return true;
        await sleep(500);
      }
      return false;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
