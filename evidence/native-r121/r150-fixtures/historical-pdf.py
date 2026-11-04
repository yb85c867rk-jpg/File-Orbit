from pathlib import Path
import re, json, hashlib
p=Path('evidence/native-r121/r150-fixtures/historical-report-r149.pdf'); data=p.read_bytes()
try:
    m=re.search(rb'startxref\s+(\d+)\s+%%EOF\s*$', data)
    if not m: raise ValueError('startxref not found')
    result={'ok':True,'reason':'parsed'}
except Exception as e:
    result={'ok':False,'reason':str(e)}
result.update({'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'path':str(p)})
Path('evidence/native-r121/r150-fixtures/historical-pdf-status.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result,indent=2))
