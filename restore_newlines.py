import pathlib

p = pathlib.Path('frontend/src/components/experiments/AnalysisTab.tsx')
raw = p.read_text(encoding='utf-8')
print('Original length:', len(raw))
print('Lines before:', raw.count('\n'))

# The file has no newlines at all; it was squished by Set-Content -NoNewline
# We need to restore proper line breaks.
# Strategy: replace sequences of spaces used as line separators back to newlines.
# The original used 2-space indentation inside JSX, but all spaces are real spaces.
# Best approach: restore newlines before common TypeScript line-starting patterns.

import re

# Insert newline before common statement starters
# (This is a best-effort reformatter for this specific file pattern)
s = raw

# Before import statements (except the first)
s = re.sub(r'(?<=;)(?=import )', '\n', s)
# Before const/let/function/export/interface/type at top level
s = re.sub(r'(?<=;)(?=(const |let |function |export |interface |type |return |class ))', '\n', s)
# JSX comment blocks
s = s.replace('{/* ', '\n{/* ')
# After closing brace of top-level constructs
# This is risky so skip it

with open(p, 'w', encoding='utf-8', newline='\n') as f:
    f.write(s)
print('Done, new line count:', s.count('\n'))
