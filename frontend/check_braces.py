import re

with open('src/components/projects/ExpDeepEditDialog.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
depth = 0
func_start = None
func_depths = []

for i, line in enumerate(lines, 1):
    opens = line.count('{')
    closes = line.count('}')
    
    if 'function ExpDeepEditDialog' in line:
        func_start = i
        print(f'Function starts at line {i}, depth before={depth}')
    
    depth += opens - closes
    
    if func_start and i >= func_start:
        func_depths.append((i, depth))
    
    if func_start and depth == 0 and i > func_start:
        print(f'First depth=0 after function start at line {i}: {line.strip()[:60]}')
        break

print(f'Final depth: {depth}')
print(f'Total lines: {len(lines)}')
