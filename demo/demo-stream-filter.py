#!/usr/bin/env python3
"""Live-render Claude Code --output-format stream-json as readable progress.

Reads NDJSON on stdin, prints human-friendly lines for the customer demo:
session start, tool uses ("  • Write app.py"), assistant text, and the final
cost/turn summary. Unknown or unparseable lines are ignored — the raw stream
is preserved separately via tee, so this filter is presentation-only and
tolerant of stream-format drift.
"""
import json
import sys


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue

        etype = event.get('type')
        if etype == 'system' and event.get('subtype') == 'init':
            print(f"[claude] session started (model: {event.get('model', '?')})", flush=True)
        elif etype == 'assistant':
            for block in (event.get('message') or {}).get('content') or []:
                btype = block.get('type')
                if btype == 'text':
                    text = (block.get('text') or '').strip()
                    if text:
                        print(f"\n{text}\n", flush=True)
                elif btype == 'tool_use':
                    name = block.get('name', '?')
                    inp = block.get('input') or {}
                    target = inp.get('file_path') or inp.get('path') or \
                        inp.get('command') or inp.get('pattern') or ''
                    target = str(target)
                    if len(target) > 80:
                        target = target[:77] + '...'
                    print(f"  • {name} {target}".rstrip(), flush=True)
        elif etype == 'result':
            cost = event.get('total_cost_usd', event.get('cost_usd'))
            turns = event.get('num_turns', '?')
            if isinstance(cost, (int, float)):
                print(f"\n[claude] done — {turns} turns, ${cost:.4f}", flush=True)
            else:
                print("\n[claude] done", flush=True)


if __name__ == '__main__':
    main()
