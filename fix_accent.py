import pathlib
p = pathlib.Path('frontend/src/components/experiments/AnalysisTab.tsx')
raw = p.read_text(encoding='utf-8')
needle = 'accentColor="#1976d2"'
cnt = raw.count(needle)
print('Count:', cnt)
if cnt >= 2:
    idx = raw.index(needle)
    idx2 = raw.index(needle, idx + 1)
    print('First at:', idx, 'Second at:', idx2)
    replacement = 'accentColor="#9c27b0"'
    raw2 = raw[:idx2] + replacement + raw[idx2 + len(needle):]
    p.write_text(raw2, encoding='utf-8')
    print('Done - replaced second occurrence')
else:
    print('Could not find 2 occurrences')
