from pathlib import Path
import re, json, hashlib
path = Path('evidence/native-r121/r150-fixtures/report-r150.pdf')
data = path.read_bytes()
assert data.startswith(b'%PDF-')
m = re.search(rb'startxref\s+(\d+)\s+%%EOF\s*$', data); assert m, 'startxref missing'
xref_off = int(m.group(1)); assert data[xref_off:xref_off+4] == b'xref'
x = data[xref_off:]; hm = re.match(rb'xref\s+0\s+(\d+)\s+', x); assert hm
count = int(hm.group(1)); entries=[]; lines=x.splitlines()[2:]
for i in range(count):
    mm=re.match(rb'(\d{10}) (\d{5}) ([nf])', lines[i]); assert mm, ('xref entry invalid', lines[i]); entries.append((int(mm.group(1)), mm.group(3)==b'n'))
objects={}
for mm in re.finditer(rb'(\d+) 0 obj\s*(.*?)\s*endobj', data, re.S): objects[int(mm.group(1))]=mm.group(2)
for i,(off,use) in enumerate(entries[1:],1):
    if use:
        assert data[off:off+len(f'{i} 0 obj'.encode())]==f'{i} 0 obj'.encode(), (i,off); assert i in objects
page_ids=[i for i,b in objects.items() if re.search(rb'/Type\s*/Page(?:\s|$)', b) and not re.search(rb'/Type\s*/Pages', b)]; page_ids.sort()
assert len(page_ids)==2, page_ids
texts=[]
for i in page_ids:
    body=objects[i]; cm=re.search(rb'/Contents\s+(\d+)\s+0\s+R', body); assert cm, (i,body[:100])
    content_obj=objects[int(cm.group(1))]; sm=re.search(rb'stream\r?\n(.*?)\r?\nendstream', content_obj, re.S); assert sm, ('stream missing', i)
    texts.append(b' '.join(re.findall(rb'\(([^)]*)\) Tj', sm.group(1))).decode('ascii'))
assert 'PAGE ONE' in texts[0]; assert 'PAGE TWO' in texts[1]
result={'file':str(path),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'startxref':xref_off,'pageCount':len(page_ids),'pageTexts':texts,'parser':'independent minimal PDF xref/page/content-stream parser (Python stdlib)'}
Path('evidence/native-r121/r150-fixtures/report-r150-validation.json').write_text(json.dumps(result,indent=2),encoding='utf8'); print(json.dumps(result,indent=2))
