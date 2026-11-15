import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[1]
AUDIT = Path(__file__).resolve().parent
def clean(text):
    env = AUDIT / '.env'
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            if '=' in line:
                key, value = line.split('=', 1)
                if ('PASSWORD' in key or key == 'SECRET_KEY') and value:
                    text = text.replace(value, '<REDACTED>')
    return text

def run(name, args, cwd=ROOT, timeout=1800):
    start = time.time()
    try:
        p = subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           timeout=timeout, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
        output, code = p.stdout.decode('utf-8', errors='replace'), p.returncode
    except subprocess.TimeoutExpired as e:
        output, code = (e.stdout or b'').decode('utf-8', errors='replace') + '\nTIMEOUT', 124
    except OSError as e:
        output, code = str(e), 127
    record = {'name': name, 'command': clean(subprocess.list2cmdline(args)), 'cwd': str(cwd),
              'exit_code': code, 'seconds': round(time.time()-start, 2),
              'time_utc': datetime.datetime.now(datetime.UTC).isoformat()}
    (AUDIT/'logs').mkdir(exist_ok=True)
    (AUDIT/'logs'/f'{name}.log').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n'+clean(output), encoding='utf-8')
    with (AUDIT/'commands.jsonl').open('a', encoding='utf-8') as f:
        f.write(json.dumps(record, ensure_ascii=False)+'\n')
    print(json.dumps(record, ensure_ascii=False))
    print(clean(output)[-10000:])
    return code

if __name__ == '__main__':
    sys.exit(run(sys.argv[1], sys.argv[2:]))
